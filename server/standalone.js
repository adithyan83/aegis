// AEGIS One Standalone Production HTTP Server
// KnightMaster Innovations Pvt. Ltd.
const http = require('http');
const path = require('path');
const fs = require('fs');
const { handleApiRequest } = require('./apiRouter.js');

const PORT = process.env.PORT || 3001;

const server = http.createServer(async (req, res) => {
  // Handle API routes
  if (req.url && req.url.startsWith('/api')) {
    const handled = await handleApiRequest(req, res);
    if (handled) return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[AEGIS Standalone Server] Running on http://localhost:${PORT}`);
  console.log(`[AEGIS Standalone Server] Emergency API Endpoint: http://localhost:${PORT}/api/emergency`);
});

module.exports = server;
