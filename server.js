app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    console.log(`--- Luxe Request: ${type} ${id} (S${s}E${e}) ---`);
    
    try {
        // 1. Scraper Step
        const scraperUrl = type === 'movie' 
            ? `https://torrentio.strem.fun/stream/movie/${id}.json`
            : `https://torrentio.strem.fun/stream/series/${id}:${s}:${e}.json`;
            
        const scraperRes = await axios.get(scraperUrl);
        const targetStream = (scraperRes.data.streams || [])[0];
        
        if (!targetStream) {
            console.log("Luxe Status: No magnets found for this title.");
            return res.status(404).json({ error: 'No high-quality streams found' });
        }

        // 2. Real-Debrid Step
        const addRes = await axios.post('https://api.real-debrid.com/rest/1.0/torrents/addMagnet', 
            `magnet=${targetStream.infoHash}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const torrentId = addRes.data.id;
        await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, 'files=all', 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        const infoRes = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        const downloadLink = infoRes.data.links[0];
        const unrestrictRes = await axios.post('https://api.real-debrid.com/rest/1.0/unrestrict/link', 
            `link=${downloadLink}`, 
            { headers: { 'Authorization': `Bearer ${RD_KEY}` } });

        console.log("Luxe Status: Stream successfully unlocked!");
        res.json({ streamUrl: unrestrictRes.data.download });

    } catch (err) {
        // CRITICAL: Log the detailed error from Real-Debrid
        if (err.response) {
            console.error("Luxe Error (RD API):", err.response.status, err.response.data);
        } else {
            console.error("Luxe Error (System):", err.message);
        }
        res.status(500).json({ error: 'Streaming service error' });
    }
});
