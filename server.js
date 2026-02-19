const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const app = express();

// Serve all static files including IMG_8035.jpeg
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Stream Shield to prevent black screen and unmuted playback issues
app.use('/stream-shield', (req, res, next) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('No URL provided');
    return createProxyMiddleware({
        target: targetUrl,
        changeOrigin: true,
        onProxyRes: function (proxyRes) {
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
        }
    })(req, res, next);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZonHD Server: Running on Port ${PORT}`));
