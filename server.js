const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const { JSDOM } = require('jsdom');

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
    // Only check current week and next 8 weeks (9 weeks total) to match schedule site behavior
    for (let i = 0; i <= 8; i++) pushWeek(weekNo + i);

    const weeks = [];
    for (const w of candidateWeeks) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await existsForWeek(w);
      if (ok) {
        const monday = mondayOfIsoWeek(w, year);
        weeks.push({ value: String(w), label: formatDMY(monday) });
      }
    }

    // Use a fixed list of known classes from the schedule site
    const classes = [
      { value: '1', label: 'RAI 1.l' },
      { value: '2', label: 'RAI 2.l' },
      { value: '3', label: 'INF 2.l' },
      { value: '4', label: 'RAI 1.c' },
      { value: '5', label: 'RAI 2.c' },
      { value: '6', label: 'INF 3.c' },
      { value: '7', label: 'MEH 1.l' },
      { value: '8', label: 'MEH 2.l' },
      { value: '9', label: 'MEH 1.c' },
      { value: '10', label: 'MEH 2.c' },
      { value: '11', label: 'MEH 3.c' },
      { value: '12', label: 'ENE 1.l' },
      { value: '13', label: 'ENE 2.l' },
      { value: '14', label: 'ENE 1.c' },
      { value: '15', label: 'ENE 2.c' },
      { value: '16', label: 'ENE 3.c' },
      { value: '17', label: 'VAR 1.c' },
      { value: '18', label: 'VAR 2.c' },
      { value: '19', label: 'VAR 3.c' },
      { value: '20', label: 'EKN 1.l' },
      { value: '21', label: 'EKN 2.l Kom' },
      { value: '22', label: 'EKN 2.l Rač' },
      { value: '23', label: 'EKN 1.c Rač' },
      { value: '24', label: 'EKN 2.c Rač' },
      { value: '25', label: 'EKN 2.c Kom' },
      { value: '26', label: 'EKN 3.c Kom' },
      { value: '27', label: 'OSM 1.c' },
      { value: '28', label: 'OSM 2.c' }
    ];

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
      if (cached.timestamp) {
        res.setHeader('X-Schedule-Updated', cached.timestamp);
      }
      return res.send(cached.body);
    }

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `HTTP ${response.status} ${response.statusText}`
      });
    }

    const html = await response.text();

    // Use HTTP Last-Modified header as timestamp if available
    const lastModified = response.headers.get('last-modified');
    let updateTimestamp = null;
    if (lastModified) {
      try {
        const date = new Date(lastModified);
        // Format as DD.MM.YYYY HH:MM
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        updateTimestamp = `${day}.${month}.${year} ${hours}:${minutes}`;
      } catch (e) {
        console.error('Error parsing Last-Modified header:', e);
      }
    }

    timetableCache.set(url, { body: html, timestamp: updateTimestamp, expiresAt: now + TIMETABLE_TTL_MS });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (updateTimestamp) {
      res.setHeader('X-Schedule-Updated', updateTimestamp);
    }
    res.send(html);
  } catch (error) {
    console.error('Error fetching timetable:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all available skupinas for a class across all weeks
app.get('/api/skupinas/:classNum', async (req, res) => {
  const { classNum } = req.params;

  try {
    // Get available weeks from cache or fetch them
    let weeks = [];
    const now = Date.now();
    if (optionsCache.data && optionsCache.expiresAt > now) {
      weeks = optionsCache.data.weeks || [];
    }

    const subjectsMap = new Map();
    const paddedNum = classNum.toString().padStart(5, '0');

    // Fetch timetables for all available weeks
    for (const week of weeks) {
      const url = `https://sckr.si/vss/urniki/c/${week.value}/c${paddedNum}.htm`;

      try {
        const cached = timetableCache.get(url);
        let html;

        if (cached && cached.expiresAt > now) {
          html = cached.body;
        } else {
          const response = await fetch(url);
          if (response.ok) {
            html = await response.text();
            timetableCache.set(url, { body: html, expiresAt: now + TIMETABLE_TTL_MS });
          }
        }

        if (html) {
          // Parse HTML to extract skupinas
          const skupinaRegex = /Skupina\s+(\d+)/gi;
          const subjectRegex = /<font[^>]*size="3"[^>]*><b>([^<]+)<\/b><\/font>/gi;

          let match;
          const foundSubjects = new Set();

          // Find all subjects
          while ((match = subjectRegex.exec(html)) !== null) {
            foundSubjects.add(match[1].trim());
          }

          // Find all skupinas and associate with nearby subjects
          const lines = html.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const skupinaMatch = lines[i].match(/Skupina\s+(\d+)/i);
            if (skupinaMatch) {
              // Look for subject in nearby lines
              for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 10); j++) {
                const subMatch = lines[j].match(/<font[^>]*size="3"[^>]*><b>([^<]+)<\/b><\/font>/i);
                if (subMatch) {
                  const subject = subMatch[1].trim();
                  const skupinaNum = parseInt(skupinaMatch[1], 10);

                  if (!subjectsMap.has(subject)) {
                    subjectsMap.set(subject, new Set());
                  }
                  subjectsMap.get(subject).add(skupinaNum);
                  break;
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching week ${week.value}:`, err.message);
      }
    }

    // Convert to plain object
    const result = {};
    subjectsMap.forEach((skupinas, subject) => {
      result[subject] = Array.from(skupinas).sort((a, b) => a - b);
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching skupinas:', error);
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
