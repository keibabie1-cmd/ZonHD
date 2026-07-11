const AD_DOMAINS = [
    'ad-delivery.net',
    'ads-twitter.com',
    'doubleclick.net',
    'popads.net',
    'popcash.net',
    'propellerads.com',
    'exoclick.com',
    'juicyads.com',
    'adstertra.com'
];

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // If the request is to an ad domain, block it
    if (AD_DOMAINS.some(domain => url.hostname.includes(domain))) {
        event.respondWith(Response.error());
    } else {
        event.respondWith(fetch(event.request));
    }
});
