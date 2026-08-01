const express = require('express');
const path = require('path');
const axios = require('axios');
const app = express();

const TMDB_KEY = process.env.TMDB_KEY;

app.use(express.static(__dirname));

app.get('/api/config', (req, res) => {
    if (!TMDB_KEY) return res.status(500).json({ error: "API Key missing" });
    res.json({ tmdb_key: TMDB_KEY });
});

// Advanced Stream Resolver & Proxy Route
app.get('/api/resolve-stream', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL parameter missing');

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': new URL(targetUrl).origin,
                'Origin': new URL(targetUrl).origin
            },
            responseType: 'stream'
        });

        // Forward all media headers back to the client player
        Object.keys(response.headers).forEach(header => {
            res.setHeader(header, response.headers[header]);
        });

        response.data.pipe(res);
    } catch (error) {
        console.error('Stream resolution error:', error.message);
        res.status(500).send('Stream proxy failed to resolve media.');
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Engine running on port ${PORT}`));
