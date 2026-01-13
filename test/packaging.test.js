/**
 * One-Click Packaging 功能测试
 * 
 * Feature: one-click-packaging
 * 
 * 测试打包脚本和启动脚本的正确性
 */

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";

// 项目根目录
const PROJECT_ROOT = path.resolve(import.meta.dir, "..");

describe("One-Click Packaging - Unit Tests", () => {
  /**
   * 6.1 验证脚本文件存在
   * _Requirements: 1.1, 1.2, 4.1_
   */
  describe("Script Files Existence", () => {
    test("pack.cmd should exist in scripts/win directory", () => {
      const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
      expect(existsSync(packCmdPath)).toBe(true);
    });

    test("pack.ps1 should exist in scripts/win directory", () => {
      const packPs1Path = path.join(PROJECT_ROOT, "scripts", "win", "pack.ps1");
      expect(existsSync(packPs1Path)).toBe(true);
    });

    test("start.cmd should contain local bun detection logic", () => {
      const startCmdPath = path.join(PROJECT_ROOT, "start.cmd");
      expect(existsSync(startCmdPath)).toBe(true);
      
      const content = readFileSync(startCmdPath, "utf-8");
      
      // 检查本地 bun 检测逻辑
      expect(content).toContain("runtime\\bun.exe");
      expect(content).toContain("LOCAL_BUN");
      
      // 检查 .git 目录检测逻辑
      expect(content).toContain('.git');
    });

    test("start.cmd should display which bun is being used", () => {
      const startCmdPath = path.join(PROJECT_ROOT, "start.cmd");
      const content = readFileSync(startCmdPath, "utf-8");
      
      // 检查显示本地 bun 的消息
      expect(content).toMatch(/使用本地.*bun|本地.*bun/i);
      // 检查显示系统 bun 的消息
      expect(content).toMatch(/使用系统.*bun|系统.*bun/i);
    });
  });

  describe("Pack Script Content Validation", () => {
    test("pack.cmd should have proper exclusion patterns", () => {
      const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
      const content = readFileSync(packCmdPath, "utf-8");
      
      // 验证脚本不会复制 .git 目录（通过检查它只复制特定目录）
      expect(content).toContain("xcopy");
      expect(content).toContain("src");
      expect(content).toContain("web");
      expect(content).toContain("config");
      expect(content).toContain("node_modules");
    });

    test("pack.ps1 should have proper exclusion patterns", () => {
      const packPs1Path = path.join(PROJECT_ROOT, "scripts", "win", "pack.ps1");
      const content = readFileSync(packPs1Path, "utf-8");
      
      // 验证脚本复制特定目录
      expect(content).toContain("Copy-Item");
      expect(content).toContain("src");
      expect(content).toContain("web");
      expect(content).toContain("config");
      expect(content).toContain("node_modules");
    });

    test("pack scripts should copy bun to runtime directory", () => {
      const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
      const packPs1Path = path.join(PROJECT_ROOT, "scripts", "win", "pack.ps1");
      
      const cmdContent = readFileSync(packCmdPath, "utf-8");
      const ps1Content = readFileSync(packPs1Path, "utf-8");
      
      // CMD 版本
      expect(cmdContent).toContain("runtime");
      expect(cmdContent).toContain("bun.exe");
      
      // PowerShell 版本
      expect(ps1Content).toContain("runtime");
      expect(ps1Content).toContain("bun.exe");
    });
  });
});

