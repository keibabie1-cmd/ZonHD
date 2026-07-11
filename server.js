const express = require('express');
const path = require('path');
const axios = require('axios');
const app = express();

const TMDB_KEY = process.env.TMDB_KEY;

app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/config', (req, res) => {
    res.json({ tmdb_key: TMDB_KEY });
});

// --- THE UPGRADED AIRLOCK ---
app.get('/api/stream-proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send("No URL provided");

    try {
        const response = await axios.get(url, {
            headers: {
                'Referer': 'https://vidsrc.pm/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // REWRITE PATHS: Replace relative paths (e.g., /assets/style.css) with absolute paths (e.g., https://vidsrc.pm/assets/style.css)
        const baseUrl = new URL(url).origin;
        let html = response.data;
        
        // This regex finds standard relative paths and makes them absolute
        html = html.replace(/(src|href)=["']\/(.*?)["']/g, `$1="${baseUrl}/$2"`);

        res.send(html);
    } catch (error) {
        res.status(500).send("Proxy failed: " + error.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Engine running on port ${PORT}`));
