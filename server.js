const express = require('express');
const path = require('path');
const app = express();

// Load environment variables (Render handles this automatically)
const TMDB_KEY = process.env.TMDB_KEY;

app.use(express.static(__dirname));

// Heartbeat route to test connectivity
app.get('/api/test', (req, res) => {
    res.send('Server is alive and reaching the browser!');
});

// Config API
app.get('/api/config', (req, res) => {
    if (!TMDB_KEY) {
        return res.status(500).json({ error: "API Key not found on server" });
    }
    res.json({ tmdb_key: TMDB_KEY });
});

// ============================================================
// PROXY ENDPOINTS – This bypasses vidsrc.pm popups/redirects
// ============================================================

// 1. Fetch the embed page, extract the .m3u8 manifest, rewrite it with proxy URLs
app.get('/api/proxy/stream', async (req, res) => {
    const { type, id, s, e } = req.query;

    // Build the vidsrc embed URL
    let embedUrl;
    if (type === 'movie') {
        embedUrl = `https://vidsrc.pm/embed/movie/${id}`;
    } else {
        embedUrl = `https://vidsrc.pm/embed/tv/${id}/${s}/${e}`;
    }

    try {
        // 1. Fetch the embed page (using a real browser User-Agent)
        const pageRes = await fetch(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://vidsrc.pm'
            }
        });
        const html = await pageRes.text();

        // 2. Extract the HLS manifest URL (looks for file/source/url: "https://...m3u8")
        const match = html.match(/(?:file|source|url)\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (!match) {
            console.error('Manifest not found in embed page');
            return res.status(500).send('Could not find video manifest');
        }
        const manifestUrl = match[1];

        // 3. Fetch the manifest itself
        const manifestRes = await fetch(manifestUrl, {
            headers: {
                'Referer': 'https://vidsrc.pm',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        let manifestText = await manifestRes.text();

        // 4. Rewrite every URL in the manifest to go through our proxy
        const baseUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);
        const lines = manifestText.split('\n');
        const rewrittenLines = lines.map(line => {
            const trimmed = line.trim();
            // Skip empty lines and comment lines
            if (trimmed === '' || trimmed.startsWith('#')) return line;

            // If it's already an absolute URL, proxy it
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                return `/api/proxy/raw?url=${encodeURIComponent(trimmed)}`;
            }

            // Otherwise it's a relative path – build the full absolute URL
            try {
                const fullUrl = new URL(trimmed, baseUrl).href;
                return `/api/proxy/raw?url=${encodeURIComponent(fullUrl)}`;
            } catch (_) {
                return line; // fallback
            }
        });
        const rewrittenManifest = rewrittenLines.join('\n');

        // 5. Send the rewritten manifest with the correct MIME type
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(rewrittenManifest);

    } catch (err) {
        console.error('Proxy /stream error:', err);
        res.status(500).send('Proxy error');
    }
});

// 2. Raw proxy – fetches the actual .ts segments and sub-manifests
app.get('/api/proxy/raw', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'Referer': 'https://vidsrc.pm',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        // Pass through the correct content type (video/MP2T for segments, m3u8 for playlists)
        const contentType = response.headers.get('content-type') || 'video/MP2T';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');

        // Pipe the binary data directly to the client
        response.body.pipe(res);
    } catch (err) {
        console.error('Proxy /raw error:', err);
        res.status(500).send('Raw proxy failed');
    }
});

// ============================================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Engine running on port ${PORT}`));
