const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const app = express();

// This forces the server to look in the main folder for index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Error: The server cannot find your index.html file in the root folder.');
    }
  });
});

app.use(express.static(__dirname));

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
app.listen(PORT, () => console.log('ZonHD Server Active'));
