const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// API routes must come BEFORE static file serving
// Get available weeks and classes - dynamically parsed from sample pages
app.get('/api/options', async (req, res) => {
  try {
    // Fetch a sample page to extract metadata
    const sampleUrl = 'https://sckr.si/vss/urniki/c/40/c00001.htm';
    const response = await fetch(sampleUrl);
    const html = await response.text();

    // Parse weeks and classes from the page
    const weeks = [];
    const classes = [];

    // Extract weeks - check multiple week numbers to find available ones
    const weekNumbers = [38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 1, 2, 3, 4, 5];
    for (const week of weekNumbers) {
      try {
        const testUrl = `https://sckr.si/vss/urniki/c/${week}/c00001.htm`;
        const testResponse = await fetch(testUrl, { method: 'HEAD' });
        if (testResponse.ok) {
          weeks.push({ value: week.toString(), label: `Teden ${week}` });
        }
      } catch (err) {
        // Skip unavailable weeks
      }
      if (weeks.length >= 10) break; // Limit to 10 weeks
    }

    // Extract classes - try class numbers 1-50
    for (let i = 1; i <= 50; i++) {
      try {
        const paddedNum = i.toString().padStart(5, '0');
        const testUrl = `https://sckr.si/vss/urniki/c/40/c${paddedNum}.htm`;
        const testResponse = await fetch(testUrl);

        if (testResponse.ok) {
          const pageHtml = await testResponse.text();
          // Extract class name from the page
          const classMatch = pageHtml.match(/<font size="7"[^>]*>([^<]+)<\/font>/);
          if (classMatch) {
            const className = classMatch[1].trim().replace(/\r?\n/g, '').replace(/&nbsp;/g, '').trim();
            classes.push({ value: i.toString(), label: className });
          }
        }
      } catch (err) {
        // Skip unavailable classes
      }
    }

    // Fallback to hardcoded options if parsing fails
    if (weeks.length === 0) {
      weeks.push(
        { value: '40', label: 'Teden 40' },
        { value: '41', label: 'Teden 41' }
      );
    }

    if (classes.length === 0) {
      classes.push(
        { value: '1', label: 'RAI 1.l' },
        { value: '2', label: 'RAI 2.l' }
      );
    }

    res.json({ weeks, classes });
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
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `HTTP ${response.status} ${response.statusText}`
      });
    }

    const html = await response.text();
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
