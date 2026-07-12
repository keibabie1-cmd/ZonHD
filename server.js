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
// PROXY ENDPOINTS – Recursive iframe-following + fallback providers
// ============================================================

// Helper: fetch with realistic headers
async function fetchWithHeaders(url) {
    return fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://vidsrc.pm/',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        }
    });
}

// Recursive manifest extractor
async function extractManifestFromUrl(url, depth = 0) {
    if (depth > 3) return null; // prevent infinite loops

    console.log(`[Proxy] Fetching (depth ${depth}): ${url}`);

    try {
        const response = await fetchWithHeaders(url);
        const html = await response.text();

        // Try to find .m3u8 manifest
        const patterns = [
            /["'](?:file|source)["']\s*[:=]\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i,
            /file\s*[:=]\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i,
            /src\s*=\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i,
            /url\s*[:=]\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i,
            /(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                return match[1];
            }
        }

        // If not found, look for an iframe src
        const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) {
            let iframeSrc = iframeMatch[1];
            // Resolve relative URLs
            if (!iframeSrc.startsWith('http')) {
                const base = new URL(url);
                iframeSrc = new URL(iframeSrc, base).href;
            }
            console.log(`[Proxy] Found iframe, following to: ${iframeSrc}`);
            return extractManifestFromUrl(iframeSrc, depth + 1);
        }

        // Also look for embedded script that sets the source (some providers use js)
        const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
        if (scriptMatch) {
            for (const script of scriptMatch) {
                const urlMatch = script.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
                if (urlMatch) {
                    return urlMatch[1];
                }
            }
        }

        console.log(`[Proxy] ❌ No manifest or iframe found at depth ${depth}`);
        return null;
    } catch (err) {
        console.error(`[Proxy] Error fetching ${url}:`, err.message);
        return null;
    }
}

app.get('/api/proxy/stream', async (req, res) => {
    const { type, id, s, e } = req.query;

    // List of providers to try (fallback order)
    const providers = [
        { domain: 'vidsrc.pm', path: (type === 'movie') ? `embed/movie/${id}` : `embed/tv/${id}/${s}/${e}` },
        { domain: 'vidsrc.to', path: (type === 'movie') ? `embed/movie/${id}` : `embed/tv/${id}/${s}/${e}` },
        { domain: 'vidsrc.xyz', path: (type === 'movie') ? `embed/movie/${id}` : `embed/tv/${id}/${s}/${e}` },
        { domain: 'vidsrc.cc', path: (type === 'movie') ? `embed/movie/${id}` : `embed/tv/${id}/${s}/${e}` },
        { domain: 'vidbinge.com', path: (type === 'movie') ? `embed/movie/${id}` : `embed/tv/${id}/${s}/${e}` },
    ];

    for (const provider of providers) {
        const embedUrl = `https://${provider.domain}/${provider.path}`;
        console.log(`[Proxy] Trying provider: ${provider.domain}`);

        try {
            const manifestUrl = await extractManifestFromUrl(embedUrl);
            if (manifestUrl) {
                console.log(`[Proxy] ✅ Found manifest from ${provider.domain}: ${manifestUrl}`);

                // Fetch the manifest and rewrite URLs
                const manifestRes = await fetch(manifestUrl, {
                    headers: {
                        'Referer': `https://${provider.domain}/`,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                let manifestText = await manifestRes.text();
                const baseUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);

                const lines = manifestText.split('\n');
                const rewrittenLines = lines.map(line => {
                    const trimmed = line.trim();
                    if (trimmed === '' || trimmed.startsWith('#')) return line;

                    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                        return `/api/proxy/raw?url=${encodeURIComponent(trimmed)}`;
                    }

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
                return; // success – exit
            }
        } catch (err) {
            console.error(`[Proxy] Provider ${provider.domain} failed:`, err.message);
        }
    }

    // If all providers fail
    res.status(500).send('Could not find video stream from any provider');
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
                'Referer': 'https://vidsrc.pm/',
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
