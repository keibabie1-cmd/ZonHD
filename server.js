const express = require('express');
const path = require('path');
const app = express();

// Load environment variables (Render handles this automatically)
const TMDB_KEY = process.env.TMDB_KEY;

app.use(express.static(__dirname));

// Heartbeat route to test connectivity
app.get('/api/test', (req, res) => {
    res.send('Server is alive and reaching the browser!');
});

// Config API
app.get('/api/config', (req, res) => {
    if (!TMDB_KEY) {
        return res.status(500).json({ error: "API Key not found on server" });
    }
    res.json({ tmdb_key: TMDB_KEY });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Engine running on port ${PORT}`));
