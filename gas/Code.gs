/**
 * Zamude JPP — 1-minutni Marprom scraper za Google Apps Script.
 *
 * Pipeline:
 *   1) setupGTFS()  — enkratno: parsira gtfs.zip iz Drive mape in shrani kompaktni _gtfs_cache.json
 *   2) poll()       — 1-min trigger: pozove aktivne postaje, zazna 'odhod', izračuna zamudo,
 *                     dodaja v events_YYYY-MM-DD.csv (ena datoteka na dan)
 *
 * Drive mapa: "Zamude JPP" (ustvarjena samodejno ob prvem zagonu).
 *
 * Deploy (glej README.md za slike):
 *   - V Apps Script: pusti v Drive korenu ali kjerkoli
 *   - V Drive ustvari mapo "Zamude JPP" in vanjo ročno naloži gtfs.zip
 *   - Zaženi setupGTFS() enkrat (menu: Run → setupGTFS)
 *   - Dodaj time-driven trigger za poll(): every 1 minute
 */

const FOLDER_NAME = 'Zamude JPP';
const GTFS_ZIP_NAME = 'gtfs.zip';
const GTFS_CACHE_NAME = '_gtfs_cache.json';
const BASE = 'https://vozniredi.marprom.si/wsPrikazovalnik';
const ROWS = 20;
const MATCH_WINDOW_SEC = 10 * 60;
const ACTIVE_WINDOW_SEC = 90;            // polli le postaje z odhodom v ±90 s
const SERVICE_HOUR_START = 5;            // ne klici API ponoči (ohrani kvoto)
const SERVICE_HOUR_END = 24;             // [start, end)

const CSV_SEP = ';';
const CSV_HEADER = ['tsISO','day','time','stopId','stopName','line','dir','headsign','schedSec','actualSec','delayMin'];

// ─────────────────────────────────────────────────────────────────────
// WEB API (doGet) — za spletno aplikacijo
//   ?action=list           → JSON seznam razpoložljivih dnevnih CSV-jev
//   ?action=day&d=YYYY-MM-DD → CSV vsebina za ta dan
//   ?action=ping           → preprost health check
// ─────────────────────────────────────────────────────────────────────

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = String(params.action || 'list').toLowerCase();

  if (action === 'ping') {
    return json_({ ok: true, ts: new Date().toISOString() });
  }

  if (action === 'list') {
    const f = folder_();
    const it = f.getFiles();
    const files = [];
    while (it.hasNext()) {
      const file = it.next();
      const name = file.getName();
      const m = name.match(/^events_(\d{4}-\d{2}-\d{2})\.csv$/);
      if (!m) continue;
      files.push({
        day: m[1],
        name: name,
        size: file.getSize(),
        modified: file.getLastUpdated().toISOString(),
      });
    }
    files.sort(function (a, b) { return a.day < b.day ? 1 : -1; });
    return json_({ generatedAt: new Date().toISOString(), files: files });
  }

  if (action === 'day') {
    const d = String(params.d || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return text_('ERR: bad day param, expected YYYY-MM-DD');
    }
    const file = getFile_(folder_(), 'events_' + d + '.csv');
    if (!file) return text_('');   // prazno = dan ne obstaja
    return text_(file.getBlob().getDataAsString('UTF-8'));
  }

  return text_('Unknown action. Try ?action=list');
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function text_(s) {
  return ContentService
    .createTextOutput(s)
    .setMimeType(ContentService.MimeType.TEXT);
}

// ─────────────────────────────────────────────────────────────────────
// FOLDER / FILE HELPERS
// ─────────────────────────────────────────────────────────────────────

function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(FOLDER_NAME);
}
function getFile_(folder, name) {
  const it = folder.getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}
function pad_(n) { return String(n).padStart(2, '0'); }

// ─────────────────────────────────────────────────────────────────────
// SETUP — enkratno: naloži GTFS, shrani kompaktni index
// ─────────────────────────────────────────────────────────────────────

