const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

// Pulls from Render Environment Variables
const RD_KEY = process.env.RD_KEY;
const TMDB_KEY = process.env.TMDB_KEY;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Sends the TMDB key to your frontend securely
app.get('/api/config', (req, res) => {
    res.json({ tmdb_key: TMDB_KEY });
});

app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    console.log(`--- Luxe Request: ${type} ${id} (S${s}E${e}) ---`);
    
    try {
        // Step 1: Find Magnet using Torrentio
        const scraperUrl = type === 'movie' 
            ? `https://torrentio.strem.fun/stream/movie/${id}.json`
            : `https://torrentio.strem.fun/stream/series/${id}:${s}:${e}.json`;
            
        const scraperRes = await axios.get(scraperUrl);
        const targetStream = (scraperRes.data.streams || [])[0];
        
        if (!targetStream) {
            return res.status(404).json({ error: 'No streams found' });
        }

        // Step 2: Add Magnet to Real-Debrid using InfoHash
        const addRes = await axios.post(
            'https://api.real-debrid.com/rest/1.0/torrents/addMagnet', 
            `magnet=magnet:?xt=urn:btih:${targetStream.infoHash}`, 
            { 
                headers: { 
                    'Authorization': `Bearer ${RD_KEY}`, 
                    'Content-Type': 'application/x-www-form-urlencoded' 
                } 
            }
        );

        const torrentId = addRes.data.id;

        // Step 3: Select all files
        await axios.post(
            `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, 
            'files=all', 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        // Step 4: Retry logic to wait for the link to be ready
        let downloadLink = null;
        for (let i = 0; i < 6; i++) { // Try for about 9 seconds
            const infoRes = await axios.get(
                `https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, 
                { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
            );

            if (infoRes.data.links && infoRes.data.links.length > 0) {
                downloadLink = infoRes.data.links[0];
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        if (!downloadLink) throw new Error("Stream took too long to initialize.");

        // Step 5: Unrestrict
        const unrestrictRes = await axios.post(
            'https://api.real-debrid.com/rest/1.0/unrestrict/link', 
            `link=${downloadLink}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        res.json({ streamUrl: unrestrictRes.data.download });

    } catch (err) {
        console.error("Luxe Error:", err.message);
        res.status(500).json({ error: 'Streaming service failed' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZonHD Luxe: Running on Port ${PORT}`));
