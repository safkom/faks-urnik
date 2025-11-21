[!WARNING]
⚠️ Stara različica aplikacije
Ta projekt predstavlja zastarelo različico pregledovalnika urnikov ŠC Kranj, ki se ne uporablja več in se ne vzdržuje aktivno. Uporabljajte ga samo kot referenco ali arhiv.

# ŠC Kranj Urnik - Pregledovalnik Urnikov

Spletna aplikacija za pregledovanje urnikov Šolskega centra Kranj. Aplikacija omogoča pridobivanje in prikaz urnikov iz sistema ŠC Kranj (sckr.si) z možnostjo izvoza v koledar.

## Značilnosti

- 📅 Pregled urnikov po tednih in razredih
- 🌓 Moderna temna tema
- 📱 Odziven dizajn (mobilni in namizni zaslon)
- 📥 Izvoz posameznih ur ali celotnega tedna v iCal (.ics)
- ⚡ Hiter prikaz brez dodatnih odvisnosti
- 🔄 Posodobitev urnikov v realnem času

## Tehnologije

- **Backend**: Node.js, Express
- **Frontend**: Vanilla JavaScript (brez frameworkov)
- **CSS**: Tailwind@4

## Struktura projekta

```
faks-urnik/
├── server.js           # Express strežnik z CORS proxy
├── package.json        # NPM odvisnosti in skripta
├── public/
│   ├── index.html     # Glavna HTML stran
│   ├── app.js         # JavaScript aplikacijska logika
│   └── styles.css     # Stilska datoteka (dark theme)
└── README.md          # Ta datoteka
```

## Namestitev

1. Kloniraj ali prenesi projekt
2. Namesti odvisnosti:
```bash
npm install
```

## Zagon

```bash
npm start
```

Aplikacija bo dostopna na `http://localhost:3001`

## Uporaba

1. Izberi teden iz seznama
2. Izberi razred iz seznama
3. Urnik se avtomatsko osveži
4. Klikni na ikono prenosa (⬇) za izvoz posameznega predmeta v koledar
5. Klikni na "Export All to Calendar" za izvoz celotnega tedna

## API Endpoints

- `GET /api/options` - Vrne seznam razpoložljivih tednov in razredov
- `GET /api/timetable/:week/:classNum` - Pridobi urnik za določen teden in razred

## Razredi

Aplikacija podpira naslednje razrede:
- RAI (1.l, 2.l, 1.c, 2.c)
- INF (2.l, 3.c)
- MEH (1.l, 2.l, 1.c, 2.c, 3.c)
- ENE (1.l, 2.l, 1.c, 2.c, 3.c)
- VAR (1.c, 2.c, 3.c)
- EKN (1.l, 2.l Kom, 2.l Rač, 1.c Rač, 2.c Rač, 2.c Kom, 3.c Kom)
- OSM (1.c, 2.c)

## Odzivnost

Aplikacija je optimizirana za različne velikosti zaslonov:
- **Mobilni** (< 640px): Enojni stolpec z manjšimi gumbi
- **Tablični** (640px - 1024px): Dva stolpca za obrazce
- **Namizni** (> 1024px): Polna širina z optimiziranim razporedom
- **Veliki namizni** (> 1280px): Maksimalna širina 64rem

## Izvoz v koledar

Aplikacija generira .ics datoteke, ki jih lahko uvozite v:
- Google Calendar
- Apple Calendar
- Outlook
- Katerikoli koledar, ki podpira iCal format

## Licenca

MIT

## Avtor

Razvito za potrebe študentov ŠC Kranj.
