const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

const RD_KEY = process.env.RD_KEY;
const TMDB_KEY = process.env.TMDB_KEY;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/config', (req, res) => {
    res.json({ tmdb_key: TMDB_KEY });
});

app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    console.log(`--- [DEBUG] Request: ${type} ${id} (S${s}E${e}) ---`);
    
    try {
        // Step 1: Torrentio Scraper
        const scraperUrl = type === 'movie' 
            ? `https://torrentio.strem.fun/stream/movie/${id}.json`
            : `https://torrentio.strem.fun/stream/series/${id}:${s}:${e}.json`;
            
        const scraperRes = await axios.get(scraperUrl);
        const targetStream = (scraperRes.data.streams || [])[0];
        
        if (!targetStream) {
            console.error("--- [DEBUG] No magnets found on Torrentio ---");
            return res.status(404).json({ error: 'No streams found' });
        }

        // Step 2: Add to RD
        console.log("--- [DEBUG] Adding Magnet to RD ---");
        const addRes = await axios.post(
            'https://api.real-debrid.com/rest/1.0/torrents/addMagnet', 
            `magnet=magnet:?xt=urn:btih:${targetStream.infoHash}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const torrentId = addRes.data.id;

        // Step 3: Select all files
        await axios.post(
            `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, 
            'files=all', 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        // Step 4: Wait for RD link (5 tries, 1.5s apart)
        let downloadLink = null;
        for (let i = 0; i < 5; i++) {
            const infoRes = await axios.get(
                `https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, 
                { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
            );
            if (infoRes.data.links && infoRes.data.links.length > 0) {
                downloadLink = infoRes.data.links[0];
                break;
            }
            await new Promise(res => setTimeout(res, 1500));
        }

        if (!downloadLink) throw new Error("RD link not generated in time");

        // Step 5: Unrestrict
        console.log("--- [DEBUG] Unrestricting RD link ---");
        const unrestrictRes = await axios.post(
            'https://api.real-debrid.com/rest/1.0/unrestrict/link', 
            `link=${downloadLink}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        res.json({ streamUrl: unrestrictRes.data.download });

    } catch (err) {
        // This will print the exact error to your Render dashboard logs
        console.error("--- [ERROR] Luxe Backend Fail:", err.response ? err.response.data : err.message);
        res.status(500).json({ error: 'Service fail' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZonHD Running on Port ${PORT}`));
