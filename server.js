const express = require('express');
const path = require('path');
const axios = require('axios'); // Added to fetch stream data
const app = express();

const TMDB_KEY = process.env.TMDB_KEY;

app.use(express.static(__dirname));

// Serve your main app
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Config API
app.get('/api/config', (req, res) => {
    res.json({ tmdb_key: TMDB_KEY });
});

// --- THE AIRLOCK: PROXY ROUTE ---
app.get('/api/stream-proxy', async (req, res) => {
    const { url } = req.query; // The URL of the video provider
    
    try {
        // Here, the server acts as the "middleman"
        // It fetches the video page, strips the headers/ads, and returns the data
        const response = await axios.get(url, {
            headers: {
                'Referer': 'https://vidsrc.pm/', // Many providers check the referer
                'User-Agent': 'Mozilla/5.0'
            }
        });
        
        res.send(response.data);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch stream", details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZonHD Cinema Luxe Engine running on port ${PORT}`));
