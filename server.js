// ... inside your app.get('/get-luxe-stream' ...

// 1. Get the first available stream with an InfoHash
const bestStream = allStreams.find(s => s.infoHash);
if (!bestStream) throw new Error("No cached magnets found.");

const RD_TOKEN = process.env.RD_TOKEN; // Use Environment Variables, NOT hardcoded!

// 2. Add Magnet to Real-Debrid
const addMag = await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/addMagnet`, 
    `magnet=magnet:?xt=urn:btih:${bestStream.infoHash}`, 
    { headers: { Authorization: `Bearer ${RD_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
);

// 3. Get the file list for that torrent
const torrentInfo = await axios.get(`https://api.real-debrid.com/rest/1.0/torrents/info/${addMag.data.id}`, 
    { headers: { Authorization: `Bearer ${RD_TOKEN}` } }
);

// 4. Select the best file (usually the largest) and unrestrict it
const fileId = torrentInfo.data.files[0].id; // Simplified: grabs first file
const selectFile = await axios.post(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${addMag.data.id}`, 
    `files=${fileId}`, 
    { headers: { Authorization: `Bearer ${RD_TOKEN}` } }
);

// 5. Get the final streamable link
const links = torrentInfo.data.links[0];
const unrestrict = await axios.post(`https://api.real-debrid.com/rest/1.0/unrestrict/link`, 
    `link=${links}`, 
    { headers: { Authorization: `Bearer ${RD_TOKEN}` } }
);

res.json({ streamUrl: unrestrict.data.download });
