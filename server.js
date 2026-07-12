const express = require('express');
const path = require('path');
const app = express();

// --- Global CORS ---
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

const TMDB_KEY = process.env.TMDB_KEY;

app.use(express.static(__dirname));

// Heartbeat route
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
// PROXY ENDPOINTS – Improved with better regex & logging
// ============================================================

app.get('/api/proxy/stream', async (req, res) => {
    const { type, id, s, e } = req.query;

    let embedUrl;
    if (type === 'movie') {
        embedUrl = `https://vidsrc.pm/embed/movie/${id}`;
    } else {
        embedUrl = `https://vidsrc.pm/embed/tv/${id}/${s}/${e}`;
    }

    console.log(`[Proxy] Fetching: ${embedUrl}`);

    try {
        const pageRes = await fetch(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://vidsrc.pm'
            }
        });
        const html = await pageRes.text();

        // --- Improved Regex to find the .m3u8 manifest ---
        let manifestUrl = null;
        const patterns = [
            /["'](?:file|source)["']\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i,
            /file\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i,
            /src\s*=\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i,
            /url\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i,
            /(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i  // catch any raw URL ending in .m3u8
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                manifestUrl = match[1];
                break;
            }
        }

        if (!manifestUrl) {
            console.error('[Proxy] ❌ Manifest not found in HTML');
            // Log a snippet of the HTML for debugging (check Render logs)
            console.log('[Proxy] HTML snippet:', html.substring(0, 500));
            return res.status(500).send('Could not find video manifest');
        }

        console.log(`[Proxy] ✅ Found manifest: ${manifestUrl}`);

        // Fetch the manifest
        const manifestRes = await fetch(manifestUrl, {
            headers: {
                'Referer': 'https://vidsrc.pm',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        let manifestText = await manifestRes.text();
        const baseUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);

        // Rewrite every URL in the manifest to go through our proxy
        const lines = manifestText.split('\n');
        const rewrittenLines = lines.map(line => {
            const trimmed = line.trim();
            if (trimmed === '' || trimmed.startsWith('#')) return line;

            // If it's already absolute, proxy it
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                return `/api/proxy/raw?url=${encodeURIComponent(trimmed)}`;
            }

            // Relative path – build absolute URL
            try {
                const fullUrl = new URL(trimmed, baseUrl).href;
                return `/api/proxy/raw?url=${encodeURIComponent(fullUrl)}`;
            } catch (_) {
                return line;
            }
        });

        const rewrittenManifest = rewrittenLines.join('\n');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(rewrittenManifest);

    } catch (err) {
        console.error('[Proxy] /stream error:', err);
        res.status(500).send('Proxy error');
    }
});

app.get('/api/proxy/raw', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    console.log(`[Proxy] Fetching segment: ${targetUrl.substring(0, 100)}...`);

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'Referer': 'https://vidsrc.pm',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const contentType = response.headers.get('content-type') || 'video/MP2T';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        response.body.pipe(res);
    } catch (err) {
        console.error('[Proxy] /raw error:', err);
        res.status(500).send('Raw proxy failed');
    }
});

// ============================================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Engine running on port ${PORT}`));
