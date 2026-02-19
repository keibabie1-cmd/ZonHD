const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

// Parse the single config string from Render
const config = JSON.parse(process.env.ZON_CONFIG || "{}");
const RD_TOKEN = config.rd;
const AD_KEY = config.ad;
const TMDB_KEY = config.tmdb;

app.use(express.static('public'));

// This gives your frontend the TMDB key safely
app.get('/api/config', (req, res) => {
    res.json({ tmdb_key: TMDB_KEY });
});

app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    const mediaId = type === 'movie' ? id : `${id}:${s}:${e}`;

    try {
        // 1. Hunt for InfoHashes
        const scraperRes = await axios.get(`https://torrentio.strem.fun/stream/${type}/${mediaId}.json`);
        const streams = scraperRes.data.streams || [];
        if (streams.length === 0) throw new Error("No sources found.");

        const bestHash = streams[0].infoHash;

        // 2. Try Real-Debrid first
        try {
            const addMag = await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/addMagnet`, 
                `magnet=magnet:?xt=urn:btih:${bestHash}`, 
                { headers: { Authorization: `Bearer ${RD_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const rdInfo = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${addMag.data.id}`, 
                { headers: { Authorization: `Bearer ${RD_TOKEN}` } }
            );

            let selectedFileId = 1; 
            if (type === 'tv') {
                const pattern = new RegExp(`S${s.padStart(2, '0')}E${e.padStart(2, '0')}`, 'i');
                const matchedFile = rdInfo.data.files.find(f => pattern.test(f.path));
                if (matchedFile) selectedFileId = matchedFile.id;
            }

            await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${addMag.data.id}`, 
                `files=${selectedFileId}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } }
            );

            await new Promise(r => setTimeout(r, 1500)); // Wait for server to cache selection

            const updatedInfo = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${addMag.data.id}`, 
                { headers: { Authorization: `Bearer ${RD_TOKEN}` } }
            );

            const unrestrict = await axios.post(`https://api.real-debrid.com/rest/1.0/unrestrict/link`, 
                `link=${updatedInfo.data.links[0]}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } }
            );

            return res.json({ streamUrl: unrestrict.data.download });

        } catch (rdError) {
            // 3. Fallback to AllDebrid if RD fails
            const adRes = await axios.get(`https://api.alldebrid.com/v4/magnet/upload?agent=zonhd&apikey=${AD_KEY}&magnets[]=${bestHash}`);
            const magnetId = adRes.data.data.magnets[0].id;
            
            const adStatus = await axios.get(`https://api.alldebrid.com/v4/magnet/status?agent=zonhd&apikey=${AD_KEY}&id=${magnetId}`);
            const finalLink = adStatus.data.data.magnets.links[0].link;

            const adUnlock = await axios.get(`https://api.alldebrid.com/v4/link/unlock?agent=zonhd&apikey=${AD_KEY}&link=${finalLink}`);
            return res.json({ streamUrl: adUnlock.data.data.link });
        }
    } catch (err) {
        res.status(500).json({ error: "Source not reachable." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cinema Luxe running on port ${PORT}`));
