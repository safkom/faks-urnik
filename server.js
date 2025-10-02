const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory caches to improve performance and reduce upstream load
const optionsCache = { data: null, expiresAt: 0 };
const OPTIONS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const timetableCache = new Map(); // key: url, value: { body, expiresAt }
const TIMETABLE_TTL_MS = 15 * 60 * 1000; // 15 minutes

app.use(cors());

// API routes must come BEFORE static file serving
// Get available weeks and classes - parsed from sample page and cached
app.get('/api/options', async (req, res) => {
  try {
    const now = Date.now();
    if (optionsCache.data && optionsCache.expiresAt > now) {
      return res.json(optionsCache.data);
    }

    // Fetch a sample page to extract metadata
    const sampleUrl = 'https://sckr.si/vss/urniki/c/40/c00001.htm';
    const response = await fetch(sampleUrl);
    const html = await response.text();

    // Parse weeks from the <select name="week"> options on the page
    const weeks = [];
    const selectMatch = html.match(/<select[^>]*name=\"week\"[^>]*>([\s\S]*?)<\/select>/i);
    if (selectMatch) {
      const inner = selectMatch[1];
      const optionRegex = /<option\s+value=\"(\d{1,2})\"[^>]*>([^<]+)<\/option>/gi;
      let m;
      while ((m = optionRegex.exec(inner)) !== null) {
        const weekValue = m[1];
        const dateText = m[2].trim(); // e.g., 29.9.2025
        weeks.push({ value: weekValue, label: dateText });
      }
    }

    // Classes: attempt to parse current class name as default, fallback to static
    const classes = [];
    const headerMatch = html.match(/<font\s+size=\"7\"[^>]*>([^<]+)<\/font>/i);
    if (headerMatch) {
      const defaultClassName = headerMatch[1]
        .trim()
        .replace(/\r?\n/g, '')
        .replace(/&nbsp;/g, '')
        .trim();
      classes.push({ value: '2', label: defaultClassName || 'RAI 2.l' });
    }
    if (classes.length === 0) {
      classes.push(
        { value: '1', label: 'RAI 1.l' },
        { value: '2', label: 'RAI 2.l' }
      );
    }

    if (weeks.length === 0) {
      weeks.push(
        { value: '40', label: '29.9.2025' },
        { value: '41', label: '6.10.2025' }
      );
    }

    const payload = { weeks, classes };
    optionsCache.data = payload;
    optionsCache.expiresAt = now + OPTIONS_TTL_MS;
    res.json(payload);
  } catch (error) {
    console.error('Error fetching options:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/timetable/:week/:classNum', async (req, res) => {
  const { week, classNum } = req.params;

  // Pad class number to 5 digits like the n2str function
  const paddedNum = classNum.toString().padStart(5, '0');
  // URL format: c/{week}/c{paddedNum}.htm
  const url = `https://sckr.si/vss/urniki/c/${week}/c${paddedNum}.htm`;

  console.log(`Fetching: ${url}`);

  try {
    const cached = timetableCache.get(url);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(cached.body);
    }

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `HTTP ${response.status} ${response.statusText}`
      });
    }

    const html = await response.text();
    timetableCache.set(url, { body: html, expiresAt: now + TIMETABLE_TTL_MS });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Error fetching timetable:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files (HTML, CSS, JS) - must come AFTER API routes
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main app on root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 Timetable API: http://localhost:${PORT}/api/timetable/{week}/{classNum}`);
  console.log(`📋 Options API: http://localhost:${PORT}/api/options`);
  console.log(`🌐 Web App: http://localhost:${PORT}/`);
});