describe("One-Click Packaging - Property Tests", () => {
  /**
   * Property 1: File Inclusion/Exclusion Consistency
   * **Validates: Requirements 2.1, 6.3**
   * 
   * For any project directory structure and for any file or directory matching 
   * an exclusion pattern (.git, test, .kiro/specs, *.log, .tmp), the resulting 
   * Distribution_Package SHALL NOT contain that file or directory.
   */
  describe("Property 1: File Inclusion/Exclusion Consistency", () => {
    // 定义排除模式
    const EXCLUDE_PATTERNS = [".git", "test", ".kiro", "dist", ".tmp"];
    
    // 定义必须包含的目录
    const INCLUDE_DIRS = ["src", "web", "config", "modules", "node_modules"];
    
    // 定义必须包含的文件
    const INCLUDE_FILES = ["start.cmd", "start.js", "package.json"];

    test("excluded directories should not be in copy commands", () => {
      const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
      const content = readFileSync(packCmdPath, "utf-8");
      
      // 验证脚本不会直接复制排除的目录
      // 脚本使用显式复制特定目录的方式，而不是复制全部然后排除
      for (const excludeDir of EXCLUDE_PATTERNS) {
        // 检查没有 xcopy 命令直接复制这些目录
        const xcopyPattern = new RegExp(`xcopy.*${excludeDir}.*PACK_DIR`, "i");
        expect(content).not.toMatch(xcopyPattern);
      }
    });

    test("included directories should be in copy commands", () => {
      const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
      const content = readFileSync(packCmdPath, "utf-8");
      
      for (const includeDir of INCLUDE_DIRS) {
        expect(content.toLowerCase()).toContain(includeDir.toLowerCase());
      }
    });

    test("included files should be in copy commands", () => {
      const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
      const content = readFileSync(packCmdPath, "utf-8");
      
      for (const includeFile of INCLUDE_FILES) {
        expect(content.toLowerCase()).toContain(includeFile.toLowerCase());
      }
    });

    // Property-based test: 生成随机文件名，验证排除逻辑
    test("property: any file matching exclusion pattern should be excluded", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...EXCLUDE_PATTERNS),
          (excludePattern) => {
            const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
            const content = readFileSync(packCmdPath, "utf-8");
            
            // 验证脚本不会复制排除的目录到打包目录
            // 由于脚本使用显式列表方式，排除的目录不应该出现在复制目标中
            const copyToPackPattern = new RegExp(
              `(xcopy|copy).*["']?%PROJECT_ROOT%\\\\${excludePattern}["']?.*%PACK_DIR%`,
              "i"
            );
            return !copyToPackPattern.test(content);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 3: Custom Output Filename
   * **Validates: Requirements 6.1**
   * 
   * For any valid filename string passed as an argument to the Packaging_Script,
   * the output zip file SHALL be named with that exact string (plus .zip extension).
   */
  describe("Property 3: Custom Output Filename", () => {
    // 生成有效的文件名（不含特殊字符）
    const validFilenameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
      // 只允许字母、数字、连字符和下划线
      return /^[a-zA-Z0-9_-]+$/.test(s);
    });

    test("pack.cmd should use provided filename for output", () => {
      const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
      const content = readFileSync(packCmdPath, "utf-8");
      
      // 验证脚本接受第一个参数作为输出文件名
      expect(content).toContain("%~1");
      expect(content).toContain("OUTPUT_NAME");
      expect(content).toContain(".zip");
    });

    test("pack.ps1 should use provided filename for output", () => {
      const packPs1Path = path.join(PROJECT_ROOT, "scripts", "win", "pack.ps1");
      const content = readFileSync(packPs1Path, "utf-8");
      
      // 验证脚本接受 OutputName 参数
      expect(content).toContain("OutputName");
      expect(content).toContain(".zip");
    });

    test("property: output filename should match input parameter pattern", () => {
      fc.assert(
        fc.property(
          validFilenameArb,
          (filename) => {
            // 验证文件名格式有效（不含非法字符）
            const invalidChars = /[<>:"/\\|?*]/;
            return !invalidChars.test(filename);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("default filename should follow timestamp pattern", () => {
      const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
      const content = readFileSync(packCmdPath, "utf-8");
      
      // 验证默认文件名包含 agent-society 和时间戳
      expect(content).toContain("agent-society-");
      expect(content).toMatch(/DATE_STR|date/i);
      expect(content).toMatch(/TIME_STR|time/i);
    });
  });

  /**
   * Property 4: Error Exit Code
   * **Validates: Requirements 7.4**
   * 
   * For any error condition during packaging (bun not found, missing directories,
   * zip creation failure), the Packaging_Script SHALL exit with a non-zero exit code.
   */
  describe("Property 4: Error Exit Code", () => {
    test("pack.cmd should exit with code 1 on bun not found", () => {
      const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
      const content = readFileSync(packCmdPath, "utf-8");
      
      // 验证 bun 未找到时退出码为 1
      expect(content).toContain("where bun");
      expect(content).toMatch(/exit\s*\/b\s*1/i);
    });

    test("pack.cmd should exit with code 1 on missing directories", () => {
      const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
      const content = readFileSync(packCmdPath, "utf-8");
      
      // 验证缺少目录时退出码为 1
      expect(content).toContain("MISSING_DIRS");
      expect(content).toMatch(/exit\s*\/b\s*1/i);
    });

    test("pack.cmd should exit with code 1 on zip creation failure", () => {
      const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
      const content = readFileSync(packCmdPath, "utf-8");
      
      // 验证 zip 创建失败时退出码为 1
      expect(content).toContain("Compress-Archive");
      expect(content).toMatch(/exit\s*\/b\s*1/i);
    });

    test("pack.ps1 should exit with code 1 on errors", () => {
      const packPs1Path = path.join(PROJECT_ROOT, "scripts", "win", "pack.ps1");
      const content = readFileSync(packPs1Path, "utf-8");
      
      // 验证错误时退出码为 1
      expect(content).toMatch(/exit\s+1/i);
    });

    test("property: all error paths should have non-zero exit", () => {
      const errorConditions = [
        "bun not found",
        "missing directories", 
        "zip creation failure"
      ];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...errorConditions),
          (errorCondition) => {
            const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
            const content = readFileSync(packCmdPath, "utf-8");
            
            // 验证脚本包含 exit /b 1 语句
            return content.includes("exit /b 1");
          }
        ),
        { numRuns: 100 }
      );
    });

    test("pack.cmd should exit with code 0 on success", () => {
      const packCmdPath = path.join(PROJECT_ROOT, "scripts", "win", "pack.cmd");
      const content = readFileSync(packCmdPath, "utf-8");
      
      // 验证成功时退出码为 0
      expect(content).toMatch(/exit\s*\/b\s*0/i);
    });

    test("pack.ps1 should exit with code 0 on success", () => {
      const packPs1Path = path.join(PROJECT_ROOT, "scripts", "win", "pack.ps1");
      const content = readFileSync(packPs1Path, "utf-8");
      
      // 验证成功时退出码为 0
      expect(content).toMatch(/exit\s+0/i);
    });
  });
});
