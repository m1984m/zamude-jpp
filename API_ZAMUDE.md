# Marprom RTPI — izračun zamud JPP Maribor

Specifikacija za drugega agenta: kako dostopati do podatkov o zamudah avtobusov Marprom za **vse postaje** in izračunati zamudo v minutah. Vir podatkov: javno dostopen `Prikazovalnik` endpoint (brez API ključa).

---

## 1. Vhodni podatki, ki jih potrebuješ

| Vir | Kaj pridobiš | Od kod |
|-----|--------------|--------|
| **Marprom RTPI** | Živ status odhodov po postaji (JSON) | `https://vozniredi.marprom.si/wsPrikazovalnik/` |
| **GTFS static** | Seznam postaj (`stop_id`, `stop_name`), linije, vozni redi, smeri | `https://www.marprom.si/` (javno objavljen GTFS ZIP) ali iz obstoječe kopije `C:\Users\Allen\Claude\projekti\jpp_maribor\gtfs_raw\` |

GTFS je **obvezen** — REST endpoint sam po sebi ne pove scheduled časa, zato ni mogoče izračunati zamude brez lokalnega `stop_times.txt`.

---

## 2. REST endpoint

### 2.1 Odhodi po postaji

```
GET https://vozniredi.marprom.si/wsPrikazovalnik/stop-point-buses/{stopId}?steviloVrstic={N}
```

- `{stopId}` — numerični `stop_id` iz GTFS `stops.txt` (npr. `209`, `412`).
- `steviloVrstic` — koliko naslednjih odhodov vrne (max ~20 je razumno).
- CORS: odprt (deluje iz brskalnika `file://` in z domene).
- Rate limit: ni dokumentiran. **Preizkušeno**: 12 sočasnih zahtev × ~7 s timeout × cca 454 postaj = ~30–45 s cel cikel. Brez zavračanj.

### 2.2 Odgovor (shape)

```json
[
  { "line": "G1",  "time": "Odhod" },
  { "line": "2B",  "time": "1 min" },
  { "line": "G3",  "time": "07:42" },
  ...
]
```

Polja, ki jih rabiš:
- `line` — `route_short_name` (oznaka, ki jo vidi potnik: `G1`, `2B`, `P7`).
- `time` — status. Pomembne vrednosti:
  - `"Odhod"` → bus je **zdajle** na postaji (trenutek zajema = dejanski čas odhoda).
  - `"N min"` (npr. `"3 min"`) → bus prihaja čez N min (scheduled countdown; ni uporabno za izračun dejanske zamude).
  - `"HH:MM"` → fiksna scheduled ura (za kasnejše ture, brez live korekcije).

**Za izračun zamude uporabi SAMO zapise `time === "Odhod"`.** Vse drugo ni odhodni dogodek v realnem času.

### 2.3 Druge znane poti (nismo testirali, bookmark)

- `/wsPrikazovalnik/city-buses/true?steviloVrstic=N` — agregirani seznam za mestne linije (uporablja prikazovalnik na AP Mlinska).
- `/wsPrikazovalnik/regional-buses/true?steviloVrstic=N` — regionalne.

---

## 3. Seznam vseh postaj

Iz GTFS `stops.txt` (CSV):

```
stop_id,stop_name,stop_lat,stop_lon,...
1,Glavna avtobusna postaja Maribor,46.5603,15.6506,...
2,Glavni trg,46.5586,15.6458,...
```

Parse → `[{id: 1, name: "Glavna avtobusna postaja..."}, ...]`. Pričakovano: ~454 postaj.

---

## 4. Algoritem izračuna zamude

### 4.1 Priprava scheduled indexa (enkrat, ob nalaganju GTFS)

Cilj: hitro poizvedovanje »za (stopId, line) mi daj seznam vseh scheduled odhodnih sekund dneva«.

```js
// Po obdelavi stop_times.txt + trips.txt + routes.txt:
DEP_INDEX: Map<string, Array<{sec: number, dir: 0|1}>>
// ključ: `${stopId}|${route_short_name}`
// sec: sekunde od polnoči (GTFS dovoli > 86400 za ture čez polnoč — obdrži tako!)
// dir: direction_id iz trips.txt (0 ali 1)
```

Vsak `departure_time` (format `HH:MM:SS`, lahko `25:15:00`) pretvori v sekunde:
```js
function toSec(t) {
  const m = t.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  return m ? (+m[1])*3600 + (+m[2])*60 + (+m[3]) : null;
}
```

### 4.2 Zanka zajema (vsakih 60 s)

```js
const BASE = 'https://vozniredi.marprom.si/wsPrikazovalnik';
const CONCURRENCY = 12;
const MATCH_WINDOW_SEC = 10 * 60; // ±10 min

async function fetchStop(stopId) {
  const res = await fetch(`${BASE}/stop-point-buses/${stopId}?steviloVrstic=20`,
                          { cache: 'no-store' });
  return res.ok ? await res.json() : [];
}

// Worker pool za paralelizacijo čez vse postaje
async function collectAll(stops) {
  const events = [];
  let i = 0;
  async function worker() {
    while (i < stops.length) {
      const s = stops[i++];
      const now = new Date();
      const snap = await fetchStop(s.id).catch(() => []);
      for (const row of snap) {
        if (String(row.time).toLowerCase() !== 'odhod') continue;
        const ev = matchEvent(s, row, now);
        if (ev) events.push(ev);
      }
    }
  }
  await Promise.all(Array.from({length: CONCURRENCY}, worker));
  return events;
}
```

### 4.3 Matching scheduled ↔ actual (ključna logika)

