/**
 * Integration tests for Artifact Binary Content Routing
 * 
 * Tests the complete flow from artifact storage to content routing
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Runtime } from '../../src/platform/runtime.js';
import path from 'node:path';
import fs from 'node:fs/promises';

describe('Artifact Binary Routing Integration', () => {
  let runtime;
  let testDir;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test', '.tmp', `routing_test_${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Initialize runtime with test config
    runtime = new Runtime({
      config: {
        runtimeDir: path.join(testDir, 'runtime'),
        artifactsDir: path.join(testDir, 'artifacts'),
        promptsDir: path.join(process.cwd(), 'config', 'prompts'),
        logging: { level: 'error' }
      }
    });

    await runtime.init();
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it('should route text artifact correctly', async () => {
    // Store text artifact
    const textContent = 'Hello, this is plain text';
    const artifactRef = await runtime.artifacts.putArtifact({
      type: 'text',
      content: textContent
    });

    // Get artifact through routing
    const artifact = await runtime.artifacts.getArtifact(artifactRef);
    const result = await runtime.artifactContentRouter.routeContent(artifact, 'any-service');

    expect(result.routing).toBe('text');
    expect(result.contentType).toBe('text');
    expect(result.content).toBe(textContent);
  });

  it('should route image artifact with vision capability', async () => {
    // Create mock vision service
    const mockVisionService = {
      id: 'test-vision',
      capabilities: { input: ['text', 'vision'], output: ['text'] }
    };
    
    // Add to service registry (use _services internal Map)
    runtime.serviceRegistry._services = new Map([['test-vision', mockVisionService]]);

    // Store image artifact using saveUploadedFile (which properly sets mimeType)
    const imageData = Buffer.from('fake-image-data');
    const { artifactRef } = await runtime.artifacts.saveUploadedFile(imageData, {
      type: 'image',
      filename: 'test.jpg',
      mimeType: 'image/jpeg'
    });

    // Get artifact through routing
    const artifact = await runtime.artifacts.getArtifact(artifactRef);
    const result = await runtime.artifactContentRouter.routeContent(artifact, 'test-vision');

    expect(result.routing).toBe('image_url');
    expect(result.contentType).toBe('image');
    expect(result.imageUrl).toBeDefined();
    expect(result.imageUrl.type).toBe('image_url');
    expect(result.imageUrl.image_url.url).toContain('data:image/jpeg;base64,');
  });

  it('should degrade image artifact for text-only model', async () => {
    // Create mock text-only service
    const mockTextService = {
      id: 'test-text',
      capabilities: { input: ['text'], output: ['text'] }
    };
    
    runtime.serviceRegistry._services = new Map([['test-text', mockTextService]]);

    // Store image artifact using saveUploadedFile
    const imageData = Buffer.from('fake-image-data');
    const { artifactRef } = await runtime.artifacts.saveUploadedFile(imageData, {
      type: 'image',
      filename: 'photo.png',
      mimeType: 'image/png'
    });

    // Get artifact through routing
    const artifact = await runtime.artifacts.getArtifact(artifactRef);
    const result = await runtime.artifactContentRouter.routeContent(artifact, 'test-text');

    expect(result.routing).toBe('text');
    expect(result.contentType).toBe('image');
    expect(result.content).toContain('photo.png');
    expect(result.content).toContain('Binary Content Not Supported');
    expect(result.content).toContain('create_role');
    expect(result.content).toContain('llmServiceId');
  });

  it('should route PDF with file capability', async () => {
    // Create mock file service
    const mockFileService = {
      id: 'test-file',
      capabilities: { input: ['text', 'file'], output: ['text'] }
    };
    
    runtime.serviceRegistry._services = new Map([['test-file', mockFileService]]);

    // Store PDF artifact using saveUploadedFile
    const pdfData = Buffer.from('fake-pdf-data');
    const { artifactRef } = await runtime.artifacts.saveUploadedFile(pdfData, {
      type: 'document',
      filename: 'report.pdf',
      mimeType: 'application/pdf'
    });

    // Get artifact through routing
    const artifact = await runtime.artifacts.getArtifact(artifactRef);
    const result = await runtime.artifactContentRouter.routeContent(artifact, 'test-file');

    expect(result.routing).toBe('file');
    expect(result.contentType).toBe('binary');
    expect(result.file).toBeDefined();
    expect(result.file.type).toBe('file');
  });

  it('should handle null artifact gracefully', async () => {
    const result = await runtime.artifactContentRouter.routeContent(null, 'any-service');
    
    expect(result.routing).toBe('text');
    expect(result.content).toContain('Error');
  });
});