function setupGTFS() {
  const f = folder_();
  const zip = getFile_(f, GTFS_ZIP_NAME);
  if (!zip) throw new Error('Manjka "' + GTFS_ZIP_NAME + '" v mapi "' + FOLDER_NAME + '". Naloži ga najprej.');

  const blobs = Utilities.unzip(zip.getBlob());
  const files = {};
  for (const b of blobs) {
    const name = b.getName().toLowerCase();
    const base = name.split('/').pop();
    if (/^(stops|routes|trips|stop_times)\.txt$/.test(base)) {
      files[base] = b.getDataAsString('UTF-8');
    }
  }
  const need = ['stops.txt','routes.txt','trips.txt','stop_times.txt'];
  for (const n of need) if (!files[n]) throw new Error('Manjka ' + n + ' v zipu');

  const stops = parseStops_(files['stops.txt']);
  const routeShortById = parseRoutes_(files['routes.txt']);
  const tripInfoById = parseTrips_(files['trips.txt'], routeShortById);
  const depIndex = parseStopTimes_(files['stop_times.txt'], tripInfoById);

  const stopNames = {};
  for (const s of stops) stopNames[s.id] = s.name;

  // Flatten Map → plain obj, tuples [sec,dir,headsign] za majhen JSON
  const depIdx = {};
  let firstDepSec = Infinity, lastDepSec = -Infinity;
  for (const [k, arr] of depIndex) {
    depIdx[k] = arr.map(x => [x.sec, x.dir, x.headsign]);
    for (const x of arr) {
      if (x.sec < firstDepSec) firstDepSec = x.sec;
      if (x.sec > lastDepSec) lastDepSec = x.sec;
    }
  }
  if (!isFinite(firstDepSec)) firstDepSec = 5 * 3600;
  if (!isFinite(lastDepSec)) lastDepSec = 23 * 3600;

  const cache = {
    generatedAt: new Date().toISOString(),
    stopIds: stops.map(s => s.id),
    stopNames: stopNames,
    depIdx: depIdx,
    firstDepSec: firstDepSec,
    lastDepSec: lastDepSec,
  };
  const json = JSON.stringify(cache);

  const existing = getFile_(f, GTFS_CACHE_NAME);
  if (existing) existing.setContent(json);
  else f.createFile(GTFS_CACHE_NAME, json, MimeType.PLAIN_TEXT);

  // Invalidate cache
  CacheService.getScriptCache().remove('gtfs_chunks');

  Logger.log(
    'GTFS cache shranjen: %s postaj, %s dep entries, aktivno okno %s–%s',
    stops.length,
    Object.keys(depIdx).length,
    fmtSec_(firstDepSec),
    fmtSec_(lastDepSec)
  );
}

function fmtSec_(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return pad_(h) + ':' + pad_(m);
}

// ─────────────────────────────────────────────────────────────────────
// GTFS LOAD (s ScriptCache za 6 h)
// ─────────────────────────────────────────────────────────────────────

function loadGtfs_() {
  const cache = CacheService.getScriptCache();
  const nStr = cache.get('gtfs_chunks');
  if (nStr) {
    const n = Number(nStr);
    const keys = [];
    for (let i = 0; i < n; i++) keys.push('gtfs_p' + i);
    const map = cache.getAll(keys);
    let full = '';
    let ok = true;
    for (let i = 0; i < n; i++) {
      const p = map['gtfs_p' + i];
      if (p == null) { ok = false; break; }
      full += p;
    }
    if (ok) return JSON.parse(full);
  }
  const file = getFile_(folder_(), GTFS_CACHE_NAME);
  if (!file) throw new Error('GTFS cache manjka. Najprej zaženi setupGTFS().');
  const json = file.getBlob().getDataAsString('UTF-8');

  // Chunk na ≤95 KB (CacheService limit 100 KB/key)
  const CHUNK = 90 * 1024;
  const parts = [];
  for (let i = 0; i < json.length; i += CHUNK) parts.push(json.substring(i, i + CHUNK));
  const entries = { gtfs_chunks: String(parts.length) };
  for (let i = 0; i < parts.length; i++) entries['gtfs_p' + i] = parts[i];
  cache.putAll(entries, 21600);
  return JSON.parse(json);
}

// ─────────────────────────────────────────────────────────────────────
// POLL — vsakih 60 s
// ─────────────────────────────────────────────────────────────────────

