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
        const scraper = await axios.get(`https://torrentio.strem.fun/stream/${type}/${mediaId}.json`);
        const streams = scraper.data.streams || [];
        if (!streams.length) throw new Error("No sources found.");
        const hash = streams[0].infoHash;

        // --- STEP 1: CHOOSE ALLDEBRID FIRST ---
        try {
            // Upload magnet to AllDebrid
            const adUpload = await axios.get(`https://api.alldebrid.com/v4/magnet/upload?agent=zonhd&apikey=${AD_KEY}&magnets[]=${hash}`);
            const magId = adUpload.data.data.magnets[0].id;
            
            // Get status/links from AllDebrid
            const adStatus = await axios.get(`https://api.alldebrid.com/v4/magnet/status?agent=zonhd&apikey=${AD_KEY}&id=${magId}`);
            const linkToUnlock = adStatus.data.data.magnets.links[0].link;

            // Unlock the link to get the playable URL
            const adUnlock = await axios.get(`https://api.alldebrid.com/v4/link/unlock?agent=zonhd&apikey=${AD_KEY}&link=${linkToUnlock}`);
            
            if (adUnlock.data.data.link) {
                return res.json({ streamUrl: adUnlock.data.data.link });
            }
        } catch (adError) {
            console.log("AllDebrid failed or file not cached, trying Real-Debrid...");
        }

        // --- STEP 2: BACKUP - REAL-DEBRID ---
        try {
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
            await new Promise(r => setTimeout(r, 2500)); 
            const updated = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${add.data.id}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
            const final = await axios.post(`https://api.real-debrid.com/rest/1.0/unrestrict/link`, `link=${updated.data.links[0]}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
            return res.json({ streamUrl: final.data.download });
        } catch (rdError) {
            throw new Error("Source not reachable on AD or RD.");
        }

    } catch (err) { 
        res.status(500).json({ error: "No working links found." }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cinema Luxe running on port ${PORT}`));
Here is my package.json: {
  "name": "zonhd-streaming",
  "version": "1.0.0",
  "description": "ZonHD Cinema App",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "http-proxy-middleware": "^2.0.6",
    "axios": "^1.6.0"
  }
}
