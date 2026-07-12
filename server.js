const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer');
const app = express();

const TMDB_KEY = process.env.TMDB_KEY;

app.use(express.static(__dirname));

app.get('/api/config', (req, res) => {
    if (!TMDB_KEY) return res.status(500).json({ error: "API Key missing" });
    res.json({ tmdb_key: TMDB_KEY });
});

// ------------------------------------------------------------
// PROXY WITH PUPPETEER – extracts manifest from vidsrc.pm
// ------------------------------------------------------------
app.get('/api/proxy/stream', async (req, res) => {
    const { type, id, s, e } = req.query;

    let embedUrl;
    if (type === 'movie') {
        embedUrl = `https://vidsrc.pm/embed/movie/${id}`;
    } else {
        embedUrl = `https://vidsrc.pm/embed/tv/${id}/${s}/${e}`;
    }

    console.log(`[Proxy] Launching browser for: ${embedUrl}`);

    let browser;
    try {
        // Launch headless browser
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();

        // Set realistic viewport and user agent
        await page.setViewport({ width: 1280, height: 720 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navigate to the embed URL
        await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait for the video player to appear (look for video element or specific selectors)
        try {
            await page.waitForSelector('video', { timeout: 15000 });
        } catch (_) {
            console.log('[Proxy] No <video> found, looking for iframe...');
        }

        // Extract the manifest URL from the page
        let manifestUrl = await page.evaluate(() => {
            // Common patterns in vidsrc.pm
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const text = script.textContent || script.innerText;
                const match = text.match(/(?:file|source|url)\s*[:=]\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i);
                if (match) return match[1];
            }
            // Check if there's an iframe with a src that contains .m3u8
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                const src = iframe.src;
                if (src && src.includes('.m3u8')) return src;
            }
            // Check video source
            const video = document.querySelector('video');
            if (video && video.src && video.src.includes('.m3u8')) return video.src;
            return null;
        });

        if (!manifestUrl) {
            // If still not found, try to get the iframe src and fetch that page recursively
            console.log('[Proxy] Manifest not found directly, trying iframe fallback...');
            const iframeSrc = await page.evaluate(() => {
                const iframe = document.querySelector('iframe');
                return iframe ? iframe.src : null;
            });
            if (iframeSrc) {
                // Navigate to the iframe URL and try again
                await page.goto(iframeSrc, { waitUntil: 'networkidle2', timeout: 30000 });
                const nestedManifest = await page.evaluate(() => {
                    const scripts = document.querySelectorAll('script');
                    for (const script of scripts) {
                        const text = script.textContent || script.innerText;
                        const match = text.match(/(?:file|source|url)\s*[:=]\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i);
                        if (match) return match[1];
                    }
                    return null;
                });
                if (nestedManifest) {
                    manifestUrl = nestedManifest;
                }
            }
        }

        if (!manifestUrl) {
            console.error('[Proxy] ❌ Could not extract manifest');
            return res.status(500).send('Could not find video stream');
        }

        console.log(`[Proxy] ✅ Found manifest: ${manifestUrl}`);

        // Fetch the manifest and rewrite URLs
        const manifestResponse = await fetch(manifestUrl, {
            headers: {
                'Referer': 'https://vidsrc.pm/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        let manifestText = await manifestResponse.text();

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

    } catch (err) {
        console.error('[Proxy] Error:', err);
        res.status(500).send('Proxy error: ' + err.message);
    } finally {
        if (browser) await browser.close();
    }
});

// Raw segment proxy
app.get('/api/proxy/raw', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url');

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
        console.error('[Proxy] Raw error:', err);
        res.status(500).send('Raw proxy failed');
    }
});

// ------------------------------------------------------------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Engine running on port ${PORT}`));
