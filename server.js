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
    console.log(`--- [START] Fetching: ${type} ${id} (S${s}E${e}) ---`);
    
    try {
        // Step 1: Try Torrentio Scraper
        const scraperUrl = type === 'movie' 
            ? `https://torrentio.strem.fun/stream/movie/${id}.json`
            : `https://torrentio.strem.fun/stream/series/${id}:${s}:${e}.json`;
            
        let scraperRes = await axios.get(scraperUrl, { timeout: 8000 });
        let streams = scraperRes.data.streams || [];

        // Fallback: If Torrentio is empty, try a second community scraper (KnightCrawler)
        if (streams.length === 0) {
            console.log("--- [INFO] Torrentio empty, trying KnightCrawler ---");
            const fallbackUrl = type === 'movie'
                ? `https://knightcrawler.elfhosted.com/stream/movie/${id}.json`
                : `https://knightcrawler.elfhosted.com/stream/series/${id}:${s}:${e}.json`;
            const fbRes = await axios.get(fallbackUrl, { timeout: 8000 });
            streams = fbRes.data.streams || [];
        }

        const targetStream = streams[0];
        if (!targetStream) {
            return res.status(404).json({ error: 'No cached sources found.' });
        }

        const infoHash = targetStream.infoHash;

        // Step 2: Add Magnet using auth_token in URL (More reliable)
        const addRes = await axios.post(
            `https://api.real-debrid.com/rest/1.0/torrents/addMagnet?auth_token=${RD_KEY}`, 
            `magnet=magnet:?xt=urn:btih:${infoHash}`, 
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const torrentId = addRes.data.id;

        // Step 3: Select Files
        await axios.post(
            `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}?auth_token=${RD_KEY}`, 
            'files=all', 
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        // Step 4: Check if Cached and Get Link
        let downloadLink = null;
        for (let i = 0; i < 5; i++) {
            const infoRes = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}?auth_token=${RD_KEY}`);
            
            // If the status is 'downloaded', it means it's cached and ready instantly
            if (infoRes.data.links && infoRes.data.links.length > 0) {
                downloadLink = infoRes.data.links[0];
                break;
            }
            await new Promise(r => setTimeout(r, 1500));
        }

        if (!downloadLink) throw new Error("This source isn't cached. Try another title.");

        // Step 5: Unrestrict Link
        const unrestrictRes = await axios.post(
            `https://api.real-debrid.com/rest/1.0/unrestrict/link?auth_token=${RD_KEY}`, 
            `link=${downloadLink}`, 
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        console.log("--- [SUCCESS] Stream ready! ---");
        res.json({ streamUrl: unrestrictRes.data.download });

    } catch (err) {
        console.error("--- [DEBUG FAIL] ---", err.response ? err.response.data : err.message);
        res.status(500).json({ error: 'Source not reachable.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cinema Luxe: Port ${PORT}`));
