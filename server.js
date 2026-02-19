app.get('/get-luxe-stream', async (req, res) => {
    const { type, id, s, e } = req.query;

    try {
        // 1. Convert TMDB ID to IMDb ID
        const extRes = await axios.get(`https://api.themoviedb.org/3/${type}/${id}/external_ids?api_key=${TMDB_KEY}`);
        const imdbId = extRes.data.imdb_id;
        if (!imdbId) throw new Error("IMDb ID not found");

        const mediaId = type === 'movie' ? imdbId : `${imdbId}:${s}:${e}`;

        // 2. Scrape Torrentio
        const scraper = await axios.get(`https://torrentio.strem.fun/stream/${type}/${mediaId}.json`);
        const streams = scraper.data.streams || [];
        if (!streams.length) throw new Error("No sources found.");
        
        // Use the first high-quality stream
        const hash = streams[0].infoHash;
        const magnet = `magnet:?xt=urn:btih:${hash}`;

        // 3. Try AllDebrid (Cached Check)
        try {
            const adUpload = await axios.get(`https://api.alldebrid.com/v4/magnet/upload?agent=zonhd&apikey=${AD_KEY}&magnets[]=${encodeURIComponent(magnet)}`);
            const magData = adUpload.data.data.magnets[0];
            
            if (magData.ready) { // File is cached!
                const adStatus = await axios.get(`https://api.alldebrid.com/v4/magnet/status?agent=zonhd&apikey=${AD_KEY}&id=${magData.id}`);
                const linkToUnlock = adStatus.data.data.magnets.links[0].link;
                const adUnlock = await axios.get(`https://api.alldebrid.com/v4/link/unlock?agent=zonhd&apikey=${AD_KEY}&link=${linkToUnlock}`);
                return res.json({ streamUrl: adUnlock.data.data.link });
            }
        } catch (e) { console.log("AD skip..."); }

        // 4. Fallback to Real-Debrid
        const params = new URLSearchParams();
        params.append('magnet', magnet);

        const rdAdd = await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/addMagnet`, params.toString(), {
            headers: { 
                Authorization: `Bearer ${RD_TOKEN}`, 
                'Content-Type': 'application/x-www-form-urlencoded' 
            }
        });

        // Add logic here to select files and unrestrict as you did before...
        // Note: For "Luxe" feel, always check /torrents/instantAvailability first!

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to resolve stream." });
    }
});
