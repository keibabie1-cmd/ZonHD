const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const path = require('path');
const app = express();

// YOUR NEW TOKEN: Cleaned of any hidden spaces or characters
const RD_KEY = 'Y5Q2ED5JGZID2HVYKBZWBODILUVIL3QXDTTEIUID2G4MZQLAW5LQ'.trim();

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// AIO Scraper: Tries Torrentio first, then Comet as a backup
async function getLuxeMagnet(type, id, s, e) {
    const providers = [
        `https://torrentio.strem.fun/stream/${type}/${id}${type==='tv'?`:${s}:${e}`:''}.json`,
        `https://comet.elfhosted.com/stream/${type}/${id}${type==='tv'?`:${s}:${e}`:''}.json`
    ];

    for (let url of providers) {
        try {
            console.log(`Luxe Engine: Checking ${new URL(url).hostname}...`);
            const res = await axios.get(url, { timeout: 5000 });
            const stream = (res.data.streams || [])[0];
            if (stream && (stream.infoHash || stream.url)) return stream;
        } catch (err) {
            console.log(`Luxe Engine: Provider timed out.`);
        }
    }
    return null;
}

app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    
    try {
        const target = await getLuxeMagnet(type, id, s, e);
        if (!target) return res.status(404).json({ error: 'No links found' });

        const magnet = target.infoHash ? `magnet:?xt=urn:btih:${target.infoHash}` : target.url;

        // AUTHENTICATION: Sending the cleaned token with the required Bearer prefix
        const addRes = await axios.post('https://api.real-debrid.com/rest/1.0/torrents/addMagnet', 
            `magnet=${encodeURIComponent(magnet)}`, 
            { headers: { 
                'Authorization': `Bearer ${RD_KEY}`, 
                'Content-Type': 'application/x-www-form-urlencoded' 
            }}
        );

        const torrentId = addRes.data.id;

        await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, 'files=all', 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        const info = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        const link = info.data.links[0];
        if (!link) throw new Error("RD Link Generation Failed");

        const unrestrict = await axios.post('https://api.real-debrid.com/rest/1.0/unrestrict/link', 
            `link=${link}`, { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        console.log("Luxe Engine: Stream Unlocked Successfully");
        res.json({ streamUrl: unrestrict.data.download });

    } catch (err) {
        if (err.response) {
            console.error("LUXE ERROR [RD API]:", err.response.status, err.response.data);
            // If 401, the token is being rejected by RD
        } else {
            console.error("LUXE ERROR [System]:", err.message);
        }
        res.status(500).json({ error: 'Streaming Error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZonHD Luxe: Port ${PORT}`));
