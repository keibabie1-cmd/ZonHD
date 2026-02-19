app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    const mediaId = type === 'movie' ? id : `${id}:${s}:${e}`;

    try {
        const scraper = await axios.get(`https://torrentio.strem.fun/stream/${type}/${mediaId}.json`);
        const streams = scraper.data.streams || [];
        if (!streams.length) return res.status(404).json({ error: "No links" });

        const hash = streams[0].infoHash;

        // SERVER-SIDE HANDSHAKE (Bypasses CORS)
        const adUpload = await axios.get(`https://api.alldebrid.com/v4/magnet/upload?agent=zonhd&apikey=${process.env.AD_KEY}&magnets[]=${hash}`);
        const magId = adUpload.data.data.magnets[0].id;
        
        const adStatus = await axios.get(`https://api.alldebrid.com/v4/magnet/status?agent=zonhd&apikey=${process.env.AD_KEY}&id=${magId}`);
        const link = adStatus.data.data.magnets.links[0].link;

        const adUnlock = await axios.get(`https://api.alldebrid.com/v4/link/unlock?agent=zonhd&apikey=${process.env.AD_KEY}&link=${link}`);
        
        // Send the final playable link back to the browser
        res.json({ streamUrl: adUnlock.data.data.link });

    } catch (err) {
        res.status(500).json({ error: "Bridge failed" });
    }
});
