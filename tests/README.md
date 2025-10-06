# Tests

## Parser Test

The `parser.test.js` file tests the HTML parser that extracts class schedules from the ŠC Kranj timetable.

### Running Tests

```bash
npm test
```

Or directly:

```bash
node tests/parser.test.js
```

### Prerequisites

The server must be running for the tests to work:

```bash
npm start
```

### What It Tests

The test:
1. Fetches the current week's timetable HTML from the running server
2. Parses the HTML using the same parser logic as the web app
3. Verifies that all expected classes are correctly extracted, including:
   - Regular classes
   - Classes with skupinas (sub-groups)
   - Concurrent classes (multiple classes at the same time)
   - Multi-slot classes (classes spanning multiple time periods)

### Test Data

The test uses live data from the server API (`/api/timetable/41/00002`) for class RAI 2.l, week 41 (starting 6.10.2025).

Expected results include 13 classes across 5 days:
- 2 classes on Monday
- 3 classes on Tuesday (including 2 concurrent classes at slot 2)
- 3 classes on Wednesday
- 3 classes on Thursday (including 2 concurrent classes at slot 7)
- 2 classes on Friday (2 concurrent classes at slot 2)

### Success Criteria

The test passes when:
- All 13 expected classes are found
- Each class has the correct slot number, subject, teacher, and room
- Skupina numbers are correctly extracted
- No extra unexpected classes are found
- Classes are sorted chronologically by slot number
