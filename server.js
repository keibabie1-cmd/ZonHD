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
    console.log(`--- [START] Fetching: ${type} ${id} ---`);
    
    try {
        // Step 1: Get Magnet from Torrentio
        const scraperUrl = type === 'movie' 
            ? `https://torrentio.strem.fun/stream/movie/${id}.json`
            : `https://torrentio.strem.fun/stream/series/${id}:${s}:${e}.json`;
            
        const scraperRes = await axios.get(scraperUrl, { timeout: 5000 });
        const targetStream = (scraperRes.data.streams || [])[0];
        
        if (!targetStream) {
            console.log("--- [ERROR] No streams found for this title ---");
            return res.status(404).json({ error: 'No streams found' });
        }

        const magnet = `magnet:?xt=urn:btih:${targetStream.infoHash}`;

        // Step 2: Add Magnet to RD
        const addRes = await axios.post(
            'https://api.real-debrid.com/rest/1.0/torrents/addMagnet', 
            `magnet=${magnet}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const torrentId = addRes.data.id;

        // Step 3: Select all files
        await axios.post(
            `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, 
            'files=all', 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        // Step 4: Link Generation Loop
        let downloadLink = null;
        for (let i = 0; i < 6; i++) {
            const infoRes = await axios.get(
                `https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, 
                { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
            );

            if (infoRes.data.links && infoRes.data.links.length > 0) {
                downloadLink = infoRes.data.links[0];
                break;
            }
            console.log(`--- [INFO] Waiting for RD link (Attempt ${i+1})... ---`);
            await new Promise(res => setTimeout(res, 2000));
        }

        if (!downloadLink) throw new Error("RD link timed out.");

        // Step 5: Unrestrict Link
        const unrestrictRes = await axios.post(
            'https://api.real-debrid.com/rest/1.0/unrestrict/link', 
            `link=${downloadLink}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        console.log("--- [SUCCESS] Stream URL generated ---");
        res.json({ streamUrl: unrestrictRes.data.download });

    } catch (err) {
        console.error("--- [CRITICAL ERROR] ---");
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", err.response.data);
        } else {
            console.error("Message:", err.message);
        }
        res.status(500).json({ error: 'Source not reachable' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cinema running on ${PORT}`));