```js
function matchEvent(stop, row, now) {
  const line = String(row.line || '').trim();
  const schedArr = DEP_INDEX.get(`${stop.id}|${line}`);
  if (!schedArr) return null;

  const actualSec = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();

  // ZNAN BUG v v0.3: polnoč — ture z scheduled sec > 86400 se nikoli ne ujamejo,
  // ker je actualSec vedno < 86400. Rešitev: primerjaj s toleranco čez polnoč.
  const candidates = schedArr.map(s => ({
    ...s,
    diff: circularDiff(s.sec, actualSec)  // glej spodaj
  })).filter(s => Math.abs(s.diff) <= MATCH_WINDOW_SEC);

  if (!candidates.length) return null;

  // PREFER FORWARD: bus »Odhod« pomeni, da je že moral odpeljati →
  // raje scheduled ≤ actual (pozitivna zamuda) kot scheduled v prihodnosti.
  candidates.sort((a, b) => {
    const aPast = a.diff >= 0, bPast = b.diff >= 0;
    if (aPast !== bPast) return aPast ? -1 : 1;
    return Math.abs(a.diff) - Math.abs(b.diff);
  });

  const best = candidates[0];
  return {
    tsISO: now.toISOString(),
    stopId: stop.id,
    stopName: stop.name,
    line,
    dir: best.dir,           // 0 ali 1 iz GTFS direction_id
    schedSec: best.sec,
    actualSec,
    delayMin: Math.round(best.diff / 60)   // + zamuda, - prezgodaj
  };
}

// Čez polnoč robusten diff (tolerira GTFS sec > 86400):
function circularDiff(schedSec, actualSec) {
  const raw = actualSec - schedSec;
  const wrapped = raw > 43200 ? raw - 86400 : (raw < -43200 ? raw + 86400 : raw);
  return wrapped;
}
```

### 4.4 Zamuda v minutah

```
delayMin = round((actualSec - schedSec) / 60)
```
- `> 0` → zamuda
- `< 0` → prezgodaj (v praksi redko, ker »Odhod« status API-ja pomeni realen čas odhoda)
- `= 0` → točen

---

## 5. Dedup (obvezno!)

Status `"Odhod"` lahko na API-ju ostane **več kot 60 s** — brez dedupa isti odhod v dveh zaporednih osvežitvah šteje dvakrat.

```js
const seen = new Set();  // živ čez vse cikle

function isNewEvent(ev) {
  const ymd = ev.tsISO.slice(0, 10);  // "2026-04-20"
  const key = `${ymd}|${ev.stopId}|${ev.line}|${ev.schedSec}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
```

Dodaj `if (!isNewEvent(ev)) continue;` v zanki pred shranjevanjem.

---

## 6. Smer vožnje

- `direction_id` iz GTFS `trips.txt` (0 ali 1) je vezan na konkretno linijo — **ni garantirano** da `0 = v center` in `1 = iz centra`. Preveri empirično na referenčni liniji (npr. G1, katere zadnja postaja je endStopId v vsaki smeri).
- Če prikazuješ uporabniku, uporabi `trips.txt` → `trip_headsign` (npr. »Betnava« / »Center«) namesto generičnega »Smer 1/2«.

---

## 7. Priporočila za performanco

| Parameter | Vrednost | Opomba |
|-----------|----------|--------|
| Concurrency | 12 | Brez zavračanj, ~30–45 s cel cikel |
| Fetch timeout | 7000 ms | Nekaj postaj občasno counts 504 |
| Poll interval | 60 s | Manj kot 30 s = tveganje da zgrešiš »Odhod« window; 60 s je dobro ravnovesje |
| `steviloVrstic` | 20 | Dovolj za gost promet; manj = krajši payload |

---

## 8. Znani problemi v obstoječi v0.3 implementaciji (izogni se!)

1. **Brez dedupa** → double-counting odhodov. Reši s sekcijo 5.
2. **Polnoč** — ture z GTFS `sec > 86400` se ne matchajo. Reši s `circularDiff` (4.3).
3. **Nearest-only matching** pri gostih frekvencah (linije vsakih 5–8 min): 12-min zamujen bus se nalepi na naslednjo scheduled → pokaže -4 min. Reši s `prefer forward` (4.3).
4. **Memory growth** — če samo rineš v array `EVENTS`, ti po 8 urah razraste na 200k+ zapisov. Obvezno periodic flush v IndexedDB / backend.

---

## 9. Minimalen skripta za zajem (kopirljiv)

```js
// Predpostavka: ALL_STOPS in DEP_INDEX sta napolnjena iz GTFS
const BASE = 'https://vozniredi.marprom.si/wsPrikazovalnik';
const seen = new Set();
const EVENTS = [];

setInterval(async () => {
  const events = await collectAll(ALL_STOPS);
  for (const ev of events) {
    if (isNewEvent(ev)) EVENTS.push(ev);
  }
  console.log(`Cikel: +${events.length} surovih, ${EVENTS.length} unique`);
}, 60_000);
```

---

## 10. Reference

- Marprom GTFS: osvežuje se ob spremembah voznih redov (~letno). Zadnja znana lokacija: `https://www.marprom.si/` (direkten link ni javen; v MOM imamo kopijo).
- Obstoječa implementacija: `C:\Users\Allen\Claude\projekti\zamude_jpp\zamude.html` (v0.3, single-file, JSZip + xlsx-full za GTFS in izvoz).
- Sorodne aplikacije v repoju:
  - `projekti/jpp_maribor/` — MapLibre vizualizacija GTFS (dobra koda za parsing).
  - `projekti/aplikacija_Mobilnost_Maas/web/` — Svelte 5 + Vite, GTFS pipeline, ima `gtfs.ts` z tipiziranimi modeli.
  - `projekti/prikozavalnik-mlinska/` — uporablja `city-buses`/`regional-buses` endpointa.
