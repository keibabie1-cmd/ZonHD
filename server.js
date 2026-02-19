const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const path = require('path');
const app = express();

const RD_KEY = 'MQKVSO7O2CYHOGVO6LAXR7H3ADRQADZDMZF2FT4S6ZNJECAM7PWQ';

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * FAILOVER SCRAPER LOGIC
 * Tries Torrentio first, then Comet as a backup.
 */
async function findMagnet(type, id, s, e) {
    const scrapers = [
        // Torrentio (Standard)
        type === 'movie' 
            ? `https://torrentio.strem.fun/stream/movie/${id}.json`
            : `https://torrentio.strem.fun/stream/series/${id}:${s}:${e}.json`,
        // Comet (High-Speed Backup)
        type === 'movie'
            ? `https://comet.elfhosted.com/stream/movie/${id}.json`
            : `https://comet.elfhosted.com/stream/series/${id}:${s}:${e}.json`
    ];

    for (let url of scrapers) {
        try {
            console.log(`Luxe Scraper: Trying ${new URL(url).hostname}...`);
            const res = await axios.get(url, { timeout: 5000 });
            const stream = (res.data.streams || [])[0];
            if (stream) {
                console.log(`Luxe Scraper: Success on ${new URL(url).hostname}`);
                return stream;
            }
        } catch (err) {
            console.error(`Luxe Scraper: ${new URL(url).hostname} failed.`);
        }
    }
    return null;
}

app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    
    try {
        const targetStream = await findMagnet(type, id, s, e);
        
        if (!targetStream) {
            return res.status(404).json({ error: 'No links found on any scraper' });
        }

        // Real-Debrid Logic
        const addRes = await axios.post('https://api.real-debrid.com/rest/1.0/torrents/addMagnet', 
            `magnet=${targetStream.infoHash || targetStream.url}`, 
            { headers: { 
                'Authorization': `Bearer ${RD_KEY}`, 
                'Content-Type': 'application/x-www-form-urlencoded' 
            }}
        );

        const torrentId = addRes.data.id;
        await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, 'files=all', 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        const infoRes = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        const downloadLink = infoRes.data.links[0];
        const unrestrictRes = await axios.post('https://api.real-debrid.com/rest/1.0/unrestrict/link', 
            `link=${downloadLink}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        res.json({ streamUrl: unrestrictRes.data.download });

    } catch (err) {
        if (err.response) {
            // Detailed RD Error Logging
            console.error(`RD API ERROR [${err.response.status}]:`, err.response.data);
            if (err.response.status === 401) console.error("FIX: Refresh your RD API Token.");
            if (err.response.status === 403) console.error("FIX: Check Premium status or IP limits.");
        } else {
            console.error("SYSTEM ERROR:", err.message);
        }
        res.status(500).json({ error: 'Streaming service failed' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZonHD Luxe: Running on Port ${PORT}`));
