const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

// Pull keys from Render environment variables
const RD_TOKEN = process.env.RD_TOKEN;
const AD_KEY = process.env.AD_KEY;
const TMDB_KEY = process.env.TMDB_KEY;

app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Safely send keys and config to the frontend
app.get('/api/config', (req, res) => {
    res.json({ 
        tmdb_key: TMDB_KEY,
        rd_token: RD_TOKEN,
        ad_key: AD_KEY
    });
});

app.get('/get-hash', async (req, res) => {
    const { type, id, s, e } = req.query;
    const mediaId = type === 'movie' ? id : `${id}:${s}:${e}`;

    try {
        const scraper = await axios.get(`https://torrentio.strem.fun/stream/${type}/${mediaId}.json`, { timeout: 5000 });
        const streams = scraper.data.streams || [];
        if (!streams.length) throw new Error("No sources found.");
        
        // Just return the hash to the client
        res.json({ hash: streams[0].infoHash });
    } catch (err) {
        res.status(500).json({ error: "Scraper failed." });
    }
});

app.listen(process.env.PORT || 3000);
