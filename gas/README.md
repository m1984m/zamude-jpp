# Zamude JPP — Google Apps Script deploy

1-minutni scraper Marprom API-ja, ki piše dnevne CSV-je v Google Drive. Teče neodvisno od brskalnika.

## Arhitektura

```
   ┌─────────────────────────┐
   │ Google Apps Script      │  1-min time trigger
   │   poll()                │──────────────┐
   └───────────┬─────────────┘              │
               │ fetchAll(~30 aktivnih postaj)
               ▼                            │
     ┌──────────────────┐                   │
     │ Marprom RTPI API │                   │
     └──────────────────┘                   │
                                            ▼
                         ┌─────────────────────────────┐
                         │ Google Drive / Zamude JPP / │
                         │   gtfs.zip                  │
                         │   _gtfs_cache.json          │
                         │   events_2026-04-20.csv     │◄── poll appenda
                         │   events_2026-04-21.csv     │
                         │   ...                        │
                         └─────────────────────────────┘
```

## Deploy (enkrat)

### 1. Ustvari projekt
- Pojdi na https://script.google.com/home
- Nov projekt → poimenuj "Zamude JPP Scraper"
- Vsebino `Code.gs` iz te mape skopiraj v glavno datoteko

### 2. Naloži GTFS v Drive
- V Drive ustvari mapo **Zamude JPP**
- Vanjo naloži `gtfs.zip` (isti kot je v `/web/public/gtfs.zip`)

### 3. Prvi zagon — parse GTFS
- V Apps Script urejevalniku:
  - V meniju izberi funkcijo **setupGTFS**
  - Klik **Run**
  - Prvič te bo vprašal za dovoljenja (Drive, UrlFetch) → potrdi
- Po ~30 s se v mapi pojavi `_gtfs_cache.json` (~2 MB)
- Logger izpiše: `GTFS cache shranjen: 454 postaj, 12000+ dep entries`

### 4. Nastavi trigger
- V Apps Script: **Triggers (ura ikona)** → Add Trigger
- Function: `poll`
- Event source: Time-driven
- Type: **Minutes timer** → **Every minute**
- Save

### 5. Preveri
- Po 1-2 min v mapi pojavi `events_YYYY-MM-DD.csv`
- V Apps Script: **Executions** vidiš log vsake minute
  - Primer: `poll: 28 postaj, 24 odhodov`

## Osveži GTFS (ob spremembi voznih redov)

1. Prepiši `gtfs.zip` v Drive mapi
2. Zaženi **setupGTFS** ročno — prepiše cache

## Kvote & meje (brezplačen Google račun)

| Kvota | Limit | Naše porabe (ocena) |
|---|---|---|
| UrlFetch / dan | **20 000** | ~25 postaj/min × 60 × 19 h ≈ 28 000 |
| Trigger runtime | 6 min/run | obično 5-15 s |
| Skupni script runtime / dan | 90 min | OK |

⚠️ **Pomembno:** pri brezplačnem računu lahko prideš do UrlFetch kvote. Možne rešitve:
- Workspace račun (100 000/dan) → ni problem
- Povečaj `ACTIVE_WINDOW_SEC = 60` (z 90 na 60) → manj postaj na cikel
- Spremeni trigger na vsaki **2 min**

Če vidiš v Executions `Service invoked too many times`, zmanjšaj frekvenco.

## Format CSV

Ločilnik `;`, UTF-8 z BOM (Excel-ready), decimalka `,`.

```
tsISO;day;time;stopId;stopName;line;dir;headsign;schedSec;actualSec;delayMin
2026-04-20T07:15:03.421Z;2026-04-20;08:15:03;643;TPC CITY;G3;1;KRANČEVA;27300;27303;0
2026-04-20T07:15:04.102Z;2026-04-20;08:15:04;221;GLAVNI TRG;6;0;RAZVANJE;27000;27304;5
...
```

## Branje iz web aplikacije — deploy kot web app

Spletna app bere prek mini API-ja v istem GAS projektu (`doGet`).

### Deploy
1. V Apps Script urejevalniku: **Deploy → New deployment**
2. Gear (⚙️) → **Web app**
3. Nastavitve:
   - Description: `Zamude JPP API`
   - Execute as: **Me (tvoj račun)**
   - Who has access: **Anyone** (tudi brez Google računa)
4. **Deploy**
5. Kopiraj URL — pattern: `https://script.google.com/macros/s/XXXXXX/exec`
6. Sporoči mi URL

### Endpoints (za hitri test v brskalniku)
- `…/exec?action=ping` → `{"ok":true,"ts":"..."}`
- `…/exec?action=list` → JSON seznam razpoložljivih dnevnih CSV-jev
- `…/exec?action=day&d=2026-04-20` → vsebina CSV-ja za dan

### Ob spremembi Code.gs
Vsakič ko spremeniš skripto: **Deploy → Manage deployments → Edit → Version: New → Deploy**. URL ostane enak.
