const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const path = require('path');
const app = express();

const RD_KEY = 'MQKVSO7O2CYHOGVO6LAXR7H3ADRQADZDMZF2FT4S6ZNJECAM7PWQ';

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// AIO Scraper: Tries multiple sources to ensure we find a working magnet
async function getLuxeMagnet(type, id, s, e) {
    const providers = [
        `https://torrentio.strem.fun/stream/${type}/${id}${type==='tv'?`:${s}:${e}`:''}.json`,
        `https://comet.elfhosted.com/stream/${type}/${id}${type==='tv'?`:${s}:${e}`:''}.json`,
        `https://stremio-jackett.onrender.com/stream/${type}/${id}${type==='tv'?`:${s}:${e}`:''}.json`
    ];

    for (let url of providers) {
        try {
            console.log(`Luxe Engine: Trying provider ${new URL(url).hostname}...`);
            const res = await axios.get(url, { timeout: 4000 });
            const stream = (res.data.streams || [])[0];
            if (stream && (stream.infoHash || stream.url)) return stream;
        } catch (err) {
            console.log(`Luxe Engine: Provider failed, moving to next...`);
        }
    }
    return null;
}

app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    
    try {
        const target = await getLuxeMagnet(type, id, s, e);
        if (!target) return res.status(404).json({ error: 'No links found' });

        // Clean the magnet/hash for RD
        const magnet = target.infoHash ? `magnet:?xt=urn:btih:${target.infoHash}` : target.url;

        // 1. Add to RD
        const addRes = await axios.post('https://api.real-debrid.com/rest/1.0/torrents/addMagnet', 
            `magnet=${encodeURIComponent(magnet)}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const torrentId = addRes.data.id;

        // 2. Instant Select Files
        await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, 'files=all', 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        // 3. Get Info & Unrestrict
        const info = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        const link = info.data.links[0];
        if (!link) throw new Error("RD could not generate link");

        const unrestrict = await axios.post('https://api.real-debrid.com/rest/1.0/unrestrict/link', 
            `link=${link}`, { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        res.json({ streamUrl: unrestrict.data.download });

    } catch (err) {
        console.error("LUXE FINAL ERROR:", err.response ? err.response.data : err.message);
        res.status(500).json({ error: 'Streaming Error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZonHD Luxe: Active on ${PORT}`));
