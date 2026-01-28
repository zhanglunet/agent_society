import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function serveModelsPlugin(): Plugin {
  const prefix = '/models/';
  const modelsDir = path.resolve(__dirname, 'models');

  const attach = (middlewares: { use: (fn: any) => void }) => {
    middlewares.use((req: any, res: any, next: any) => {
      if (!req.url || !req.url.startsWith(prefix)) return next();
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();

      const urlPath = (req.url.split('?')[0] ?? '') as string;
      const rel = decodeURIComponent(urlPath.slice(prefix.length));
      const abs = path.resolve(modelsDir, rel);
      if (!abs.startsWith(modelsDir + path.sep)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      fs.stat(abs, (err, stat) => {
        if (err || !stat.isFile()) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }

        const totalSize = stat.size;
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

        const range = req.headers.range;
        if (range && typeof range === 'string') {
          const m = range.match(/^bytes=(\d+)-(\d*)$/);
          if (!m) {
            res.statusCode = 416;
            res.end('Range Not Satisfiable');
            return;
          }
          const start = Number(m[1]);
          const end = m[2] ? Number(m[2]) : totalSize - 1;
          if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= totalSize) {
            res.statusCode = 416;
            res.end('Range Not Satisfiable');
            return;
          }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
          res.setHeader('Content-Length', String(end - start + 1));
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          fs.createReadStream(abs, { start, end }).pipe(res);
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Length', String(totalSize));
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        fs.createReadStream(abs).pipe(res);
      });
    });
  };

  return {
    name: 'serve-models',
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serveModelsPlugin()],
  server: {
    port: 5175,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
