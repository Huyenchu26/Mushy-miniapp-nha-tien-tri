import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vercel auto-set process.env.VERCEL_ENV ('production' | 'preview' | 'development')
// khi build trên Vercel — KHÔNG cần thêm env var tay. Local dev không có →
// fallback 'development' để mini-app query schema dev (an toàn, không touch prod).
const vercelEnv = process.env.VERCEL_ENV || 'development';

export default defineConfig({
  plugins: [react(), mushyApiDevPlugin()],
  server: {
    host: true,
    port: 5173,
  },
  define: {
    __VERCEL_ENV__: JSON.stringify(vercelEnv),
  },
});

function mushyApiDevPlugin() {
  return {
    name: 'mushy-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/live-scores', async (req, res) => {
        try {
          const { default: handler } = await import('./api/live-scores.js');
          await handler(req, createVercelLikeResponse(res));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'api_dev_error' }));
        }
      });
    },
  };
}

function createVercelLikeResponse(res) {
  return {
    setHeader(name, value) {
      res.setHeader(name, value);
      return this;
    },
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(payload) {
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
      return this;
    },
  };
}
