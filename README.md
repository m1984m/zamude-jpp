# Zamude JPP — Kontrolni center

Živ nadzor nad zamudami javnega potniškega prometa Maribor (Marprom).

## Arhitektura

```
┌─────────────────────┐          ┌──────────────────────┐
│  Google Apps Script │ 1×/min   │  Marprom WS API      │
│  (Code.gs)          ├─────────▶│  stop-point-buses/…  │
│  trigger: every 1m  │          └──────────────────────┘
└──────────┬──────────┘
           │ pisanje
           ▼
┌─────────────────────┐          ┌──────────────────────┐
│  Google Drive       │ ?day=    │  SPA (Svelte 5)      │
│  events_YYYY-MM-DD  │◀────────┤  GitHub Pages        │
│  .csv               │  ?list   │  reader + dashboard  │
└─────────────────────┘          └──────────────────────┘
```

- **GAS scraper** (`gas/Code.gs`) teče vsakih 60 s, filtrira postaje z odhodom v ±90 s, pozove `stop-point-buses/…`, zazna dogodek `odhod`, izračuna zamudo (circular diff proti GTFS urniku) in pripiše v dnevni CSV v Drive mapi `Zamude JPP`.
- **Web SPA** (`web/`) bere iz GAS web-api (`?action=list`, `?action=day`). Prikazuje KPI-je (skladnost Odlok), mrežni zemljevid, histogram, top postaje, heatmap linija × ura, itd.
- **Po Odloku** zavihek: zamude le na končnih postajah (skladno z Odlokom o javnem prevozu potnikov v mestni občini Maribor).

## Deploy

### GAS (enkratno)

1. Apps Script projekt → nalepi `gas/Code.gs`.
2. V Drive ustvari mapo **Zamude JPP**, vanjo naloži `gtfs.zip` Marprom.
3. Run → `setupGTFS` (preračuna cache, `firstDepSec`/`lastDepSec`).
4. Triggers → `poll`, 1 minuta.
5. Deploy → Web app → execute as *me*, access *Anyone*. URL kopiraj v `web/src/lib/driveConfig.ts`.

### Web SPA

GitHub Pages deploy teče avtomatsko ob push-u na `main` (glej `.github/workflows/deploy.yml`). Base URL je `/zamude-jpp/`.

Lokalni razvoj:

```bash
cd web
npm install
npm run dev   # http://localhost:9126
```

## Datoteke

```
zamude_jpp/
├── gas/
│   ├── Code.gs         # Apps Script: scraper + web api
│   └── README.md
├── web/                # Svelte 5 SPA
├── API_ZAMUDE.md       # Dokumentacija Marprom API-ja
└── .github/workflows/
    └── deploy.yml      # GH Pages CI
```
