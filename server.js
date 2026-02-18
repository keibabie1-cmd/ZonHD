const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const app = express();

// This forces the server to send index.html if it's in the same folder as server.js
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});

// This handles any other images or files
app.use(express.static(__dirname));

// Your Stream Shield Proxy
app.use('/stream-shield', (req, res, next) => {
  const targetUrl = req.query.url; 
  if (!targetUrl) return res.status(400).send('No URL provided');
  return createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    ignorePath: true,
    onProxyRes: function (proxyRes) {
      delete proxyRes.headers['x-frame-options'];
      delete proxyRes.headers['content-security-policy'];
      proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      proxyRes.headers['Permissions-Policy'] = 'autoplay=(self), fullscreen=(self)';
    }
  })(req, res, next);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server active on port ${PORT}`));
