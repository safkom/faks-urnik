// Timetable App - Vanilla JavaScript
class TimetableApp {
    constructor() {
        this.timetable = null;
        this.loading = false;
        this.selectedClass = '2';
        this.weekNumber = '40';
        this.availableWeeks = [];
        this.availableClasses = [];

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
        await this.fetchTimetable();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => this.fetchTimetable());
        document.getElementById('exportAllBtn').addEventListener('click', () => this.downloadAllICS());
        document.getElementById('weekSelect').addEventListener('change', (e) => {
            this.weekNumber = e.target.value;
            this.fetchTimetable();
        });
        document.getElementById('classSelect').addEventListener('change', (e) => {
            this.selectedClass = e.target.value;
            this.fetchTimetable();
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
        const processedDays = new Set(); // Track day names, not row indices

        rows.forEach((row, rowIdx) => {
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length === 0) return;

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

                // Skip if we've already processed this day
                if (processedDays.has(dayName)) return;
                processedDays.add(dayName);

                const noteCell = cells.find(c => {
                    const font = c.querySelector('font[size="3"]');
                    return font && (font.textContent.includes('Pred začet') ||
                                   font.textContent.includes('šol.leta'));
                });

                if (noteCell) {
                    const font = noteCell.querySelector('font[size="3"]');
                    result.days.push({ day: dayName, classes: [], note: font.textContent.trim() });
                } else {
                    const dayClasses = [];

                    for (let i = 1; i < cells.length; i++) {
                        const cell = cells[i];
                        const bgcolor = cell.getAttribute('bgcolor');
                        if (!bgcolor) continue;

                        const colspan = parseInt(cell.getAttribute('colspan') || '2');
                        const innerTable = cell.querySelector('table');
                        if (!innerTable) continue;

                        let prevSibling = cell;
                        let columnCount = 0;

                        while (prevSibling = prevSibling.previousElementSibling) {
                            if (prevSibling === cells[0]) break;
                            columnCount += parseInt(prevSibling.getAttribute('colspan') || '2');
                        }

                        const slotNum = Math.floor(columnCount / 2) + 1;
                        const classInfo = {
                            slot: slotNum,
                            subject: '',
                            teacher: '',
                            room: '',
                            note: '',
                            duration: colspan / 2,
                            color: bgcolor,
                            dayName: dayName
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

                        if (classInfo.subject) dayClasses.push(classInfo);
                    }

                    result.days.push({ day: dayName, classes: dayClasses, note: null });
                }
            }
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

    downloadICS(classInfo) {
        const startSlot = this.timeSlots.find(s => s.id === classInfo.slot);
        if (!startSlot) return;

        // Calculate end slot based on duration
        const endSlotId = classInfo.slot + (classInfo.duration || 1) - 1;
        const endSlot = this.timeSlots.find(s => s.id === endSlotId) || startSlot;

        const dateMatch = classInfo.dayName.match(/(\d+)\.(\d+)\.?/);
        if (!dateMatch) return;

        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].padStart(2, '0');
        const year = new Date().getFullYear();

        const startTime = startSlot.start.replace(':', '');
        const endTime = endSlot.end.replace(':', '');

        const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ŠC Kranj//Urnik//EN
BEGIN:VEVENT
UID:${classInfo.subject}-${day}${month}${year}-${startTime}@sckranj.si
DTSTAMP:${year}${month}${day}T${startTime}00
DTSTART:${year}${month}${day}T${startTime}00
DTEND:${year}${month}${day}T${endTime}00
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

        let allEvents = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ŠC Kranj//Urnik//EN\n';

        this.timetable.days.forEach(day => {
            day.classes.forEach(cls => {
                const startSlot = this.timeSlots.find(s => s.id === cls.slot);
                if (!startSlot) return;

                // Calculate end slot based on duration
                const endSlotId = cls.slot + (cls.duration || 1) - 1;
                const endSlot = this.timeSlots.find(s => s.id === endSlotId) || startSlot;

                const dateMatch = cls.dayName.match(/(\d+)\.(\d+)\.?/);
                if (!dateMatch) return;

                const d = dateMatch[1].padStart(2, '0');
                const m = dateMatch[2].padStart(2, '0');
                const y = new Date().getFullYear();

                const startTime = startSlot.start.replace(':', '');
                const endTime = endSlot.end.replace(':', '');

                allEvents += `BEGIN:VEVENT
UID:${cls.subject}-${d}${m}${y}-${startTime}@sckranj.si
DTSTAMP:${y}${m}${d}T${startTime}00
DTSTART:${y}${m}${d}T${startTime}00
DTEND:${y}${m}${d}T${endTime}00
SUMMARY:${cls.subject}${cls.note ? ' - ' + cls.note : ''}
DESCRIPTION:Class: ${this.timetable.className}\\nTeacher: ${cls.teacher || 'N/A'}\\nRoom: ${cls.room || 'N/A'}
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

    render() {
        this.hideError();

        if (this.timetable?.className) {
            const label = this.timetable.weekLabel ? ` — ${this.timetable.weekLabel}` : '';
            document.getElementById('subtitle').textContent = `${this.timetable.className}${label}`;
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

        const html = this.timetable.days.map(day => `
            <div class="day-card">
                <div class="day-header">${day.day}</div>
                <div class="day-content">
                    ${day.note ? `<div class="day-note">${day.note}</div>` :
                      day.classes.length === 0 ? `<div class="day-empty">No classes</div>` :
                      day.classes.map((cls, idx) => `
                        <div class="class-item" style="background-color: ${cls.color || '#EEF2FF'}">
                            <div class="class-header">
                                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                    <span class="class-badge">${cls.subject}</span>
                                    ${cls.note ? `<span class="class-note">${cls.note}</span>` : ''}
                                </div>
                                <button class="btn-icon" onclick="app.downloadICS(${JSON.stringify(cls).replace(/"/g, '&quot;')})" title="Export to calendar">
                                    <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                </button>
                            </div>
                            <div class="class-details">
                                <div class="detail-item">
                                    <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                    </svg>
                                    ${this.getTimeForSlot(cls.slot, cls.duration)}
                                </div>
                                ${cls.teacher ? `
                                <div class="detail-item">
                                    <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="12" cy="7" r="4"></circle>
                                    </svg>
                                    ${cls.teacher}
                                </div>` : ''}
                                ${cls.room ? `
                                <div class="detail-item">
                                    <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                        <circle cx="12" cy="10" r="3"></circle>
                                    </svg>
                                    Room ${cls.room}
                                </div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        document.getElementById('content').innerHTML = html;
    }
}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new TimetableApp();
});
