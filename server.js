const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const app = express();

// 1. Direct Instruction: When someone visits "/", send the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Serve any other files (like images/CSS) from the main folder
app.use(express.static(__dirname));

// --- KEEP YOUR STREAM-SHIELD LOGIC BELOW THIS LINE ---
app.use('/stream-shield'
const path = require('path');
const app = express();

// This line tells the server to look in the main folder for index.html
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

// Port handling for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
