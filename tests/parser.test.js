const http = require('http');
const { JSDOM } = require('jsdom');

// Test configuration
const TEST_CONFIG = {
    baseUrl: 'http://localhost:3001',
    testClass: '00002', // RAI 2.l
    testWeek: '41' // Week starting 6.10.2025
};

// Expected classes based on HTML analysis
// Note: These are the classes that should be present in week 40 for class 00002
const expectedClasses = [
    // Ponedeljek 6.10.
    { day: "Ponedeljek 6.10.", slot: 8, subject: "EPP sv", teacher: "Balantič", room: "504", skupina: null },
    { day: "Ponedeljek 6.10.", slot: 12, subject: "NRP", teacher: "Dečman", room: "352", skupina: null },

    // Torek 7.10.
    { day: "Torek 7.10.", slot: 2, subject: "RSR lv", teacher: "Uhan", room: "253", skupina: 2 },
    { day: "Torek 7.10.", slot: 2, subject: "NRP lv", teacher: "Dečman", room: "500", skupina: 1 },
    { day: "Torek 7.10.", slot: 6, subject: "EPP", teacher: "Balantič", room: "504", skupina: null },

    // Sreda 8.10.
    { day: "Sreda 8.10.", slot: 2, subject: "ZBP2 lv", teacher: "Kralj B.", room: "274", skupina: 1 },
    { day: "Sreda 8.10.", slot: 7, subject: "ZBP2", teacher: "Kralj B.", room: "504", skupina: null },
    { day: "Sreda 8.10.", slot: 12, subject: "NRO", teacher: "Vehovec B.", room: "504", skupina: null },

    // Četrtek 9.10.
    { day: "Četrtek 9.10.", slot: 7, subject: "ZBP2 lv", teacher: "Kralj B.", room: "274", skupina: 2 },
    { day: "Četrtek 9.10.", slot: 7, subject: "RSR lv", teacher: "Uhan", room: "253", skupina: 3 },
    { day: "Četrtek 9.10.", slot: 12, subject: "NRO lv", teacher: "Vehovec B.", room: "504", skupina: null },

    // Petek 10.10.
    { day: "Petek 10.10.", slot: 2, subject: "RSR lv", teacher: "Uhan", room: "253", skupina: 1 },
    { day: "Petek 10.10.", slot: 2, subject: "NRP lv", teacher: "Dečman", room: "503", skupina: 2 }
];

/**
 * Fetch HTML from API
 */
