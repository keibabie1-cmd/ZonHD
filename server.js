const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

// Parse Config safely
let config = {};
try {
    config = JSON.parse(process.env.ZON_CONFIG || "{}");
} catch (e) {
    console.error("Config Parse Error: Check your Render Environment Variable format.");
}

const Y5Q2ED5JGZID2HVYKBZWBODILUVIL3QXDTTEIUID2G4MZQLAW5LQ = config.rd;
const OpmUEjVJwOC5wg0cSOVU = config.ad ;
const b9c746781e1e9b084c4cc4f0420156d4 = config.tmdb;

// FIX: Look in the main directory for index.html
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/config', (req, res) => {
    res.json({ tmdb_key: b9c746781e1e9b084c4cc4f0420156d4 });
});

app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    const mediaId = type === 'movie' ? id : `${id}:${s}:${e}`;
    try {
        const scraperRes = await axios.get(`https://torrentio.strem.fun/stream/${type}/${mediaId}.json`);
        const streams = scraperRes.data.streams || [];
        if (streams.length === 0) throw new Error("No sources.");
        const bestHash = streams[0].infoHash;

        // RD Attempt
        try {
            const addMag = await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/addMagnet`, 
                `magnet=magnet:?xt=urn:btih:${bestHash}`, 
                { headers: { Authorization: `Bearer ${Y5Q2ED5JGZID2HVYKBZWBODILUVIL3QXDTTEIUID2G4MZQLAW5LQ}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            const rdInfo = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${addMag.data.id}`, { headers: { Authorization: `Bearer ${Y5Q2ED5JGZID2HVYKBZWBODILUVIL3QXDTTEIUID2G4MZQLAW5LQ}` } });
            let fileId = 1; 
            if (type === 'tv') {
                const pattern = new RegExp(`S${s.padStart(2, '0')}E${e.padStart(2, '0')}`, 'i');
                const matched = rdInfo.data.files.find(f => pattern.test(f.path));
                if (matched) fileId = matched.id;
            }
            await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${addMag.data.id}`, `files=${fileId}`, { headers: { Authorization: `Bearer ${Y5Q2ED5JGZID2HVYKBZWBODILUVIL3QXDTTEIUID2G4MZQLAW5LQ}` } });
            await new Promise(r => setTimeout(r, 1500));
            const updated = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${addMag.data.id}`, { headers: { Authorization: `Bearer ${Y5Q2ED5JGZID2HVYKBZWBODILUVIL3QXDTTEIUID2G4MZQLAW5LQ}` } });
            const unrestrict = await axios.post(`https://api.real-debrid.com/rest/1.0/unrestrict/link`, `link=${updated.data.links[0]}`, { headers: { Authorization: `Bearer ${Y5Q2ED5JGZID2HVYKBZWBODILUVIL3QXDTTEIUID2G4MZQLAW5LQ}` } });
            return res.json({ streamUrl: unrestrict.data.download });
        } catch (rdError) {
            // AD Fallback
            const adRes = await axios.get(`https://api.alldebrid.com/v4/magnet/upload?agent=zonhd&apikey=${OpmUEjVJwOC5wg0cSOVU}&magnets[]=${bestHash}`);
            const mId = adRes.data.data.magnets[0].id;
            const adStatus = await axios.get(`https://api.alldebrid.com/v4/magnet/status?agent=zonhd&apikey=${OpmUEjVJwOC5wg0cSOVU}&id=${mId}`);
            const adUnlock = await axios.get(`https://api.alldebrid.com/v4/link/unlock?agent=zonhd&apikey=${OpmUEjVJwOC5wg0cSOVU}&link=${adStatus.data.data.magnets.links[0].link}`);
            return res.json({ streamUrl: adUnlock.data.data.link });
        }
    } catch (err) { res.status(500).json({ error: "Fail" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on ${PORT}`));
