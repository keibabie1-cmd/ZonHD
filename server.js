app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;
    const mediaId = type === 'movie' ? id : `${id}:${s}:${e}`;

    // List of scrapers to hunt through
    const scraperUrls = [
        `https://torrentio.strem.fun/stream/${type}/${mediaId}.json`,
        `https://comet.feels.legal/stream/${type}/${mediaId}.json`,
        `https://knightcrawler.elfhosted.com/stream/${type}/${mediaId}.json`
    ];

    try {
        // Run all scraper requests in parallel for max speed
        const responses = await Promise.allSettled(
            scraperUrls.map(url => axios.get(url, { timeout: 3000 }))
        );

        // Merge all found streams into one "Super List"
        let allStreams = [];
        responses.forEach(r => {
            if (r.status === 'fulfilled' && r.value.data.streams) {
                allStreams = [...allStreams, ...r.value.data.streams];
            }
        });

        if (allStreams.length === 0) throw new Error("No sources found across any scrapers.");

        // Start the Cache Hunting loop from our previous strategy...
        // (Insert your Cache Hunter loop here to find the first RD 'downloaded' status)
        
    } catch (err) {
        res.status(500).json({ error: "No working sources found." });
    }
});
