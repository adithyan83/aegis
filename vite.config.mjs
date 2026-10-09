import { defineConfig } from 'vite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { handleApiRequest } = require('./server/apiRouter.js');

export default defineConfig({
  plugins: [
    {
      name: 'aegis-api-backend',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api')) {
            try {
              const handled = await handleApiRequest(req, res);
              if (handled) return;
            } catch (err) {
              console.error('[Vite-API-Error]', err);
              if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal API Server Error' }));
              }
              return;
            }
          }
          next();
        });
      }
    }
  ],
  server: {
    port: 3000,
    host: true
  }
});
