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
// PROXY WITH OPTIMIZED PUPPETEER (free‑tier friendly)
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
        // Launch headless browser with low‑memory flags
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',          // reduces memory footprint
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-software-rasterizer'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navigate and wait for network idle
        await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Try to wait for video element
        try {
            await page.waitForSelector('video', { timeout: 10000 });
        } catch (_) {
            console.log('[Proxy] No <video> found, trying iframe fallback...');
        }

        // Extract manifest URL
        let manifestUrl = await page.evaluate(() => {
            // Search in scripts
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const text = script.textContent || script.innerText;
                const match = text.match(/(?:file|source|url)\s*[:=]\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i);
                if (match) return match[1];
            }
            // Check iframes
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                if (iframe.src && iframe.src.includes('.m3u8')) return iframe.src;
            }
            // Video src
            const video = document.querySelector('video');
            if (video && video.src && video.src.includes('.m3u8')) return video.src;
            return null;
        });

        // If not found, try to follow iframe
        if (!manifestUrl) {
            console.log('[Proxy] Manifest not found, following iframe...');
            const iframeSrc = await page.evaluate(() => {
                const iframe = document.querySelector('iframe');
                return iframe ? iframe.src : null;
            });
            if (iframeSrc) {
                await page.goto(iframeSrc, { waitUntil: 'networkidle2', timeout: 30000 });
                manifestUrl = await page.evaluate(() => {
                    const scripts = document.querySelectorAll('script');
                    for (const script of scripts) {
                        const text = script.textContent || script.innerText;
                        const match = text.match(/(?:file|source|url)\s*[:=]\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i);
                        if (match) return match[1];
                    }
                    return null;
                });
            }
        }

        if (!manifestUrl) {
            console.error('[Proxy] ❌ Could not extract manifest');
            return res.status(500).send('Could not find video stream');
        }

        console.log(`[Proxy] ✅ Found manifest: ${manifestUrl}`);

        // Fetch manifest and rewrite URLs
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
