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
        // High-speed scraper request with 5s timeout
        const scraper = await axios.get(`https://torrentio.strem.fun/stream/${type}/${mediaId}.json`, { timeout: 5000 });
        const streams = scraper.data.streams || [];
        
        if (!streams.length) throw new Error("No sources found.");
        
        // Pick the best quality stream available
        const hash = streams[0].infoHash;

        // --- ATTEMPT 1: ALLDEBRID (Instant Unlock) ---
        try {
            const adUpload = await axios.get(`https://api.alldebrid.com/v4/magnet/upload?agent=zonhd&apikey=${AD_KEY}&magnets[]=${hash}`);
            const magId = adUpload.data.data.magnets[0].id;
            
            // Allow AllDebrid a moment to process the magnet
            const adStatus = await axios.get(`https://api.alldebrid.com/v4/magnet/status?agent=zonhd&apikey=${AD_KEY}&id=${magId}`);
            
            if (adStatus.data.data.magnets.links && adStatus.data.data.magnets.links.length > 0) {
                const linkToUnlock = adStatus.data.data.magnets.links[0].link;
                const adUnlock = await axios.get(`https://api.alldebrid.com/v4/link/unlock?agent=zonhd&apikey=${AD_KEY}&link=${linkToUnlock}`);
                
                if (adUnlock.data.data.link) {
                    return res.json({ streamUrl: adUnlock.data.data.link });
                }
            }
        } catch (adError) {
            console.log("AllDebrid failed, falling back...");
        }

        // --- ATTEMPT 2: REAL-DEBRID (The Tank) ---
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
            
            // Real-Debrid needs a slightly longer sync delay to avoid 404s
            await new Promise(r => setTimeout(r, 3000)); 
            
            const updated = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${add.data.id}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
            
            if (updated.data.links && updated.data.links.length > 0) {
                const final = await axios.post(`https://api.real-debrid.com/rest/1.0/unrestrict/link`, `link=${updated.data.links[0]}`, { headers: { Authorization: `Bearer ${RD_TOKEN}` } });
                return res.json({ streamUrl: final.data.download });
            }
        } catch (rdError) {
            throw new Error("Both services failed.");
        }

    } catch (err) { 
        res.status(500).json({ error: "Source not reachable. Try a different movie." }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cinema Luxe running on port ${PORT}`));
