const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const path = require('path');
const app = express();

const RD_KEY = 'MQKVSO7O2CYHOGVO6LAXR7H3ADRQADZDMZF2FT4S6ZNJECAM7PWQ';

// Static files (Images, CSS, etc.)
app.use(express.static(__dirname));

// Main Landing Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * NEW: LUXE STREAMING ROUTE (Real-Debrid + Scraper)
 * This finds a high-quality magnet and "unlocks" it using your key.
 */
app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    
    try {
        // 1. Scrape for magnets using Torrentio
        const scraperUrl = type === 'movie' 
            ? `https://torrentio.strem.fun/stream/movie/${id}.json`
            : `https://torrentio.strem.fun/stream/series/${id}:${s}:${e}.json`;
            
        const scraperRes = await axios.get(scraperUrl);
        const streams = scraperRes.data.streams || [];
        
        // Find the first high-quality link
        const targetStream = streams[0];
        if (!targetStream) return res.status(404).json({ error: 'No high-quality streams found' });

        // 2. Add Magnet to Real-Debrid
        const addRes = await axios.post('https://api.real-debrid.com/rest/1.0/torrents/addMagnet', 
            `magnet=${targetStream.infoHash}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const torrentId = addRes.data.id;

        // 3. Select all files (RD will automatically find the main video)
        await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, 
            'files=all', 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        // 4. Get the direct link
        const infoRes = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        const downloadLink = infoRes.data.links[0];

        // 5. Unrestrict (Unlock) the link for instant play
        const unrestrictRes = await axios.post('https://api.real-debrid.com/rest/1.0/unrestrict/link', 
            `link=${downloadLink}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        res.json({ streamUrl: unrestrictRes.data.download });

    } catch (err) {
        console.error("Luxe Error:", err.message);
        res.status(500).json({ error: 'Streaming service temporarily unavailable' });
    }
});

// ORIGINAL: Stream Shield (Backup for old links)
app.use('/stream-shield', (req, res, next) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('No URL provided');
    return createProxyMiddleware({
        target: targetUrl,
        changeOrigin: true,
        onProxyRes: (proxyRes) => {
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
        }
    })(req, res, next);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZonHD Luxe: Port ${PORT}`));