function poll() {
  const now = new Date();
  const h = now.getHours();
  if (h < SERVICE_HOUR_START || h >= SERVICE_HOUR_END) return;  // varovalka

  const gtfs = loadGtfs_();
  const nowSec = h * 3600 + now.getMinutes() * 60 + now.getSeconds();

  // Dinamično okno iz GTFS: 15 min pred prvim odhodom, 5 min po zadnjem.
  if (typeof gtfs.firstDepSec === 'number' && nowSec < gtfs.firstDepSec - 900) return;
  if (typeof gtfs.lastDepSec === 'number') {
    const lastClamp = Math.min(gtfs.lastDepSec, 86399);
    if (nowSec > lastClamp + 300) return;
  }

  // 1) Filter: le postaje z odhodom znotraj ±ACTIVE_WINDOW_SEC
  const activeIds = [];
  const seenStops = new Set();
  for (const k in gtfs.depIdx) {
    const stopId = +k.split('|')[0];
    if (seenStops.has(stopId)) continue;
    const arr = gtfs.depIdx[k];
    for (let j = 0; j < arr.length; j++) {
      if (Math.abs(circularDiff_(arr[j][0], nowSec)) <= ACTIVE_WINDOW_SEC) {
        activeIds.push(stopId);
        seenStops.add(stopId);
        break;
      }
    }
  }
  if (!activeIds.length) return;

  // 2) fetchAll (paralelno)
  const reqs = activeIds.map(id => ({
    url: BASE + '/stop-point-buses/' + id + '?steviloVrstic=' + ROWS,
    method: 'get',
    muteHttpExceptions: true,
  }));
  let responses;
  try {
    responses = UrlFetchApp.fetchAll(reqs);
  } catch (err) {
    Logger.log('fetchAll napaka: %s', err);
    return;
  }

  // 3) Match & build events
  const events = [];
  for (let i = 0; i < responses.length; i++) {
    const r = responses[i];
    if (r.getResponseCode() !== 200) continue;
    let data;
    try { data = JSON.parse(r.getContentText()); } catch (_) { continue; }
    if (!Array.isArray(data)) continue;
    const stopId = activeIds[i];
    for (let j = 0; j < data.length; j++) {
      const row = data[j];
      const t = String(row.time || '').trim().toLowerCase();
      if (t !== 'odhod') continue;
      const line = String(row.line || '').trim();
      if (!line) continue;
      const arr = gtfs.depIdx[stopId + '|' + line];
      if (!arr) continue;
      const m = matchNearest_(arr, nowSec, MATCH_WINDOW_SEC);
      if (!m) continue;
      const delaySec = circularDiff_(m[0], nowSec);
      events.push({
        tsISO: now.toISOString(),
        tsMs: now.getTime(),
        stopId: stopId,
        stopName: gtfs.stopNames[stopId] || '',
        line: line,
        dir: m[1],
        headsign: m[2],
        schedSec: m[0],
        actualSec: nowSec,
        delayMin: Math.round(delaySec / 60),
      });
    }
  }

  if (!events.length) return;

  // 4) Append to today's CSV
  appendEventsCsv_(events, now);

  Logger.log('poll: %s postaj, %s odhodov', activeIds.length, events.length);
}

function appendEventsCsv_(events, now) {
  const day = now.getFullYear() + '-' + pad_(now.getMonth() + 1) + '-' + pad_(now.getDate());
  const name = 'events_' + day + '.csv';
  const f = folder_();
  const existing = getFile_(f, name);

  let body = '';
  if (!existing) {
    body = '\uFEFF' + CSV_HEADER.join(CSV_SEP) + '\n';
  }
  for (const e of events) {
    const d = new Date(e.tsMs);
    const time = pad_(d.getHours()) + ':' + pad_(d.getMinutes()) + ':' + pad_(d.getSeconds());
    const row = [
      e.tsISO,
      day,
      time,
      e.stopId,
      csvEscape_(e.stopName),
      csvEscape_(e.line),
      e.dir,
      csvEscape_(e.headsign),
      e.schedSec,
      e.actualSec,
      String(e.delayMin).replace('.', ','),
    ].join(CSV_SEP);
    body += row + '\n';
  }

  if (existing) {
    // GAS nima native append za plain text → read + concat + write
    const old = existing.getBlob().getDataAsString('UTF-8');
    existing.setContent(old + body);
  } else {
    f.createFile(name, body, MimeType.PLAIN_TEXT);
  }
}

