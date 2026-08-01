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

// Proxy endpoint to handle backend content fetching and bypass restrictions
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL parameter missing');

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': new URL(targetUrl).origin
            },
            responseType: 'arraybuffer'
        });
        
        res.setHeader('Content-Type', response.headers['content-type'] || 'text/html');
        res.send(response.data);
    } catch (error) {
        res.status(500).send('Proxy error: Could not fetch resource.');
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Engine running on port ${PORT}`));
