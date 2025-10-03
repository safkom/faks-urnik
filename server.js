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
// Get available weeks and classes - actively probed from source and cached
app.get('/api/options', async (req, res) => {
  try {
    const now = Date.now();
    // Allow bypass cache for troubleshooting: /api/options?nocache=1
    const noCache = req.query && (req.query.nocache === '1' || req.query.nocache === 'true');
    if (!noCache && optionsCache.data && optionsCache.expiresAt > now) {
      return res.json(optionsCache.data);
    }

    // Utilities for ISO week calculations
    const getIsoWeekInfo = (d) => {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
      return { weekNo, year: date.getUTCFullYear() };
    };
    const mondayOfIsoWeek = (week, year) => {
      const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
      const dow = simple.getUTCDay() || 7;
      const start = new Date(simple);
      start.setUTCDate(simple.getUTCDate() + (1 - dow));
      return start;
    };
    const formatDMY = (d) => `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;

    // Probe available weeks by checking for existence of at least one class page for each week
    const anchors = ['00001', '00002', '00003'];
    const existsForWeek = async (week) => {
      for (const anchor of anchors) {
        const testUrl = `https://sckr.si/vss/urniki/c/${week}/c${anchor}.htm`;
        try {
          const r = await fetch(testUrl, { method: 'HEAD' });
          if (r.ok) return true;
        } catch (_) { /* ignore */ }
      }
      return false;
    };

    const today = new Date();
    const { weekNo, year } = getIsoWeekInfo(today);
    const candidateWeeks = [];
    const pushWeek = (w) => { if (w >= 1 && w <= 53 && !candidateWeeks.includes(w)) candidateWeeks.push(w); };
    for (let i = -8; i <= 12; i++) pushWeek(weekNo + i);

    const weeks = [];
    for (const w of candidateWeeks) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await existsForWeek(w);
      if (ok) {
        const monday = mondayOfIsoWeek(w, year);
        weeks.push({ value: String(w), label: formatDMY(monday) });
      }
    }

    // Build class list by scanning a representative week (prefer current if available)
    const classes = [];
    const scanWeek = weeks.length ? weeks[0].value : String(weekNo);
    let consecutiveMisses = 0;
    const MAX_MISSES = 30;
    for (let i = 1; i <= 300 && consecutiveMisses < MAX_MISSES; i++) {
      const id = String(i).padStart(5, '0');
      const url = `https://sckr.si/vss/urniki/c/${scanWeek}/c${id}.htm`;
      try {
        // eslint-disable-next-line no-await-in-loop
        const resp = await fetch(url);
        if (!resp.ok) { consecutiveMisses++; continue; }
        const page = await resp.text();
        const m = page.match(/<font\s+size=\"7\"[^>]*>([^<]+)<\/font>/i);
        if (m) {
          const label = m[1].replace(/\r?\n/g, '').replace(/&nbsp;/g, '').trim();
          classes.push({ value: String(i), label });
          consecutiveMisses = 0; // reset on hit
        } else {
          consecutiveMisses++;
        }
      } catch (_) {
        consecutiveMisses++;
      }
    }

    const payload = { weeks, classes };
    if (!noCache && weeks.length && classes.length) {
      optionsCache.data = payload;
      optionsCache.expiresAt = now + OPTIONS_TTL_MS;
    } else {
      optionsCache.data = null;
      optionsCache.expiresAt = 0;
    }
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
