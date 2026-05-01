import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, normalize } from 'path';
import fs from 'fs';

// project root is the worktree root (4 levels up from web/)
const PROJECT_ROOT = resolve(__dirname, '..');
const OUTPUTS_DIR = resolve(PROJECT_ROOT, 'outputs');

// dev middleware: serve files from <project-root>/outputs at /outputs/*
function serveOutputs() {
  return {
    name: 'serve-outputs',
    configureServer(server) {
      server.middlewares.use('/outputs', (req, res, next) => {
        const url = (req.url || '/').split('?')[0];
        const filePath = normalize(resolve(OUTPUTS_DIR, '.' + url));
        if (!filePath.startsWith(OUTPUTS_DIR)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.statusCode = 404;
            res.end('not found');
            return;
          }
          const ext = filePath.split('.').pop();
          const types = { json: 'application/json', png: 'image/png' };
          res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(data);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveOutputs()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
});
