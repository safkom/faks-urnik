// Timetable App - Vanilla JavaScript
class TimetableApp {
    constructor() {
        this.timetable = null;
        this.loading = false;
        this.preferences = this.loadPreferences();
        this.selectedClass = this.preferences.defaultClass || '2';
        this.weekNumber = '40';
        this.availableWeeks = [];
        this.availableClasses = [];
        this.visibleSubjects = this.preferences.visibleSubjects || {}; // Which subjects to show
        this.selectedSkupine = this.preferences.selectedSkupine || {}; // Store selected skupina per subject
        this.tempPreferences = null; // For storing temporary settings during modal editing
        this.onboardingCurrentStep = 1;
        this.onboardingTotalSteps = 3;

        this.timeSlots = [
            { id: 1, start: '7:15', end: '8:00' },
            { id: 2, start: '8:05', end: '8:50' },
            { id: 3, start: '8:55', end: '9:40' },
            { id: 4, start: '9:45', end: '10:30' },
            { id: 5, start: '10:35', end: '11:20' },
            { id: 6, start: '11:25', end: '12:10' },
            { id: 7, start: '12:15', end: '13:00' },
            { id: 8, start: '13:05', end: '13:50' },
            { id: 9, start: '13:55', end: '14:40' },
            { id: 10, start: '14:45', end: '15:30' },
            { id: 11, start: '15:35', end: '16:20' },
            { id: 12, start: '16:25', end: '17:10' },
            { id: 13, start: '17:15', end: '18:00' },
            { id: 14, start: '18:05', end: '18:50' },
            { id: 15, start: '18:55', end: '19:40' },
            { id: 16, start: '19:45', end: '20:30' },
        ];

        this.init();
    }

    async init() {
        await this.fetchOptions();

        // Check if this is first time user
        if (!this.preferences.onboardingComplete) {
            this.showOnboarding();
        } else {
            await this.fetchTimetable();
        }

        this.setupEventListeners();
    }

    loadPreferences() {
        try {
            const stored = localStorage.getItem('userPreferences');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error('Error loading preferences:', e);
        }
        return {
            onboardingComplete: false,
            defaultClass: null,
            visibleSubjects: {}, // Map of subject -> boolean (true = visible)
            selectedSkupine: {}
        };
    }

