const express = require('express');
const path = require('path');
const app = express();

// Serve static files
app.use(express.static(__dirname));

// Ensure sw.js is served with the correct header
app.get('/sw.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'sw.js'), {
        headers: { 'Content-Type': 'application/javascript' }
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Engine running on port ${PORT}`));
