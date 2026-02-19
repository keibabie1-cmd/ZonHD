const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

// YOUR LATEST TOKEN
const RD_KEY = 'Y5Q2ED5JGZID2HVYKBZWBODILUVIL3QXDTTEIUID2G4MZQLAW5LQ'.trim();

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * LUXE STREAMING ROUTE
 */
app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    console.log(`--- Luxe Request: ${type} ${id} (S${s}E${e}) ---`);
    
    try {
        // Step 1: Find Magnet using Torrentio
        const scraperUrl = type === 'movie' 
            ? `https://torrentio.strem.fun/stream/movie/${id}.json`
            : `https://torrentio.strem.fun/stream/series/${id}:${s}:${e}.json`;
            
        const scraperRes = await axios.get(scraperUrl);
        const targetStream = (scraperRes.data.streams || [])[0];
        
        if (!targetStream) {
            console.log("Luxe Status: No magnets found.");
            return res.status(404).json({ error: 'No streams found' });
        }

        // Step 2: Add Magnet to Real-Debrid
        // IMPORTANT: Headers must be the 3rd argument in axios.post(url, data, config)
        const addRes = await axios.post(
            'https://api.real-debrid.com/rest/1.0/torrents/addMagnet', 
            `magnet=${encodeURIComponent(targetStream.infoHash || targetStream.url)}`, 
            { 
                headers: { 
                    'Authorization': `Bearer ${RD_KEY}`, 
                    'Content-Type': 'application/x-www-form-urlencoded' 
                } 
            }
        );

        const torrentId = addRes.data.id;

        // Step 3: Select all files
        await axios.post(
            `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, 
            'files=all', 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        // Step 4: Get info for the unrestrict link
        const infoRes = await axios.get(
            `https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        const downloadLink = infoRes.data.links[0];

        // Step 5: Unrestrict (Unlock) the link
        const unrestrictRes = await axios.post(
            'https://api.real-debrid.com/rest/1.0/unrestrict/link', 
            `link=${downloadLink}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } }
        );

        console.log("Luxe Status: Stream Successfully Unlocked!");
        res.json({ streamUrl: unrestrictRes.data.download });

    } catch (err) {
        if (err.response) {
            console.error(`Luxe Error (RD API ${err.response.status}):`, err.response.data);
        } else {
            console.error("Luxe Error (System):", err.message);
        }
        res.status(500).json({ error: 'Streaming service failed' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZonHD Luxe: Port ${PORT}`));
