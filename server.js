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
    console.log(`--- Requesting: ${type} ${id} (S${s}E${e}) ---`);
    
    try {
        // Step 1: Scrape for Magnets
        const scraperUrl = type === 'movie' 
            ? `https://torrentio.strem.fun/stream/movie/${id}.json`
            : `https://torrentio.strem.fun/stream/series/${id}:${s}:${e}.json`;
            
        const scraperRes = await axios.get(scraperUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const streams = scraperRes.data.streams || [];
        // Filter for high quality or just pick the first one
        const targetStream = streams[0];
        
        if (!targetStream) {
            console.error("No streams found on Torrentio");
            return res.status(404).json({ error: 'No streams found' });
        }

        const infoHash = targetStream.infoHash;

        // Step 2: Add Magnet to RD
        const addRes = await axios.post(
            'https://api.real-debrid.com/rest/1.0/torrents/addMagnet', 
            `magnet=magnet:?xt=urn:btih:${infoHash}`, 
            { 
                headers: { 
                    'Authorization': `Bearer ${RD_KEY}`, 
                    'Content-Type': 'application/x-www-form-urlencoded' 
                } 
            }
        );

        const torrentId = addRes.data.id;

        // Step 3: Select Files
        await axios.post(
            `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, 
            'files=all', 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        // Step 4: Get Torrent Details (Wait for link)
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
            await new Promise(r => setTimeout(r, 2000));
        }

        if (!downloadLink) throw new Error("RD Link generation timed out");

        // Step 5: Unrestrict Link
        const unrestrictRes = await axios.post(
            'https://api.real-debrid.com/rest/1.0/unrestrict/link', 
            `link=${downloadLink}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        console.log("Stream Ready:", unrestrictRes.data.download);
        res.json({ streamUrl: unrestrictRes.data.download });

    } catch (err) {
        console.error("Luxe Backend Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ error: 'Streaming service failed' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