function fetchHTML(path) {
    return new Promise((resolve, reject) => {
        http.get(`${TEST_CONFIG.baseUrl}${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

/**
 * Parse timetable HTML (copied from app.js)
 */
function parseTimetable(html) {
    const parser = new JSDOM(html);
    const doc = parser.window.document;
    const result = { days: [], className: '', weekLabel: '' };

    // Extract class name
    const bigFont = doc.querySelector('font[size="7"][color="#0000FF"]');
    if (bigFont) result.className = bigFont.textContent.trim();

    const table = doc.querySelector('table[border="3"]');
    if (!table) return result;

    const rows = Array.from(table.querySelectorAll('tr'));

    // Build a grid to track which columns are occupied and what content they have
    const grid = [];
    const MAX_COLS = 34; // 16 slots * 2 columns + 2 for day cell

    // First pass: build the grid and collect all cells
    let currentDay = null;
    let currentDayStartRow = -1;
    const dayClassCellsByColspan = new Map(); // Map from day name to Map(colspan -> cellStartColumn)
    const dayData = new Map(); // Map from day name to {day, classes, note}

    rows.forEach((row, rowIdx) => {
        // Get only direct child td elements, not nested ones
        const cells = Array.from(row.children).filter(el => el.tagName === 'TD');
        if (cells.length === 0) return;

        // Initialize grid row
        if (!grid[rowIdx]) grid[rowIdx] = [];

        // Check if this row starts a new day
        const dayCell = cells.find(cell => {
            const boldFont = cell.querySelector('font[size="4"] b');
            if (boldFont) {
                const text = boldFont.textContent;
                return text.includes('Ponedeljek') || text.includes('Torek') ||
                       text.includes('Sreda') || text.includes('Četrtek') ||
                       text.includes('Petek');
            }
            return false;
        });

        if (dayCell) {
            const boldFont = dayCell.querySelector('font[size="4"] b');
            const dayName = boldFont.textContent.trim();

            // Check for note
            const noteCell = cells.find(c => {
                const font = c.querySelector('font[size="3"]');
                return font && (font.textContent.includes('Pred začet') ||
                               font.textContent.includes('šol.leta'));
            });

            if (!dayData.has(dayName)) {
                if (noteCell) {
                    const font = noteCell.querySelector('font[size="3"]');
                    dayData.set(dayName, { day: dayName, classes: [], note: font.textContent.trim() });
                } else {
                    currentDay = dayName;
                    currentDayStartRow = rowIdx;
                    dayClassCellsByColspan.set(dayName, new Map());
                    dayData.set(dayName, { day: dayName, classes: [], note: null });
                }
            }
        }

        // Process all cells and place them in the grid
        let columnPosition = 0;

        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];

            // Skip to next free column
            while (grid[rowIdx][columnPosition] !== undefined && columnPosition < MAX_COLS) {
                columnPosition++;
            }

            const colspan = parseInt(cell.getAttribute('colspan') || '1');
            const rowspan = parseInt(cell.getAttribute('rowspan') || '1');

            // Store the start column for this cell
            let cellStartColumn = columnPosition;

            // Special case: if this is a single-cell row with bgcolor (concurrent class)
            // and it starts at column 0, find where it should actually be placed
            if (i === 0 && cellStartColumn === 0 && cell.getAttribute('bgcolor') && cells.length === 1 && currentDay) {
                // Look up the column position from the day's start row based on colspan
                const dayColspanMap = dayClassCellsByColspan.get(currentDay);
                if (dayColspanMap && dayColspanMap.has(colspan)) {
                    cellStartColumn = dayColspanMap.get(colspan);
                } else {
                    // Fallback: find first occupied column in this row's grid (from previous rows' rowspans)
                    for (let col = 0; col < MAX_COLS; col++) {
                        if (grid[rowIdx][col] !== undefined) {
                            cellStartColumn = col;
                            break;
                        }
                    }
                }
            }

            // If this is a class cell in the day start row, record its colspan -> column mapping
            if (rowIdx === currentDayStartRow && currentDay && cell.getAttribute('bgcolor') && cell.querySelector('table')) {
                const dayColspanMap = dayClassCellsByColspan.get(currentDay);
                if (dayColspanMap && !dayColspanMap.has(colspan)) {
                    dayColspanMap.set(colspan, cellStartColumn);
                }
            }

            // Mark grid cells as occupied and store cell reference
            for (let r = 0; r < rowspan; r++) {
                if (!grid[rowIdx + r]) grid[rowIdx + r] = [];
                for (let c = 0; c < colspan; c++) {
                    if (cellStartColumn + c < MAX_COLS) {
                        grid[rowIdx + r][cellStartColumn + c] = {
                            cell,
                            rowIdx,
                            columnPosition: cellStartColumn,
                            colspan,
                            rowspan
                        };
                    }
                }
            }

            // Extract class info if this is a class cell (has bgcolor and inner table)
            const bgcolor = cell.getAttribute('bgcolor');
            const innerTable = cell.querySelector('table');

            if (bgcolor && innerTable && currentDay) {
                // Column 0 is day cell, columns 1-2 are slot 1, columns 3-4 are slot 2, etc.
                // Formula: slot = floor((column - 1) / 2) + 1 for columns >= 1
                const slotNum = cellStartColumn === 0 ? 0 : Math.floor((cellStartColumn - 1) / 2) + 1;

                const classInfo = {
                    slot: slotNum,
                    subject: '',
                    teacher: '',
                    room: '',
                    note: '',
                    skupina: null,
                    duration: colspan / 2,
                    color: bgcolor,
                    dayName: currentDay
                };

                const innerRows = Array.from(innerTable.querySelectorAll('tr'));

                if (innerRows[0]) {
                    const firstRowCells = Array.from(innerRows[0].querySelectorAll('td'));
                    firstRowCells.forEach(td => {
                        const font = td.querySelector('font[size="2"]');
                        if (font) {
                            const text = font.textContent.trim();
                            if (text.includes('Skupina')) {
                                classInfo.note = text;
                                // Extract skupina number (e.g., "Skupina 1" -> 1)
                                const match = text.match(/Skupina\s+(\d+)/i);
                                if (match) classInfo.skupina = parseInt(match[1], 10);
                            } else if (!classInfo.teacher) {
                                classInfo.teacher = text;
                            }
                        }
                    });
                }

                if (innerRows[1]) {
                    const secondRowCells = Array.from(innerRows[1].querySelectorAll('td'));
                    secondRowCells.forEach(td => {
                        const boldSubject = td.querySelector('font[size="3"] b');
                        if (boldSubject) classInfo.subject = boldSubject.textContent.trim();

                        const fonts = Array.from(td.querySelectorAll('font[size="2"]'));
                        fonts.forEach(font => {
                            const text = font.textContent.trim();
                            if (text.match(/^\d+$/)) classInfo.room = text;
                        });
                    });
                }

                if (classInfo.subject) {
                    const dayInfo = dayData.get(currentDay);
                    if (dayInfo && !dayInfo.note) {
                        dayInfo.classes.push(classInfo);
                    }
                }
            }

            // Move columnPosition to after this cell
            columnPosition = cellStartColumn + colspan;
        }
    });

    // Convert dayData map to result array and sort classes by slot
    dayData.forEach((dayInfo) => {
        // Sort classes by slot number (chronological order)
        dayInfo.classes.sort((a, b) => a.slot - b.slot);
        result.days.push(dayInfo);
    });

    return result;
}

/**
 * Compare parsed schedule with expected classes
 */
function compareSchedules(parsed, expected) {
    const results = {
        correct: [],
        missing: [],
        extra: []
    };

    // Flatten parsed schedule
    const parsedFlat = [];
    parsed.days.forEach(day => {
        day.classes.forEach(cls => {
            parsedFlat.push({
                day: day.day,
                slot: cls.slot,
                subject: cls.subject,
                teacher: cls.teacher,
                room: cls.room,
                skupina: cls.skupina
            });
        });
    });

    // Check each expected class
    expected.forEach(exp => {
        const found = parsedFlat.find(p =>
            p.day === exp.day &&
            p.slot === exp.slot &&
            p.subject === exp.subject &&
            (exp.skupina === null || p.skupina === exp.skupina)
        );

        if (found) {
            results.correct.push(exp);
        } else {
            results.missing.push(exp);
        }
    });

    // Find extra classes
    parsedFlat.forEach(p => {
        const expected = expectedClasses.find(e =>
            e.day === p.day &&
            e.slot === p.slot &&
            e.subject === p.subject &&
            (e.skupina === null || e.skupina === p.skupina)
        );
        if (!expected) {
            results.extra.push(p);
        }
    });

    return results;
}

/**
 * Run the test suite
 */
async function runTests() {
    console.log('🧪 Testing Parser API...\n');
    console.log(`📡 Fetching from: ${TEST_CONFIG.baseUrl}`);
    console.log(`📚 Class: ${TEST_CONFIG.testClass}`);
    console.log(`📅 Week: ${TEST_CONFIG.testWeek}\n`);
    console.log('=' .repeat(80));

    try {
        // Fetch timetable HTML from API
        const html = await fetchHTML(`/api/timetable/${TEST_CONFIG.testWeek}/${TEST_CONFIG.testClass}`);

        // Parse the HTML
        const timetable = parseTimetable(html);

        // Display parsed schedule
        console.log(`\n📚 Class: ${timetable.className}`);
        console.log(`📅 Days found: ${timetable.days.length}\n`);
        console.log('📋 PARSED SCHEDULE:');
        console.log('=' .repeat(80));

        timetable.days.forEach(day => {
            console.log(`\n${day.day}:`);
            if (day.note) {
                console.log(`  Note: ${day.note}`);
            } else if (day.classes.length === 0) {
                console.log('  (No classes)');
            } else {
                day.classes.forEach(cls => {
                    const skupinaStr = cls.skupina ? ` [Skupina ${cls.skupina}]` : '';
                    console.log(`  Slot ${cls.slot}: ${cls.subject} - ${cls.teacher} (Room ${cls.room})${skupinaStr}`);
                });
            }
        });

        console.log('\n' + '=' .repeat(80));

        // Verify against expected classes
        console.log('\n🔍 VERIFICATION:');
        console.log('=' .repeat(80));

        const results = compareSchedules(timetable, expectedClasses);

        // Display results
        expectedClasses.forEach(exp => {
            const found = results.correct.find(c =>
                c.day === exp.day &&
                c.slot === exp.slot &&
                c.subject === exp.subject &&
                c.skupina === exp.skupina
            );

            const skupinaStr = exp.skupina ? ` [Skupina ${exp.skupina}]` : '';
            if (found) {
                console.log(`✓ ${exp.day}: Slot ${exp.slot} - ${exp.subject}${skupinaStr}`);
            } else {
                console.log(`✗ ${exp.day}: Slot ${exp.slot} - ${exp.subject}${skupinaStr}`);
                const parsedClass = timetable.days
                    .find(d => d.day === exp.day)?.classes
                    .find(c => c.subject === exp.subject && (exp.skupina === null || c.skupina === exp.skupina));
                if (parsedClass) {
                    console.log(`   Found at slot ${parsedClass.slot}: ${parsedClass.subject}`);
                } else {
                    console.log(`   Found at slot ${exp.slot}: nothing`);
                }
            }
        });

        console.log('\n' + '=' .repeat(80));

        // Summary
        const successRate = ((results.correct.length / expectedClasses.length) * 100).toFixed(1);
        console.log('\n📊 SUMMARY:');
        console.log(`  Expected classes: ${expectedClasses.length}`);
        console.log(`  Parsed classes: ${timetable.days.reduce((sum, d) => sum + d.classes.length, 0)}`);
        console.log(`  ✓ Correctly parsed: ${results.correct.length}`);
        console.log(`  ✗ Missing: ${results.missing.length}`);
        console.log(`  Extra (not expected): ${results.extra.length}`);
        console.log(`  Success rate: ${successRate}%`);

        if (results.extra.length > 0) {
            console.log('\n⚠️  EXTRA CLASSES (parsed but not in expected list):');
            results.extra.forEach(cls => {
                const skupinaStr = cls.skupina ? `, Skupina ${cls.skupina}` : '';
                console.log(`  ${cls.day}: Slot ${cls.slot} - ${cls.subject} (${cls.teacher}, ${cls.room}${skupinaStr})`);
            });
        }

        if (results.missing.length > 0) {
            console.log('\n❌ MISSING CLASSES (expected but not parsed):');
            results.missing.forEach(cls => {
                const skupinaStr = cls.skupina ? `, Skupina ${cls.skupina}` : '';
                console.log(`  ${cls.day}: Slot ${cls.slot} - ${cls.subject} (${cls.teacher}, ${cls.room}${skupinaStr})`);
            });
        }

        console.log('\n' + '=' .repeat(80));

        // Final result
        if (results.missing.length === 0 && results.extra.length === 0) {
            console.log('\n✅ ALL TESTS PASSED! Parser correctly extracts all classes.');
            process.exit(0);
        } else {
            console.log('\n❌ TESTS FAILED! Parser needs fixes.');
            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ TEST ERROR:', error.message);
        console.error('\nMake sure the server is running at', TEST_CONFIG.baseUrl);
        process.exit(1);
    }
}

// Run tests
runTests();
