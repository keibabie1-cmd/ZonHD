const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const app = express();

// 1. Force the server to send index.html for the root path
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});

// 2. Serve static assets (images/styles) from the current folder
app.use(express.static(__dirname));

// 3. Keep the Stream Shield Proxy
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

// Use port 10000 for Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`ZonHD active on port ${PORT}`));
