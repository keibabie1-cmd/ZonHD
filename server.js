const express = require('express');
const path = require('path');
const axios = require('axios');
const app = express();

const TMDB_KEY = process.env.TMDB_KEY;

// Serve static files from root directory
app.use(express.static(__dirname));

// Config route for TMDB API key
app.get('/api/config', (req, res) => {
    if (!TMDB_KEY) return res.status(500).json({ error: "API Key missing" });
    res.json({ tmdb_key: TMDB_KEY });
});

// Universal Streaming & Asset Proxy
// This bypasses CORS and anti-hotlinking/blacklisting blocks by proxying requests server-side.
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Target URL parameter missing');

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': new URL(targetUrl).origin,
                'Origin': new URL(targetUrl).origin
            },
            responseType: 'stream',
            timeout: 15000
        });

        // Clear unwanted security headers that trigger blockages
        Object.keys(response.headers).forEach(header => {
            if (header.toLowerCase() !== 'content-security-policy') {
                res.setHeader(header, response.headers[header]);
            }
        });

        // Pipe the stream directly to the client
        response.data.pipe(res);
    } catch (error) {
        console.error('Proxy routing error:', error.message);
        res.status(500).send('Proxy failed to resolve target stream.');
    }
});

// Main Route
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`ZonHD Engine running on port ${PORT}`));
