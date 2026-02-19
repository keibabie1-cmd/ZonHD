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
        // Fetching streams with an extended 5s timeout
        const scraper = await axios.get(`https://torrentio.strem.fun/stream/${type}/${mediaId}.json`, { timeout: 5000 });
        const streams = scraper.data.streams || [];
        if (!streams.length) throw new Error("No sources found.");
        
        const hash = streams[0].infoHash;

        // --- ATTEMPT 1: ALLDEBRID INSTANT UNLOCK ---
        try {
            const adUpload = await axios.get(`https://api.alldebrid.com/v4/magnet/upload?agent=zonhd&apikey=${AD_KEY}&magnets[]=${hash}`);
            const magId = adUpload.data.data.magnets[0].id;
            const adStatus = await axios.get(`https://api.alldebrid.com/v4/magnet/status?agent=zonhd&apikey=${AD_KEY}&id=${magId}`);
            
            if (adStatus.data.data.magnets.links && adStatus.data.data.magnets.links.length > 0) {
                const linkToUnlock = adStatus.data.data.magnets.links[0].link;
                const adUnlock = await axios.get(`https://api.alldebrid.com/v4/link/unlock?agent=zonhd&apikey=${AD_KEY}&link=${linkToUnlock}`);
                if (adUnlock.data.data.link) return res.json({ streamUrl: adUnlock.data.data.link });
            }
        } catch (e) { console.log("AD Failed..."); }

        // --- ATTEMPT 2: REAL-DEBRID BRUTE FORCE ---
        try {
            const add = await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/addMagnet`, `magnet=magnet:?xt=urn:btih:${hash}`, {
                headers: { Authorization: `Bearer ${RD_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const torrentId = add.data.id;
            const info = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
            
            // Force selection of ALL files to ensure the video is included
            await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, `files=all`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
            
            // Wait 3 seconds for RD to generate links
            await new Promise(r => setTimeout(r, 3000));
            
            const updated = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
            
            if (updated.data.links.length > 0) {
                // Try to unrestrict the first link provided
                const final = await axios.post(`https://api.real-debrid.com/rest/1.0/unrestrict/link`, `link=${updated.data.links[0]}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
                return res.json({ streamUrl: final.data.download });
            }
        } catch (e) { console.log("RD Failed..."); }

        throw new Error("All providers failed.");
    } catch (err) {
        res.status(500).json({ error: "Source not reachable." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Live on ${PORT}`));