    savePreferences() {
        try {
            localStorage.setItem('userPreferences', JSON.stringify(this.preferences));
        } catch (e) {
            console.error('Error saving preferences:', e);
        }
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => this.fetchTimetable());
        document.getElementById('exportAllBtn').addEventListener('click', () => this.downloadAllICS());
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());

        const todayBtn = document.getElementById('todayBtn');
        if (todayBtn) todayBtn.addEventListener('click', () => this.scrollToToday());

        document.getElementById('weekSelect').addEventListener('change', (e) => {
            const selectedWeek = e.target.value;
            // Only allow selecting from available weeks
            if (this.availableWeeks.find(w => w.value === selectedWeek)) {
                this.weekNumber = selectedWeek;
                this.fetchTimetable();
            }
        });

        document.getElementById('classSelect').addEventListener('change', (e) => {
            this.selectedClass = e.target.value;
            this.preferences.defaultClass = this.selectedClass;
            this.savePreferences();
            this.fetchTimetable();
        });

        // Close modals when clicking outside
        document.getElementById('settingsModal').addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') this.closeSettings();
        });
    }

    async fetchOptions() {
        try {
            const response = await fetch('/api/options');
            if (!response.ok) throw new Error('Failed to fetch options');

            const data = await response.json();

            // Enhance weeks with start/end range and current-week flag
            this.availableWeeks = (data.weeks || []).map(w => {
                const m = (w.label || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
                let display = w.label;
                let startDate = null;
                let endDate = null;
                let isCurrent = false;
                if (m) {
                    const d = parseInt(m[1], 10);
                    const mo = parseInt(m[2], 10) - 1;
                    const y = parseInt(m[3], 10);
                    startDate = new Date(y, mo, d);
                    endDate = new Date(y, mo, d + 4); // Mon-Fri range
                    const fmt = (date) => `${date.getDate()}.${date.getMonth() + 1}.`;
                    display = `${fmt(startDate)} - ${fmt(endDate)}`;
                    const now = new Date();
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                    isCurrent = today >= start && today <= end;
                }
                return { ...w, display, startDate, endDate, isCurrent };
            });
            this.availableClasses = data.classes || [];

            // Default to current week if exists; otherwise first
            const current = this.availableWeeks.find(w => w.isCurrent);
            if (current) this.weekNumber = current.value;
            else if (this.availableWeeks.length > 0) this.weekNumber = this.availableWeeks[0].value;

            this.renderWeekSelect();
            this.renderClassSelect();
        } catch (err) {
            console.error('Error fetching options:', err);
        }
    }

    renderWeekSelect() {
        const select = document.getElementById('weekSelect');
        select.innerHTML = this.availableWeeks.map(week => {
            const text = `${week.display || week.label}${week.isCurrent ? ' (current)' : ''}`;
            return `<option value="${week.value}" ${week.value === this.weekNumber ? 'selected' : ''}>${text}</option>`;
        }).join('');
    }

    renderClassSelect() {
        const select = document.getElementById('classSelect');
        select.innerHTML = this.availableClasses.map(cls =>
            `<option value="${cls.value}" ${cls.value === this.selectedClass ? 'selected' : ''}>${cls.label}</option>`
        ).join('');
    }

    async fetchTimetable() {
        this.loading = true;
        // Disable controls while loading
        [
            document.getElementById('refreshBtn'),
            document.getElementById('exportAllBtn'),
            document.getElementById('weekSelect'),
            document.getElementById('classSelect')
        ].forEach(el => { if (el) el.disabled = true; });
        this.render();

        try {
            // Just pass the class number, server will pad it
            const url = `/api/timetable/${this.weekNumber}/${this.selectedClass}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();
            this.timetable = this.parseTimetable(html);
            this.timetable.lastUpdated = response.headers.get('X-Schedule-Updated') || null;
            this.renderSkupinaFilters();
        } catch (err) {
            this.showError(`Error: ${err.message}`);
        } finally {
            this.loading = false;
            this.render();
            // Re-enable controls
            [
                document.getElementById('refreshBtn'),
                document.getElementById('exportAllBtn'),
                document.getElementById('weekSelect'),
                document.getElementById('classSelect')
            ].forEach(el => { if (el) el.disabled = false; });
        }
    }

    parseTimetable(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const result = { className: '', weekLabel: '', days: [] };

        const bigFont = doc.querySelector('font[size="7"][color="#0000FF"]');
        if (bigFont) result.className = bigFont.textContent.trim();

        const selectedWeek = this.availableWeeks.find(w => w.value === this.weekNumber);
        if (selectedWeek) result.weekLabel = selectedWeek.display || selectedWeek.label;

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
                        specialNote: '',
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
                                if (text.match(/^\d+$/)) {
                                    classInfo.room = text;
                                } else if (text && !text.includes('Skupina')) {
                                    // This is a special note (e.g., "karierni dan")
                                    if (!classInfo.specialNote) {
                                        classInfo.specialNote = text;
                                    } else {
                                        classInfo.specialNote += ', ' + text;
                                    }
                                }
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

    getTimeForSlot(slotId, duration = 1) {
        const startSlot = this.timeSlots.find(s => s.id === slotId);
        if (!startSlot) return `Slot ${slotId}`;

        if (duration === 1) {
            return `${startSlot.start}-${startSlot.end}`;
        }

        // For multi-slot classes, get end time from the last slot
        const endSlotId = slotId + duration - 1;
        const endSlot = this.timeSlots.find(s => s.id === endSlotId);
        return endSlot ? `${startSlot.start}-${endSlot.end}` : `${startSlot.start}-${startSlot.end}`;
    }

    downloadICS(dayIndex, classIndex) {
        if (!this.timetable || !this.timetable.days[dayIndex]) return;
        const day = this.timetable.days[dayIndex];
        if (!day.classes || !day.classes[classIndex]) return;
        const classInfo = day.classes[classIndex];

        const startSlot = this.timeSlots.find(s => s.id === classInfo.slot);
        if (!startSlot) return;

        // Calculate end slot based on duration
        const endSlotId = classInfo.slot + (classInfo.duration || 1) - 1;
        const endSlot = this.timeSlots.find(s => s.id === endSlotId) || startSlot;

        const dateMatch = classInfo.dayName.match(/(\d+)\.(\d+)\.?/);
        if (!dateMatch) return;

        const day_num = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].padStart(2, '0');
        const year = new Date().getFullYear();

        const startTime = startSlot.start.replace(':', '');
        const endTime = endSlot.end.replace(':', '');

        const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ŠC Kranj//Urnik//EN
BEGIN:VEVENT
UID:${classInfo.subject}-${day_num}${month}${year}-${startTime}@sckranj.si
DTSTAMP:${year}${month}${day_num}T${startTime}00
DTSTART:${year}${month}${day_num}T${startTime}00
DTEND:${year}${month}${day_num}T${endTime}00
SUMMARY:${classInfo.subject}${classInfo.note ? ' - ' + classInfo.note : ''}
DESCRIPTION:Class: ${this.timetable.className}\\nTeacher: ${classInfo.teacher || 'N/A'}\\nRoom: ${classInfo.room || 'N/A'}
LOCATION:Room ${classInfo.room || 'TBD'}
END:VEVENT
END:VCALENDAR`;

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${classInfo.subject.replace(/\s+/g, '_')}_${classInfo.dayName.split(' ')[0]}.ics`;
        link.click();
    }

    downloadAllICS() {
        if (!this.timetable) return;

        let allEvents = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ŠC Kranj//Urnik//EN\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n';

        this.timetable.days.forEach(day => {
            day.classes.forEach(cls => {
                const startSlot = this.timeSlots.find(s => s.id === cls.slot);
                if (!startSlot) return;

                // Calculate end slot based on duration
                const endSlotId = cls.slot + (cls.duration || 1) - 1;
                const endSlot = this.timeSlots.find(s => s.id === endSlotId) || startSlot;

                // Parse date from day name - format: "Ponedeljek 6.10." or "Ponedeljek 6.10.2025"
                const dateMatch = cls.dayName.match(/(\d+)\.(\d+)\.(\d{4})?/);
                if (!dateMatch) return;

                const day = parseInt(dateMatch[1], 10);
                const month = parseInt(dateMatch[2], 10);
                // If year is provided in the day name, use it; otherwise infer from the week label
                let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : null;

                // If no year in day name, try to get it from week label
                if (!year && this.timetable.weekLabel) {
                    const weekYearMatch = this.timetable.weekLabel.match(/\.(\d{4})$/);
                    if (weekYearMatch) {
                        year = parseInt(weekYearMatch[1], 10);
                    }
                }

                // Fallback: use current year, but adjust if month suggests different year
                if (!year) {
                    const now = new Date();
                    year = now.getFullYear();
                    // If we're in December and the schedule shows January-August, it's next year
                    if (now.getMonth() === 11 && month <= 8) {
                        year++;
                    }
                    // If we're in January-August and the schedule shows September-December, it's last year
                    if (now.getMonth() <= 7 && month >= 9) {
                        year--;
                    }
                }

                // Create date object and validate
                const eventDate = new Date(year, month - 1, day);

                // Validate the date is correct (handles invalid dates like Feb 30)
                if (eventDate.getDate() !== day || eventDate.getMonth() !== month - 1 || eventDate.getFullYear() !== year) {
                    console.warn(`Invalid date in ICS export: ${day}.${month}.${year} for class ${cls.subject}`);
                    return;
                }

                // Validate day of week matches the day name
                const dayNameLower = cls.dayName.toLowerCase();
                const dayOfWeek = eventDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
                const expectedDayOfWeek = dayNameLower.includes('ponedeljek') ? 1 :
                                         dayNameLower.includes('torek') ? 2 :
                                         dayNameLower.includes('sreda') || dayNameLower.includes('sredo') ? 3 :
                                         dayNameLower.includes('četrtek') ? 4 :
                                         dayNameLower.includes('petek') ? 5 : -1;

                if (expectedDayOfWeek !== -1 && dayOfWeek !== expectedDayOfWeek) {
                    console.warn(`Day of week mismatch for ${cls.subject}: expected ${expectedDayOfWeek}, got ${dayOfWeek} for date ${day}.${month}.${year}`);
                    return;
                }

                // Skip if it's Sunday (0) or Saturday (6) - shouldn't happen in school schedule
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    console.warn(`Skipping weekend class: ${cls.subject} on ${day}.${month}.${year}`);
                    return;
                }

                const d = day.toString().padStart(2, '0');
                const m = month.toString().padStart(2, '0');
                const y = year.toString();

                const startTime = startSlot.start.replace(':', '');
                const endTime = endSlot.end.replace(':', '');

                // Build description with special notes
                let description = `Class: ${this.timetable.className}\\nTeacher: ${cls.teacher || 'N/A'}\\nRoom: ${cls.room || 'N/A'}`;
                if (cls.specialNote) {
                    description += `\\nNote: ${cls.specialNote}`;
                }

                const summary = cls.subject + (cls.note ? ' - ' + cls.note : '') + (cls.specialNote ? ` (${cls.specialNote})` : '');

                allEvents += `BEGIN:VEVENT
UID:${cls.subject}-${d}${m}${y}-${startTime}@sckranj.si
DTSTAMP:${y}${m}${d}T${startTime}00
DTSTART:${y}${m}${d}T${startTime}00
DTEND:${y}${m}${d}T${endTime}00
SUMMARY:${summary}
DESCRIPTION:${description}
LOCATION:Room ${cls.room || 'TBD'}
END:VEVENT
`;
            });
        });

        allEvents += 'END:VCALENDAR';

        const blob = new Blob([allEvents], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${this.timetable.className.replace(/\s+/g, '_')}_week_${this.weekNumber}.ics`;
        link.click();
    }

    showError(message) {
        const errorDiv = document.getElementById('error');
        errorDiv.innerHTML = `<p class="error-text">${message}</p>`;
        errorDiv.style.display = 'block';
    }

    hideError() {
        document.getElementById('error').style.display = 'none';
    }

    getSkupinasBySubject() {
        const subjectsMap = new Map();
        if (!this.timetable) return subjectsMap;

        this.timetable.days.forEach(day => {
            day.classes.forEach(cls => {
                if (cls.skupina !== null && cls.subject) {
                    if (!subjectsMap.has(cls.subject)) {
                        subjectsMap.set(cls.subject, new Set());
                    }
                    subjectsMap.get(cls.subject).add(cls.skupina);
                }
            });
        });

        return subjectsMap;
    }

    renderSkupinaFilters() {
        const section = document.getElementById('skupinaFiltersSection');
        const container = document.getElementById('skupinaFilters');
        const subjectsMap = this.getSkupinasBySubject();

        if (subjectsMap.size === 0) {
            section.style.display = 'none';
            return;
        }

        let html = '<div class="skupina-filters-grid">';
        subjectsMap.forEach((skupinas, subject) => {
            const skupinaArray = Array.from(skupinas).sort((a, b) => a - b);
            if (skupinaArray.length > 1) {
                const selectedValue = this.selectedSkupine[subject] || 'all';
                html += `
                    <div class="skupina-filter-item">
                        <label>${subject}:</label>
                        <select onchange="app.filterSkupina('${subject.replace(/'/g, "\\'")}', this.value)">
                            <option value="all" ${selectedValue === 'all' ? 'selected' : ''}>All</option>
                            ${skupinaArray.map(s => `<option value="${s}" ${selectedValue == s ? 'selected' : ''}>Skupina ${s}</option>`).join('')}
                        </select>
                    </div>
                `;
            }
        });
        html += '</div>';

        container.innerHTML = html;
        section.style.display = 'block';
        // Keep them collapsed by default
        if (!this.skupinaFiltersExpanded) {
            container.style.display = 'none';
        }
    }

    toggleSkupinaFilters() {
        const container = document.getElementById('skupinaFilters');
        const icon = document.getElementById('skupinaToggleIcon');
        const text = document.getElementById('skupinaToggleText');

        this.skupinaFiltersExpanded = !this.skupinaFiltersExpanded;

        if (this.skupinaFiltersExpanded) {
            container.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
            text.textContent = 'Hide Skupina Filters';
        } else {
            container.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
            text.textContent = 'Show Skupina Filters';
        }
    }

    filterSkupina(subject, value) {
        if (value === 'all') {
            delete this.selectedSkupine[subject];
            delete this.preferences.selectedSkupine[subject];
        } else {
            this.selectedSkupine[subject] = parseInt(value, 10);
            this.preferences.selectedSkupine[subject] = parseInt(value, 10);
        }
        this.savePreferences();
        this.render();
    }

    // Settings Modal
    async openSettings() {
        // Store current preferences as temp in case user cancels
        this.tempPreferences = {
            defaultClass: this.selectedClass,
            visibleSubjects: { ...this.visibleSubjects },
            selectedSkupine: { ...this.selectedSkupine }
        };

        // Populate class select
        const classSelect = document.getElementById('settingsClassSelect');
        classSelect.innerHTML = this.availableClasses.map(cls =>
            `<option value="${cls.value}" ${cls.value === this.selectedClass ? 'selected' : ''}>${cls.label}</option>`
        ).join('');

        // Add change listener to fetch all skupinas across all weeks
        classSelect.onchange = async (e) => {
            this.tempPreferences.defaultClass = e.target.value;
            await this.fetchAllSkupinasForClass(e.target.value);
            this.renderSettingsSubjects();
            this.renderSettingsSkupine();
        };

        // Fetch all skupinas for current class
        await this.fetchAllSkupinasForClass(this.selectedClass);
        this.renderSettingsSubjects();
        this.renderSettingsSkupine();
        document.getElementById('settingsModal').style.display = 'flex';
    }

    renderSettingsSubjects() {
        const container = document.getElementById('settingsSubjectContainer');
        const subjectsMap = this.allSkupinasMap || this.getSkupinasBySubject();

        if (!subjectsMap || subjectsMap.size === 0) {
            container.innerHTML = '<p class="help-text">No subjects found for this class.</p>';
            return;
        }

        const subjects = Array.from(subjectsMap.keys()).sort();

        let html = '<div class="skupina-filters-grid">';
        subjects.forEach(subject => {
            const isVisible = this.tempPreferences?.visibleSubjects?.[subject] !== false;
            html += `
                <label class="checkbox-label">
                    <input type="checkbox" class="settings-subject-checkbox" data-subject="${subject}" ${isVisible ? 'checked' : ''}>
                    <span>${subject}</span>
                </label>
            `;
        });
        html += '</div>';
        container.innerHTML = html;

        // Add change listeners
        container.querySelectorAll('.settings-subject-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const subject = e.target.dataset.subject;
                if (!this.tempPreferences.visibleSubjects) {
                    this.tempPreferences.visibleSubjects = {};
                }
                this.tempPreferences.visibleSubjects[subject] = e.target.checked;
            });
        });
    }

    renderSettingsSkupine() {
        const container = document.getElementById('settingsSkupinaContainer');
        const subjectsMap = this.allSkupinasMap || this.getSkupinasBySubject();

        if (subjectsMap.size === 0) {
            container.innerHTML = '<p class="help-text">No skupine found for this class.</p>';
            return;
        }

        let html = '<div class="settings-skupina-section"><h3>Default Skupine:</h3><div class="skupina-filters-grid">';
        subjectsMap.forEach((skupinas, subject) => {
            const skupinaArray = Array.from(skupinas).sort((a, b) => a - b);
            if (skupinaArray.length > 1) {
                const selectedValue = this.tempPreferences?.selectedSkupine[subject] || this.selectedSkupine[subject] || 'all';
                html += `
                    <div class="skupina-filter-item">
                        <label>${subject}:</label>
                        <select onchange="app.updateTempSkupina('${subject.replace(/'/g, "\\'")}', this.value)">
                            <option value="all" ${selectedValue === 'all' ? 'selected' : ''}>All</option>
                            ${skupinaArray.map(s => `<option value="${s}" ${selectedValue == s ? 'selected' : ''}>Skupina ${s}</option>`).join('')}
                        </select>
                    </div>
                `;
            }
        });
        html += '</div></div>';
        container.innerHTML = html;
    }

    updateTempSkupina(subject, value) {
        if (!this.tempPreferences) this.tempPreferences = { selectedSkupine: {} };
        if (!this.tempPreferences.selectedSkupine) this.tempPreferences.selectedSkupine = {};

        if (value === 'all') {
            delete this.tempPreferences.selectedSkupine[subject];
        } else {
            this.tempPreferences.selectedSkupine[subject] = parseInt(value, 10);
        }
    }

    async fetchTimetableForClass(classValue) {
        // Temporarily fetch timetable for the selected class to show available skupine
        try {
            const url = `/api/timetable/${this.weekNumber}/${classValue}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            this.timetable = this.parseTimetable(html);
        } catch (err) {
            console.error('Error fetching timetable for class:', err);
        }
    }

    async fetchAllSkupinasForClass(classValue) {
        // Fetch all skupinas across all weeks for a class
        try {
            const response = await fetch(`/api/skupinas/${classValue}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const skupinasData = await response.json();

            // Convert to the format used by getSkupinasBySubject
            this.allSkupinasMap = new Map();
            Object.keys(skupinasData).forEach(subject => {
                this.allSkupinasMap.set(subject, new Set(skupinasData[subject]));
            });
        } catch (err) {
            console.error('Error fetching all skupinas:', err);
            this.allSkupinasMap = new Map();
        }
    }

    saveSettings() {
        if (this.tempPreferences) {
            this.selectedClass = this.tempPreferences.defaultClass;
            this.visibleSubjects = this.tempPreferences.visibleSubjects || {};
            this.selectedSkupine = this.tempPreferences.selectedSkupine || {};
            this.preferences.defaultClass = this.selectedClass;
            this.preferences.visibleSubjects = this.visibleSubjects;
            this.preferences.selectedSkupine = this.selectedSkupine;
            this.savePreferences();
        }

        this.closeSettings();
        this.fetchTimetable();
    }

    closeSettings() {
        document.getElementById('settingsModal').style.display = 'none';
        this.tempPreferences = null;
    }

    // Onboarding Modal
    async showOnboarding() {
        this.onboardingCurrentStep = 1;

        // Populate class select
        const classSelect = document.getElementById('onboardingClassSelect');
        classSelect.innerHTML = this.availableClasses.map(cls =>
            `<option value="${cls.value}">${cls.label}</option>`
        ).join('');

        // Show modal
        document.getElementById('onboardingModal').style.display = 'flex';
        this.updateOnboardingStep();
    }

    onboardingNextStep() {
        if (this.onboardingCurrentStep === 1) {
            // Load subjects for selected class
            const classSelect = document.getElementById('onboardingClassSelect');
            this.tempPreferences = { defaultClass: classSelect.value, visibleSubjects: {}, selectedSkupine: {} };
            this.loadOnboardingSubjects();
        } else if (this.onboardingCurrentStep === 2) {
            // Load skupinas for visible subjects
            this.loadOnboardingSkupinas();
        }

        if (this.onboardingCurrentStep < this.onboardingTotalSteps) {
            this.onboardingCurrentStep++;
            this.updateOnboardingStep();
        }
    }

    onboardingPrevStep() {
        if (this.onboardingCurrentStep > 1) {
            this.onboardingCurrentStep--;
            this.updateOnboardingStep();
        }
    }

    updateOnboardingStep() {
        // Hide all steps
        for (let i = 1; i <= this.onboardingTotalSteps; i++) {
            document.getElementById(`onboardingStep${i}`).style.display = 'none';
        }

        // Show current step
        document.getElementById(`onboardingStep${this.onboardingCurrentStep}`).style.display = 'block';

        // Update title
        const titles = [
            'Welcome to ŠC Kranj Urnik!',
            'Select Your Subjects',
            'Select Your Skupinas'
        ];
        document.getElementById('onboardingTitle').textContent = titles[this.onboardingCurrentStep - 1];

        // Update buttons
        document.getElementById('onboardingBackBtn').style.display = this.onboardingCurrentStep > 1 ? 'inline-block' : 'none';
        document.getElementById('onboardingNextBtn').style.display = this.onboardingCurrentStep < this.onboardingTotalSteps ? 'inline-block' : 'none';
        document.getElementById('onboardingFinishBtn').style.display = this.onboardingCurrentStep === this.onboardingTotalSteps ? 'inline-block' : 'none';
    }

    async loadOnboardingSubjects() {
        const classValue = this.tempPreferences.defaultClass;
        await this.fetchAllSkupinasForClass(classValue);

        // Get all unique subjects
        const subjects = Array.from(this.allSkupinasMap.keys()).sort();

        const container = document.getElementById('onboardingSubjectContainer');
        if (subjects.length === 0) {
            container.innerHTML = '<p class="help-text">No subjects found for this class.</p>';
            return;
        }

        let html = '<div class="skupina-filters-grid">';
        subjects.forEach(subject => {
            html += `
                <label class="checkbox-label">
                    <input type="checkbox" class="onboarding-subject-checkbox" data-subject="${subject}" checked>
                    <span>${subject}</span>
                </label>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    async loadOnboardingSkupinas() {
        // Collect selected subjects
        const checkboxes = document.querySelectorAll('.onboarding-subject-checkbox');
        checkboxes.forEach(cb => {
            const subject = cb.dataset.subject;
            this.tempPreferences.visibleSubjects[subject] = cb.checked;
        });

        // Show only skupinas for visible subjects
        const container = document.getElementById('onboardingSkupinaContainer');
        const subjectsMap = this.allSkupinasMap;

        if (!subjectsMap || subjectsMap.size === 0) {
            container.innerHTML = '<p class="help-text">No subjects with skupinas found.</p>';
            return;
        }

        let html = '<div class="skupina-filters-grid">';
        let hasSkupinas = false;

        subjectsMap.forEach((skupinas, subject) => {
            // Only show if subject is visible
            if (!this.tempPreferences.visibleSubjects[subject]) return;

            const skupinaArray = Array.from(skupinas).sort((a, b) => a - b);
            if (skupinaArray.length > 1) {
                hasSkupinas = true;
                html += `
                    <div class="skupina-filter-item">
                        <label>${subject}:</label>
                        <select class="onboarding-skupina-select" data-subject="${subject}">
                            <option value="all">All</option>
                            ${skupinaArray.map(s => `<option value="${s}">Skupina ${s}</option>`).join('')}
                        </select>
                    </div>
                `;
            }
        });
        html += '</div>';

        if (!hasSkupinas) {
            container.innerHTML = '<p class="help-text">No subjects with multiple skupinas. Click "Get Started" to continue!</p>';
        } else {
            container.innerHTML = html;
        }
    }

    async completeOnboarding() {
        // Save class
        this.selectedClass = this.tempPreferences.defaultClass;
        this.preferences.defaultClass = this.selectedClass;

        // Save visible subjects
        this.visibleSubjects = this.tempPreferences.visibleSubjects;
        this.preferences.visibleSubjects = this.visibleSubjects;

        // Save skupinas
        const skupinaSelects = document.querySelectorAll('.onboarding-skupina-select');
        skupinaSelects.forEach(select => {
            const subject = select.dataset.subject;
            const value = select.value;
            if (value !== 'all') {
                this.selectedSkupine[subject] = parseInt(value, 10);
                this.preferences.selectedSkupine[subject] = parseInt(value, 10);
            }
        });

        this.preferences.onboardingComplete = true;
        this.savePreferences();

        document.getElementById('onboardingModal').style.display = 'none';
        this.tempPreferences = null;
        await this.fetchTimetable();
    }

    shouldShowClass(cls) {
        if (!cls.subject) return true;

        // Check if subject is explicitly hidden
        if (this.visibleSubjects[cls.subject] === false) return false;

        // Check skupina filter
        if (cls.skupina === null) return true;
        const selectedSkupina = this.selectedSkupine[cls.subject];
        if (selectedSkupina === undefined) return true;
        return cls.skupina === selectedSkupina;
    }

    render() {
        this.hideError();

        if (this.timetable?.className) {
            let subtitleHTML = this.timetable.className;
            if (this.timetable.weekLabel) {
                subtitleHTML += ` — ${this.timetable.weekLabel}`;
            }
            if (this.timetable.lastUpdated) {
                subtitleHTML += `<br><small style="opacity: 0.7;">Updated: ${this.timetable.lastUpdated}</small>`;
            }
            document.getElementById('subtitle').innerHTML = subtitleHTML;
            document.getElementById('exportAllBtn').style.display = 'flex';
        }

        if (this.loading) {
            document.getElementById('content').innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <p>Loading...</p>
                </div>
            `;
            return;
        }

        if (!this.timetable) {
            document.getElementById('content').innerHTML = '';
            return;
        }

        const todayName = this.getTodayName();
        const html = this.timetable.days.map((day, dayIdx) => {
            const isToday = (todayName && (day.day || '').includes(todayName)) || this.isTodayByDate(day.day);
            const visibleClasses = day.classes.filter(cls => this.shouldShowClass(cls));
            return `
            <div class="day-card${isToday ? ' current' : ''}">
                <div class="day-header">${day.day}</div>
                <div class="day-content">
                    ${day.note ? `<div class=\"day-note\">${day.note}</div>` :
                      visibleClasses.length === 0 ? `<div class=\"day-empty\">No classes</div>` :
                      day.classes.map((cls, clsIdx) => {
                        if (!this.shouldShowClass(cls)) return '';
                        return `
                        <div class=\"class-item\" style=\"background-color: ${cls.color || '#EEF2FF'}\">
                            <div class=\"class-header\">
                                <div style=\"display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;\">
                                    <span class=\"class-badge\">${cls.subject}</span>
                                    ${cls.note ? `<span class=\"class-note\">${cls.note}</span>` : ''}
                                    ${cls.specialNote ? `<span class=\"class-note\" style=\"background: #FFA500; color: white;\">${cls.specialNote}</span>` : ''}
                                </div>
                                <button class=\"btn-icon\" onclick=\"app.downloadICS(${dayIdx}, ${clsIdx})\" title=\"Export to calendar\">
                                    <svg class=\"icon\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">
                                        <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path>
                                        <polyline points=\"7 10 12 15 17 10\"></polyline>
                                        <line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"></line>
                                    </svg>
                                </button>
                            </div>
                            <div class=\"class-details\">
                                <div class=\"detail-item\">
                                    <svg class=\"icon\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">
                                        <circle cx=\"12\" cy=\"12\" r=\"10\"></circle>
                                        <polyline points=\"12 6 12 12 16 14\"></polyline>
                                    </svg>
                                    ${this.getTimeForSlot(cls.slot, cls.duration)}
                                </div>
                                ${cls.teacher ? `
                                <div class=\"detail-item\">
                                    <svg class=\"icon\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">
                                        <path d=\"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2\"></path>
                                        <circle cx=\"12\" cy=\"7\" r=\"4\"></circle>
                                    </svg>
                                    ${cls.teacher}
                                </div>` : ''}
                                ${cls.room ? `
                                <div class=\"detail-item\">
                                    <svg class=\"icon\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">
                                        <path d=\"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z\"></path>
                                        <circle cx=\"12\" cy=\"10\" r=\"3\"></circle>
                                    </svg>
                                    Room ${cls.room}
                                </div>` : ''}
                            </div>
                        </div>
                        `;
                      }).join('')}
                </div>
            </div>`;
        }).join('');

        document.getElementById('content').innerHTML = html;
    }

    getTodayName() {
        const days = [null, 'Ponedeljek', 'Torek', 'Sreda', 'Četrtek', 'Petek'];
        const dow = new Date().getDay();
        return days[dow] || null;
    }

    isTodayByDate(dayHeaderText) {
        const d = new Date();
        const day = d.getDate();
        const mon = d.getMonth() + 1;
        const pat = new RegExp(`\\b${day}\\.\\s*${mon}\\.`);
        return pat.test(dayHeaderText || '');
    }

    scrollToToday() {
        const todayName = this.getTodayName();
        const cards = Array.from(document.querySelectorAll('.day-card'));
        let target = null;
        for (const card of cards) {
            const header = card.querySelector('.day-header');
            const text = header?.textContent || '';
            if ((todayName && text.includes(todayName)) || this.isTodayByDate(text)) { target = card; break; }
        }
        if (!target && cards.length) target = cards[0];
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new TimetableApp();
});