function csvEscape_(v) {
  v = String(v == null ? '' : v);
  if (v.indexOf(CSV_SEP) >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

// ─────────────────────────────────────────────────────────────────────
// MATCHING (iste kot v web appu)
// ─────────────────────────────────────────────────────────────────────

function circularDiff_(sched, actual) {
  let raw = actual - sched;
  if (raw > 43200) raw -= 86400;
  else if (raw < -43200) raw += 86400;
  return raw;
}

function matchNearest_(arr, actualSec, windowSec) {
  const cand = [];
  for (let i = 0; i < arr.length; i++) {
    const delta = circularDiff_(arr[i][0], actualSec);
    if (Math.abs(delta) <= windowSec) cand.push([arr[i], delta]);
  }
  if (!cand.length) return null;
  cand.sort(function (a, b) {
    const aPast = a[1] >= 0, bPast = b[1] >= 0;
    if (aPast !== bPast) return aPast ? -1 : 1;
    return Math.abs(a[1]) - Math.abs(b[1]);
  });
  return cand[0][0];
}

// ─────────────────────────────────────────────────────────────────────
// GTFS CSV parsers (ported from web/src/lib/gtfs.ts)
// ─────────────────────────────────────────────────────────────────────

function parseCsv_(text) {
  const out = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); out.push(row); }
  return out;
}
function toSec_(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
}
function parseStops_(txt) {
  const rows = parseCsv_(txt);
  const h = rows[0].map(x => x.trim().toLowerCase());
  const iId = h.indexOf('stop_id'), iName = h.indexOf('stop_name');
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r.length) continue;
    const id = parseInt(r[iId], 10);
    const name = (r[iName] || '').trim();
    if (isNaN(id) || !name) continue;
    out.push({ id: id, name: name });
  }
  return out;
}
function parseRoutes_(txt) {
  const rows = parseCsv_(txt);
  const h = rows[0].map(x => x.trim().toLowerCase());
  const iId = h.indexOf('route_id'), iShort = h.indexOf('route_short_name');
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r.length) continue;
    out[String(r[iId] || '')] = (r[iShort] || '').trim();
  }
  return out;
}
function parseTrips_(txt, routeShortById) {
  const rows = parseCsv_(txt);
  const h = rows[0].map(x => x.trim().toLowerCase());
  const iTrip = h.indexOf('trip_id'), iRoute = h.indexOf('route_id');
  const iDir = h.indexOf('direction_id'), iHead = h.indexOf('trip_headsign');
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r.length) continue;
    const tid = String(r[iTrip] || ''); if (!tid) continue;
    const short = routeShortById[String(r[iRoute] || '')] || '';
    const dirRaw = iDir >= 0 ? r[iDir] : '';
    const dir = (dirRaw === '' || dirRaw === undefined) ? 0 : (Number(dirRaw) === 1 ? 1 : 0);
    const headsign = iHead >= 0 ? (r[iHead] || '').trim() : '';
    out[tid] = { short: short, dir: dir, headsign: headsign };
  }
  return out;
}
function parseStopTimes_(txt, tripInfo) {
  const rows = parseCsv_(txt);
  const h = rows[0].map(x => x.trim().toLowerCase());
  const iTrip = h.indexOf('trip_id'), iStop = h.indexOf('stop_id'), iDep = h.indexOf('departure_time');
  const idx = new Map();
  for (let i = 1; i < rows.length; i++) {
    const st = rows[i]; if (!st || !st.length) continue;
    const tid = String(st[iTrip] || '');
    const stopId = parseInt(st[iStop], 10);
    if (isNaN(stopId)) continue;
    const sec = toSec_(st[iDep] || '');
    if (sec == null) continue;
    const info = tripInfo[tid];
    if (!info || !info.short) continue;
    const key = stopId + '|' + info.short;
    let arr = idx.get(key);
    if (!arr) { arr = []; idx.set(key, arr); }
    arr.push({ sec: sec, dir: info.dir, headsign: info.headsign });
  }
  for (const arr of idx.values()) arr.sort(function (a, b) { return a.sec - b.sec; });
  return idx;
}
