const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

const RD_TOKEN = process.env.RD_TOKEN;
const AD_KEY = process.env.AD_KEY;
const TMDB_KEY = process.env.TMDB_KEY;

app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/api/config', (req, res) => res.json({ tmdb_key: TMDB_KEY }));

app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    const mediaId = type === 'movie' ? id : `${id}:${s}:${e}`;

    try {
        // Scrape Torrentio (The "Torrent Site" aggregator)
        const scraper = await axios.get(`https://torrentio.strem.fun/stream/${type}/${mediaId}.json`);
        const streams = scraper.data.streams || [];
        if (!streams.length) return res.status(404).json({ error: "No sources found." });

        // Filter for the best quality link
        const hash = streams[0].infoHash;

        // --- STEP 1: ALLDEBRID (Instant Link) ---
        if (AD_KEY) {
            try {
                const adUpload = await axios.get(`https://api.alldebrid.com/v4/magnet/upload?agent=zonhd&apikey=${AD_KEY}&magnets[]=${hash}`);
                const mag = adUpload.data.data.magnets[0];
                if (mag.ready) {
                    const adStatus = await axios.get(`https://api.alldebrid.com/v4/magnet/status?agent=zonhd&apikey=${AD_KEY}&id=${mag.id}`);
                    const link = adStatus.data.data.magnets.links[0].link;
                    const unlock = await axios.get(`https://api.alldebrid.com/v4/link/unlock?agent=zonhd&apikey=${AD_KEY}&link=${link}`);
                    return res.json({ streamUrl: unlock.data.data.link });
                }
            } catch (e) { console.log("AD Skip"); }
        }

        // --- STEP 2: REAL-DEBRID (Instant Link) ---
        if (RD_TOKEN) {
            try {
                const add = await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/addMagnet`, `magnet=magnet:?xt=urn:btih:${hash}`, {
                    headers: { Authorization: `Bearer ${RD_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                const info = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${add.data.id}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
                
                if (info.data.links.length > 0) {
                    const final = await axios.post(`https://api.real-debrid.com/rest/1.0/unrestrict/link`, `link=${info.data.links[0]}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
                    return res.json({ streamUrl: final.data.download });
                }
            } catch (e) { console.log("RD Skip"); }
        }

        // --- STEP 3: FALLBACK (Direct Embed) ---
        // If Debrid fails, we use the clean embedder as a backup
        const backupUrl = type === 'movie' ? `https://vidsrc.cc/v2/embed/movie/${id}` : `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`;
        return res.json({ streamUrl: backupUrl, isEmbed: true });

    } catch (err) {
        res.status(500).json({ error: "Failed to fetch links." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZonHD Cinema Luxe Active`));
