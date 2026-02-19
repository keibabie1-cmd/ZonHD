const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

// Pulling separate keys from Render Environment
const RD_TOKEN = process.env.RD_TOKEN;
const AD_KEY = process.env.AD_KEY;
const TMDB_KEY = process.env.TMDB_KEY;

app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Safely sends only the TMDB key to your frontend
app.get('/api/config', (req, res) => {
    res.json({ tmdb_key: TMDB_KEY });
});

app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    const mediaId = type === 'movie' ? id : `${id}:${s}:${e}`;

    try {
        const scraper = await axios.get(`https://torrentio.strem.fun/stream/${type}/${mediaId}.json`);
        const streams = scraper.data.streams || [];
        if (!streams.length) throw new Error("No streams found.");
        const hash = streams[0].infoHash;

        try {
            // --- REAL-DEBRID FLOW ---
            const add = await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/addMagnet`, `magnet=magnet:?xt=urn:btih:${hash}`, {
                headers: { Authorization: `Bearer ${RD_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const info = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${add.data.id}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
            
            let fileId = 1;
            if (type === 'tv') {
                const epTag = `S${s.padStart(2, '0')}E${e.padStart(2, '0')}`;
                const found = info.data.files.find(f => f.path.toLowerCase().includes(epTag.toLowerCase()));
                if (found) fileId = found.id;
            }

            await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${add.data.id}`, `files=${fileId}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
            await new Promise(r => setTimeout(r, 2000)); 
            const updated = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${add.data.id}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
            const final = await axios.post(`https://api.real-debrid.com/rest/1.0/unrestrict/link`, `link=${updated.data.links[0]}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
            return res.json({ streamUrl: final.data.download });
        } catch (err) {
            // --- ALLDEBRID FALLBACK ---
            const adUpload = await axios.get(`https://api.alldebrid.com/v4/magnet/upload?agent=zonhd&apikey=${AD_KEY}&magnets[]=${hash}`);
            const magId = adUpload.data.data.magnets[0].id;
            const adStatus = await axios.get(`https://api.alldebrid.com/v4/magnet/status?agent=zonhd&apikey=${AD_KEY}&id=${magId}`);
            const unlock = await axios.get(`https://api.alldebrid.com/v4/link/unlock?agent=zonhd&apikey=${AD_KEY}&link=${adStatus.data.data.magnets.links[0].link}`);
            return res.json({ streamUrl: unlock.data.data.link });
        }
    } catch (err) { 
        res.status(500).json({ error: "No working sources found." }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cinema Luxe running on port ${PORT}`));
