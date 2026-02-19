// 1. IMPORT TOOLS FIRST
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const path = require('path');

// 2. INITIALIZE THE APP (Crucial: Define 'app' before using it)
const app = express();

// 3. YOUR SETTINGS & TOKEN
const RD_KEY = 'MQKVSO7O2CYHOGVO6LAXR7H3ADRQADZDMZF2FT4S6ZNJECAM7PWQ';

// 4. SERVE STATIC FILES (Images, CSS, index.html)
app.use(express.static(__dirname));

// 5. LANDING PAGE
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * LUXE STREAMING ROUTE
 * Fetches magnets from Torrentio and unrestricts them via Real-Debrid.
 */
app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    console.log(`--- Luxe Request: ${type} ${id} (Season ${s}, Episode ${e}) ---`);
    
    try {
        // Step 1: Find Magnet Links using Torrentio Scraper
        const scraperUrl = type === 'movie' 
            ? `https://torrentio.strem.fun/stream/movie/${id}.json`
            : `https://torrentio.strem.fun/stream/series/${id}:${s}:${e}.json`;
            
        const scraperRes = await axios.get(scraperUrl);
        const targetStream = (scraperRes.data.streams || [])[0];
        
        if (!targetStream) {
            console.log("Luxe Status: No magnet links found for this title.");
            return res.status(404).json({ error: 'No high-quality streams found' });
        }

        // Step 2: Add Magnet to Real-Debrid Account
        const addRes = await axios.post('https://api.real-debrid.com/rest/1.0/torrents/addMagnet', 
            `magnet=${targetStream.infoHash}`, 
            { headers: { 
                'Authorization': `Bearer ${RD_KEY}`, 
                'Content-Type': 'application/x-www-form-urlencoded' 
            }}
        );

        const torrentId = addRes.data.id;

        // Step 3: Select Files (Instantly unlocks cached files)
        await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, 'files=all', 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        // Step 4: Get Torrent Information for Download Links
        const infoRes = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        const downloadLink = infoRes.data.links[0];

        // Step 5: Unrestrict (Unlock) the Link for Streaming
        const unrestrictRes = await axios.post('https://api.real-debrid.com/rest/1.0/unrestrict/link', 
            `link=${downloadLink}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        console.log("Luxe Status: Success! Link unlocked for playback.");
        res.json({ streamUrl: unrestrictRes.data.download });

    } catch (err) {
        // Log detailed error for debugging in Render
        if (err.response) {
            console.error("Luxe Error (RD API):", err.response.status, err.response.data);
        } else {
            console.error("Luxe Error (System):", err.message);
        }
        res.status(500).json({ error: 'Streaming service failed' });
    }
});

// 6. START THE SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZonHD Luxe Engine: Active on Port ${PORT}`));
