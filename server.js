const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');
const app = express();

// 1. Debugger: Log exactly what files are in the folder
const files = fs.readdirSync(__dirname);
console.log("Current Files in Root:", files);

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  
  // Check if file exists before sending
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`Server Error: index.html not found. Files present: ${files.join(', ')}`);
  }
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
app.listen(PORT, () => console.log(`Diagnostic Server Live on ${PORT}`));
