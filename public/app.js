// Timetable App - Vanilla JavaScript
function darkenColor(hex, amount) {
    if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) return hex;
    let [r, g, b] = hex.substring(1).match(/.{2}/g).map(c => parseInt(c, 16));
    r = Math.max(0, r - amount);
    g = Math.max(0, g - amount);
    b = Math.max(0, b - amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

class TimetableApp {
    constructor() {
        this.timetable = null;
        this.loading = false;
        this.preferences = this.loadPreferences();
        this.selectedClass = this.preferences.defaultClass || '2';
        this.weekNumber = '40';
        this.availableWeeks = [];
        this.availableClasses = [];
        this.visibleSubjects = this.preferences.visibleSubjects || {};
        this.selectedSkupine = this.preferences.selectedSkupine || {};
        this.tempPreferences = null;
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
            visibleSubjects: {},
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
        const safeHandler = (fn) => {
            return async (...args) => {
                try {
                    await fn(...args);
                } catch (error) {
                    console.error('Event handler error:', error);
                    this.showError(`An error occurred: ${error.message}`);
                }
            };
        };

        document.getElementById('refreshBtn').addEventListener('click', safeHandler(() => this.fetchTimetable()));
        document.getElementById('exportAllBtn').addEventListener('click', safeHandler(() => this.downloadAllICS()));
        document.getElementById('settingsBtn').addEventListener('click', safeHandler(() => this.openSettings()));

        const todayBtn = document.getElementById('todayBtn');
        if (todayBtn) todayBtn.addEventListener('click', safeHandler(() => this.scrollToToday()));

        document.getElementById('weekSelect').addEventListener('change', safeHandler((e) => {
            const selectedWeek = e.target.value;
            if (this.availableWeeks.find(w => w.value === selectedWeek)) {
                this.weekNumber = selectedWeek;
                this.fetchTimetable();
            }
        }));

        document.getElementById('classSelect').addEventListener('change', safeHandler((e) => {
            this.selectedClass = e.target.value;
            try { localStorage.setItem('selectedClass', this.selectedClass); } catch { }
            this.preferences.defaultClass = this.selectedClass;
            this.savePreferences();
            this.fetchTimetable();
        }));

        document.getElementById('settingsModal').addEventListener('click', safeHandler((e) => {
            if (e.target.id === 'settingsModal') this.closeSettings();
        }));
    }

    async fetchOptions() {
        try {
            const response = await fetch('/api/options');
            if (!response.ok) throw new Error('Failed to fetch options');

            const data = await response.json();

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
                    endDate = new Date(y, mo, d + 4);
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
            const text = `${week.display || week.label}${week.isCurrent ? ' (trenutni)' : ''}`;
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
        [
            document.getElementById('refreshBtn'),
            document.getElementById('exportAllBtn'),
            document.getElementById('weekSelect'),
            document.getElementById('classSelect')
        ].forEach(el => { if (el) el.disabled = true; });
        this.render();

        try {
            const url = `/api/timetable/${this.weekNumber}/${this.selectedClass}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();
            this.timetable = this.parseTimetable(html);
            this.renderSkupinaFilters();
        } catch (err) {
            this.showError(`Error: ${err.message}`);
        } finally {
            this.loading = false;
            this.render();
            [
                document.getElementById('refreshBtn'),
                document.getElementById('exportAllBtn'),
                document.getElementById('weekSelect'),
                document.getElementById('classSelect')
            ].forEach(el => { if (el) el.disabled = false; });
        }
    }

    extractClassName(doc) {
        const bigFont = doc.querySelector('font[size="7"][color="#0000FF"]');
        return bigFont ? bigFont.textContent.trim() : '';
    }

    isDayCell(cell) {
        const boldFont = cell.querySelector('font[size="4"] b');
        if (!boldFont) return false;
        const text = boldFont.textContent;
        return text.includes('Ponedeljek') || text.includes('Torek') ||
               text.includes('Sreda') || text.includes('Četrtek') ||
               text.includes('Petek');
    }

    extractClassInfo(cell, currentDay, cellStartColumn) {
        const bgcolor = cell.getAttribute('bgcolor');
        const innerTable = cell.querySelector('table');
        if (!bgcolor || !innerTable || !currentDay) return null;

        // Calculate slot number: column 0 is day header, columns 1-2 are slot 1, 3-4 are slot 2, etc.
        // cellStartColumn should be >= 1 for valid slots
        let slotNum;
        if (cellStartColumn <= 0) {
            console.warn(`Invalid cellStartColumn ${cellStartColumn} for class in ${currentDay}`);
            slotNum = 1; // Default to slot 1 if position is invalid
        } else {
            slotNum = Math.floor((cellStartColumn - 1) / 2) + 1;
        }

        const colspan = parseInt(cell.getAttribute('colspan') || '1');

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
                        if (!classInfo.specialNote) {
                            classInfo.specialNote = text;
                        } else {
                            classInfo.specialNote += ', ' + text;
                        }
                    }
                });
            });
        }

        return classInfo.subject ? classInfo : null;
    }

    parseTimetable(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const result = { className: '', weekLabel: '', days: [] };

        result.className = this.extractClassName(doc);

        const selectedWeek = this.availableWeeks.find(w => w.value === this.weekNumber);
        if (selectedWeek) result.weekLabel = selectedWeek.display || selectedWeek.label;

        const table = doc.querySelector('table[border="3"]');
        if (!table) return result;

        const rows = Array.from(table.querySelectorAll('tr'));

        const grid = [];
        const MAX_COLS = 34;
        const dayClassCellsByColspan = new Map();

        const resolveStartColumn = (dayName, span, desiredPosition, dayStartRow, rowIndex) => {
            const candidates = [];

            const dayColspanMap = dayClassCellsByColspan.get(dayName);
            if (dayColspanMap) {
                const stored = dayColspanMap.get(span);
                if (stored && stored.length) {
                    candidates.push(...stored);
                }
            }

            for (let prev = rowIndex - 1; prev >= dayStartRow && prev >= 0; prev--) {
                const prevRow = grid[prev];
                if (!prevRow) continue;
                for (let col = 1; col < MAX_COLS; col++) {
                    const ref = prevRow[col];
                    if (ref && ref.colspan === span) {
                        candidates.push(ref.columnPosition);
                    }
                }
            }

            if (!candidates.length) return null;

            const uniqueSorted = Array.from(new Set(candidates)).sort((a, b) => a - b);
            const target = uniqueSorted.find(pos => pos >= desiredPosition);
            return target !== undefined ? target : uniqueSorted[uniqueSorted.length - 1];
        };

        let currentDay = null;
        let currentDayStartRow = -1;
        const dayData = new Map();

        rows.forEach((row, rowIdx) => {
            const cells = Array.from(row.children).filter(el => el.tagName === 'TD');
            if (cells.length === 0) return;

            if (!grid[rowIdx]) grid[rowIdx] = [];

            const dayCell = cells.find(cell => this.isDayCell(cell));

            if (dayCell) {
                const boldFont = dayCell.querySelector('font[size="4"] b');
                const dayName = boldFont.textContent.trim();

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

            let columnPosition = 0;

            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i];

                // Ensure grid row exists (but don't overwrite if it already has cells from rowspans)
                if (!grid[rowIdx]) {
                    grid[rowIdx] = [];
                }

                // Skip columns that are occupied by cells from previous rows (due to rowspan)
                while (grid[rowIdx][columnPosition] !== undefined && columnPosition < MAX_COLS) {
                    columnPosition++;
                }

                const colspan = parseInt(cell.getAttribute('colspan') || '1');
                const rowspan = parseInt(cell.getAttribute('rowspan') || '1');

                let cellStartColumn = columnPosition;

                const isClassCell = cell.getAttribute('bgcolor') && cell.querySelector('table');

                if (isClassCell && currentDay && cellStartColumn === 0) {
                    const fallbackColumn = resolveStartColumn(currentDay, colspan, columnPosition, currentDayStartRow, rowIdx);
                    if (typeof fallbackColumn === 'number' && fallbackColumn >= 0) {
                        cellStartColumn = fallbackColumn;
                    }
                }

                if (rowIdx === currentDayStartRow && currentDay && isClassCell) {
                    const dayColspanMap = dayClassCellsByColspan.get(currentDay);
                    if (dayColspanMap) {
                        let stored = dayColspanMap.get(colspan);
                        if (!stored) {
                            stored = [];
                            dayColspanMap.set(colspan, stored);
                        }
                        if (!stored.includes(cellStartColumn)) {
                            stored.push(cellStartColumn);
                            stored.sort((a, b) => a - b);
                        }
                    }
                }

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

                const classInfo = this.extractClassInfo(cell, currentDay, cellStartColumn);
                if (classInfo) {
                    const dayInfo = dayData.get(currentDay);
                    if (dayInfo && !dayInfo.note) {
                        dayInfo.classes.push(classInfo);
                    }
                }

                columnPosition = cellStartColumn + colspan;
            }
        });

        dayData.forEach((dayInfo) => {
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

        const endSlotId = slotId + duration - 1;
        const endSlot = this.timeSlots.find(s => s.id === endSlotId);
        return endSlot ? `${startSlot.start}-${endSlot.end}` : `${startSlot.start}-${startSlot.end}`;
    }

    generateICSEvent(cls) {
        const startSlot = this.timeSlots.find(s => s.id === cls.slot);
        if (!startSlot) return null;

        const endSlotId = cls.slot + (cls.duration || 1) - 1;
        const endSlot = this.timeSlots.find(s => s.id === endSlotId) || startSlot;

        const dateMatch = cls.dayName.match(/(\d+)\.(\d+)\.(\d{4})?/);
        if (!dateMatch) return null;

        const dayNum = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10);
        let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : null;

        if (!year && this.timetable.weekLabel) {
            const weekYearMatch = this.timetable.weekLabel.match(/\.(\d{4})$/);
            if (weekYearMatch) {
                year = parseInt(weekYearMatch[1], 10);
            }
        }

        if (!year) {
            const now = new Date();
            year = now.getFullYear();
            if (now.getMonth() === 11 && month <= 8) {
                year++;
            }
            if (now.getMonth() <= 7 && month >= 9) {
                year--;
            }
        }

        const eventDate = new Date(year, month - 1, dayNum);

        if (eventDate.getDate() !== dayNum || eventDate.getMonth() !== month - 1 || eventDate.getFullYear() !== year) {
            console.warn(`Invalid date in ICS export: ${dayNum}.${month}.${year} for class ${cls.subject}`);
            return null;
        }

        const dayNameLower = cls.dayName.toLowerCase();
        const dayOfWeek = eventDate.getDay();
        const expectedDayOfWeek = dayNameLower.includes('ponedeljek') ? 1 :
                                 dayNameLower.includes('torek') ? 2 :
                                 dayNameLower.includes('sreda') || dayNameLower.includes('sredo') ? 3 :
                                 dayNameLower.includes('četrtek') ? 4 :
                                 dayNameLower.includes('petek') ? 5 : -1;

        if (expectedDayOfWeek !== -1 && dayOfWeek !== expectedDayOfWeek) {
            console.warn(`Day of week mismatch for ${cls.subject}: expected ${expectedDayOfWeek}, got ${dayOfWeek} for date ${dayNum}.${month}.${year}`);
            return null;
        }

        if (dayOfWeek === 0 || dayOfWeek === 6) {
            console.warn(`Skipping weekend class: ${cls.subject} on ${dayNum}.${month}.${year}`);
            return null;
        }

        const d = dayNum.toString().padStart(2, '0');
        const m = month.toString().padStart(2, '0');
        const y = year.toString();

        // Format times properly: "8:05" -> "080500", "13:50" -> "135000"
        const formatTime = (timeStr) => {
            const [hours, minutes] = timeStr.split(':');
            return `${hours.padStart(2, '0')}${minutes.padStart(2, '0')}00`;
        };

        const startTime = formatTime(startSlot.start);
        const endTime = formatTime(endSlot.end);

        let description = `Class: ${this.timetable.className}\\nTeacher: ${cls.teacher || 'N/A'}\\nRoom: ${cls.room || 'N/A'}`;
        if (cls.specialNote) {
            description += `\\nNote: ${cls.specialNote}`;
        }

        const summary = cls.subject + (cls.note ? ' - ' + cls.note : '') + (cls.specialNote ? ` (${cls.specialNote})` : '');

        return `BEGIN:VEVENT
UID:${cls.subject}-${d}${m}${y}-${startTime}@sckranj.si
DTSTAMP:${y}${m}${d}T${startTime}00
DTSTART:${y}${m}${d}T${startTime}00
DTEND:${y}${m}${d}T${endTime}00
SUMMARY:${summary}
DESCRIPTION:${description}
LOCATION:Room ${cls.room || 'TBD'}
END:VEVENT
`;
    }

    downloadICS(dayIndex, classIndex) {
        if (!this.timetable || !this.timetable.days[dayIndex]) return;
        const day = this.timetable.days[dayIndex];
        if (!day.classes || !day.classes[classIndex]) return;
        const classInfo = day.classes[classIndex];

        const event = this.generateICSEvent(classInfo);
        if (!event) return;

        const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ŠC Kranj//Urnik//EN
${event}END:VCALENDAR`;

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${classInfo.subject.replace(/\s+/g, '_')}_${classInfo.dayName.split(' ')[0]}.ics`;
        link.click();
    }

    downloadDayICS(dayIndex) {
        if (!this.timetable || !this.timetable.days[dayIndex]) return;
        const day = this.timetable.days[dayIndex];

        let allEvents = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ŠC Kranj//Urnik//EN\n';

        day.classes.forEach(cls => {
            if (!this.shouldShowClass(cls)) return;
            const event = this.generateICSEvent(cls);
            if (event) allEvents += event;
        });

        allEvents += 'END:VCALENDAR';

        const blob = new Blob([allEvents], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const dayName = day.day.split(' ')[0].replace(/,/g, '');
        link.download = `${this.timetable.className.replace(/\s+/g, '_')}_${dayName}.ics`;
        link.click();
    }

    downloadAllICS() {
        if (!this.timetable) return;

        let allEvents = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ŠC Kranj//Urnik//EN\n';

        this.timetable.days.forEach(day => {
            day.classes.forEach(cls => {
                if (!this.shouldShowClass(cls)) return;
                const event = this.generateICSEvent(cls);
                if (event) allEvents += event;
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

        let html = '<div class="grid grid-cols-[auto_1fr] sm:w-60 gap-x-4 gap-y-2 items-center">';
        subjectsMap.forEach((skupinas, subject) => {
            const skupinaArray = Array.from(skupinas).sort((a, b) => a - b);
            if (skupinaArray.length > 1) {
                const selectedValue = this.selectedSkupine[subject] || 'all';
                html += `
                    <label class="text-right text-sm sm:text-base">${subject}:</label>
                    <select onchange="app.filterSkupina('${subject.replace(/'/g, "\\'")}', this.value)" class="w-full pl-3 pr-10 py-2 text-base focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border border-gray-500 bg-gray-700 text-white">
                        <option value="all" ${selectedValue === 'all' ? 'selected' : ''}>All</option>
                        ${skupinaArray.map(s => `<option value="${s}" ${selectedValue == s ? 'selected' : ''}>Skupina ${s}</option>`).join('')}
                    </select>
                `;
            }
        });
        html += '</div>';

        container.innerHTML = html;
        section.style.display = 'block';
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
            text.textContent = 'Skrij Filtre Skupin';
        } else {
            container.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
            text.textContent = 'Pokaži Filtre Skupin';
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

    async openSettings() {
        this.tempPreferences = {
            defaultClass: this.selectedClass,
            visibleSubjects: { ...this.visibleSubjects },
            selectedSkupine: { ...this.selectedSkupine }
        };

        const classSelect = document.getElementById('settingsClassSelect');
        classSelect.innerHTML = this.availableClasses.map(cls =>
            `<option value="${cls.value}" ${cls.value === this.selectedClass ? 'selected' : ''}>${cls.label}</option>`
        ).join('');

        classSelect.onchange = async (e) => {
            this.tempPreferences.defaultClass = e.target.value;
            await this.fetchAllSkupinasForClass(e.target.value);
            this.renderSettingsSubjects();
            this.renderSettingsSkupine();
        };

        await this.fetchAllSkupinasForClass(this.selectedClass);
        this.renderSettingsSubjects();
        this.renderSettingsSkupine();
        document.getElementById('settingsModal').style.display = 'flex';
    }

    renderSettingsSubjects() {
        const container = document.getElementById('settingsSubjectContainer');
        const subjectsMap = this.allSkupinasMap || this.getSkupinasBySubject();

        if (!subjectsMap || subjectsMap.size === 0) {
            container.innerHTML = '<p class="help-text">Nismo našli predmetov za ta razred.</p>';
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
            container.innerHTML = '<p class="help-text">Nismo našli skupin za ta razred.</p>';
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
        try {
            const response = await fetch(`/api/skupinas/${classValue}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const skupinasData = await response.json();

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

    async showOnboarding() {
        this.onboardingCurrentStep = 1;

        const classSelect = document.getElementById('onboardingClassSelect');
        classSelect.innerHTML = this.availableClasses.map(cls =>
            `<option value="${cls.value}">${cls.label}</option>`
        ).join('');

        document.getElementById('onboardingModal').style.display = 'flex';
        this.updateOnboardingStep();
    }

    onboardingNextStep() {
        if (this.onboardingCurrentStep === 1) {
            const classSelect = document.getElementById('onboardingClassSelect');
            this.tempPreferences = { defaultClass: classSelect.value, visibleSubjects: {}, selectedSkupine: {} };
            this.loadOnboardingSubjects();
        } else if (this.onboardingCurrentStep === 2) {
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
        for (let i = 1; i <= this.onboardingTotalSteps; i++) {
            document.getElementById(`onboardingStep${i}`).style.display = 'none';
        }

        document.getElementById(`onboardingStep${this.onboardingCurrentStep}`).style.display = 'block';

        const titles = [
            'Welcome to ŠC Kranj Urnik!',
            'Select Your Subjects',
            'Select Your Skupinas'
        ];
        document.getElementById('onboardingTitle').textContent = titles[this.onboardingCurrentStep - 1];

        document.getElementById('onboardingBackBtn').style.display = this.onboardingCurrentStep > 1 ? 'inline-block' : 'none';
        document.getElementById('onboardingNextBtn').style.display = this.onboardingCurrentStep < this.onboardingTotalSteps ? 'inline-block' : 'none';
        document.getElementById('onboardingFinishBtn').style.display = this.onboardingCurrentStep === this.onboardingTotalSteps ? 'inline-block' : 'none';
    }

    async loadOnboardingSubjects() {
        const classValue = this.tempPreferences.defaultClass;
        await this.fetchAllSkupinasForClass(classValue);

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
        const checkboxes = document.querySelectorAll('.onboarding-subject-checkbox');
        checkboxes.forEach(cb => {
            const subject = cb.dataset.subject;
            this.tempPreferences.visibleSubjects[subject] = cb.checked;
        });

        const container = document.getElementById('onboardingSkupinaContainer');
        const subjectsMap = this.allSkupinasMap;

        if (!subjectsMap || subjectsMap.size === 0) {
            container.innerHTML = '<p class="help-text">No subjects with skupinas found.</p>';
            return;
        }

        let html = '<div class="skupina-filters-grid">';
        let hasSkupinas = false;

        subjectsMap.forEach((skupinas, subject) => {
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
        this.selectedClass = this.tempPreferences.defaultClass;
        this.preferences.defaultClass = this.selectedClass;

        this.visibleSubjects = this.tempPreferences.visibleSubjects;
        this.preferences.visibleSubjects = this.visibleSubjects;

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

        if (this.visibleSubjects[cls.subject] === false) return false;

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

        const content = document.getElementById('content');
        content.innerHTML = '';

        if (this.loading) {
            content.innerHTML = `
                <div class="flex flex-col items-center justify-center p-10 text-gray-500">
                    <svg class="animate-spin h-8 w-8 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p>Loading...</p>
                </div>
            `;
            return;
        }

        if (!this.timetable) {
            return;
        }

        const todayName = this.getTodayName();
        const daysFragment = document.createDocumentFragment();

        this.timetable.days.forEach((day, dayIdx) => {
            const isToday = (todayName && (day.day || '').includes(todayName)) || this.isTodayByDate(day.day);
            const visibleClasses = day.classes.filter(cls => this.shouldShowClass(cls));

            const dayCard = document.createElement('div');
            dayCard.className = `day-card bg-[#1a1a2e] rounded-lg shadow-md overflow-hidden mb-6 ${isToday ? 'border-2 border-indigo-500' : ''}`;

            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header bg-gray-800 p-3 font-bold text-white text-bold border-b border-gray-600 flex justify-between items-center';

            const dayTitle = document.createElement('span');
            dayTitle.textContent = day.day;
            dayHeader.appendChild(dayTitle);

            if (visibleClasses.length > 0 && !day.note) {
                const exportBtn = document.createElement('button');
                exportBtn.className = 'text-green-400 hover:text-green-300 cursor-pointer';
                exportBtn.title = 'Izvozi dan';
                exportBtn.onclick = () => this.downloadDayICS(dayIdx);
                exportBtn.innerHTML = `
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                `;
                dayHeader.appendChild(exportBtn);
            }

            dayCard.appendChild(dayHeader);

            const dayContent = document.createElement('div');
            dayContent.className = 'p-3';

            if (day.note) {
                dayContent.innerHTML = `<div class="text-center text-bold text-white italic p-4">${day.note}</div>`;
            } else if (visibleClasses.length === 0) {
                dayContent.innerHTML = `<div class="text-center text-bold text-white p-4">Brez predmetov</div>`;
            } else {
                day.classes.forEach((cls, clsIdx) => {
                    if (!this.shouldShowClass(cls)) return;

                    const classItem = document.createElement('div');
                    classItem.className = 'p-3 rounded-lg not-last:mb-3 text-gray-800';
                    classItem.style.backgroundColor = darkenColor(cls.color, 40) || '#D1D5DB';

                    classItem.innerHTML = `
                        <div class="flex justify-between items-start">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-bold bg-indigo-500 text-white text-sm px-2 py-1 rounded-full">${cls.subject}</span>
                                ${cls.note ? `<span class="text-xs italic">${cls.note}</span>` : ''}
                            </div>
                            <button class="text-gray-500 hover:text-indigo-700 cursor-pointer" onclick="app.downloadICS(${dayIdx}, ${clsIdx})" title="Izvozi v koledar">
                                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="mt-3 text-sm flex flex-row gap-3">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-gray-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                <span>${this.getTimeForSlot(cls.slot, cls.duration)}</span>
                            </div>
                            ${cls.teacher ? `
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-gray-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                <span>${cls.teacher}</span>
                            </div>` : ''}
                            ${cls.room ? `
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-gray-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                <span>Uč. ${cls.room}</span>
                            </div>` : ''}
                        </div>
                    `;
                    dayContent.appendChild(classItem);
                });
            }
            dayCard.appendChild(dayContent);
            daysFragment.appendChild(dayCard);
        });

        content.appendChild(daysFragment);
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

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new TimetableApp();
});
