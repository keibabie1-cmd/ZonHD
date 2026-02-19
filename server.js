const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

const RD_KEY = process.env.RD_KEY;
const TMDB_KEY = process.env.TMDB_KEY;

// Stealth headers to bypass bot-detection
const sharkHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
};

app.use(express.static(__dirname));

app.get('/api/config', (req, res) => res.json({ tmdb_key: TMDB_KEY }));

app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    console.log(`--- [HUNTER MODE] Seeking cached source for: ${id} ---`);
    
    try {
        // 1. Gather all possible magnets from multiple scrapers
        const scraperUrls = [
            `https://torrentio.strem.fun/stream/${type}/${type === 'movie' ? id : id + ':' + s + ':' + e}.json`,
            `https://knightcrawler.elfhosted.com/stream/${type}/${type === 'movie' ? id : id + ':' + s + ':' + e}.json`
        ];

        let allStreams = [];
        for (const url of scraperUrls) {
            try {
                const response = await axios.get(url, { headers: sharkHeaders, timeout: 4000 });
                if (response.data.streams) allStreams = [...allStreams, ...response.data.streams];
            } catch (err) { console.log(`Scraper ${url} timed out.`); }
        }

        if (allStreams.length === 0) return res.status(404).json({ error: "No sources found." });

        // 2. CACHE HUNTING LOOP: Iteratively try the top 10 streams
        let finalStreamUrl = null;
        const maxAttempts = Math.min(allStreams.length, 10);

        for (let i = 0; i < maxAttempts; i++) {
            const hash = allStreams[i].infoHash;
            console.log(`--- [ATTEMPT ${i+1}] Testing Hash: ${hash} ---`);

            try {
                // Add Magnet
                const add = await axios.post(
                    `https://api.real-debrid.com/rest/1.0/torrents/addMagnet?auth_token=${RD_KEY}`, 
                    `magnet=magnet:?xt=urn:btih:${hash}`, 
                    { headers: { ...sharkHeaders, 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                const torrentId = add.data.id;

                // Select Files
                await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}?auth_token=${RD_KEY}`, 'files=all', { headers: sharkHeaders });

                // Check Status Immediately
                const info = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}?auth_token=${RD_KEY}`, { headers: sharkHeaders });
                
                // Real-Debrid marks cached files as "downloaded" instantly
                if (info.data.status === 'downloaded' && info.data.links.length > 0) {
                    console.log("--- [FOUND CACHED SOURCE] ---");
                    const unrestrict = await axios.post(
                        `https://api.real-debrid.com/rest/1.0/unrestrict/link?auth_token=${RD_KEY}`, 
                        `link=${info.data.links[0]}`, 
                        { headers: sharkHeaders }
                    );
                    finalStreamUrl = unrestrict.data.download;
                    break; // EXIT LOOP - WE WON
                } else {
                    // Not cached - DELETE to keep RD cloud clean and try next
                    console.log("Not cached. Skipping...");
                    await axios.delete(`https://api.real-debrid.com/rest/1.0/torrents/delete/${torrentId}?auth_token=${RD_KEY}`, { headers: sharkHeaders });
                }
            } catch (err) {
                console.log(`Attempt ${i+1} failed due to RD error.`);
            }
        }

        if (finalStreamUrl) {
            res.json({ streamUrl: finalStreamUrl });
        } else {
            res.status(404).json({ error: "No instantly streamable (cached) sources found." });
        }

    } catch (err) {
        res.status(500).json({ error: "System failure." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Shark Hunter Running on ${PORT}`));
