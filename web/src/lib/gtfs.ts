import JSZip from 'jszip';
import type { Stop, ScheduledDep } from './types';

// Minimal CSV parser supporting quoted fields and embedded commas.
function parseCSV(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { cell += '"'; i++; }
      else if (c === '"') { inQ = false; }
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

function toSec(t: string): number | null {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
}

export type GTFSIndex = {
  stops: Stop[];
  lines: string[];
  depIndex: Map<string, ScheduledDep[]>;  // key = `${stopId}|${route_short_name}`
  terminals: Set<string>;                  // key = `${line}|${dir}|${stopId}` — končne postaje
};

export async function loadGTFSFromFile(file: File, onProgress?: (msg: string) => void): Promise<GTFSIndex> {
  onProgress?.('Odpiram arhiv...');
  const files: Record<string, string> = {};

  if (/\.zip$/i.test(file.name)) {
    const zip = await JSZip.loadAsync(file);
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const base = name.toLowerCase().split('/').pop()!;
      if (/^(stops|routes|trips|stop_times)\.txt$/.test(base)) {
        files[base] = await entry.async('string');
      }
    }
  } else {
    const text = await file.text();
    files[file.name.toLowerCase()] = text;
  }

  const need = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt'];
  for (const n of need) if (!files[n]) throw new Error(`Manjka ${n}`);

  onProgress?.('Parsiram stops...');
  const stops = parseStops(files['stops.txt']);

  onProgress?.('Parsiram routes...');
  const routeShortById = parseRoutes(files['routes.txt']);

  onProgress?.('Parsiram trips...');
  const tripInfoById = parseTrips(files['trips.txt'], routeShortById);

  onProgress?.('Parsiram stop_times (lahko traja)...');
  const { depIndex, terminals } = parseStopTimes(files['stop_times.txt'], tripInfoById);

  const lineSet = new Set<string>();
  for (const info of tripInfoById.values()) if (info.short) lineSet.add(info.short);
  const lines = [...lineSet].sort((a, b) => a.localeCompare(b, 'sl'));

  onProgress?.('GTFS pripravljen.');
  return { stops, lines, depIndex, terminals };
}

function parseStops(txt: string): Stop[] {
  const rows = parseCSV(txt);
  const h = rows[0].map(x => x.trim().toLowerCase());
  const iId = h.indexOf('stop_id');
  const iName = h.indexOf('stop_name');
  const iLat = h.indexOf('stop_lat');
  const iLon = h.indexOf('stop_lon');
  const map = new Map<number, Stop>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;
    const id = parseInt(r[iId], 10);
    const name = (r[iName] || '').trim();
    const lat = parseFloat(r[iLat] || '') || 0;
    const lon = parseFloat(r[iLon] || '') || 0;
    if (Number.isNaN(id) || !name) continue;
    map.set(id, { id, name, lat, lon });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'sl'));
}

function parseRoutes(txt: string): Map<string, string> {
  const rows = parseCSV(txt);
  const h = rows[0].map(x => x.trim().toLowerCase());
  const iId = h.indexOf('route_id');
  const iShort = h.indexOf('route_short_name');
  const out = new Map<string, string>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;
    const id = String(r[iId] || '');
    const short = (r[iShort] || '').trim();
    if (!id) continue;
    out.set(id, short);
  }
  return out;
}

type TripInfo = { short: string; dir: 0 | 1; headsign: string };

function parseTrips(txt: string, routeShortById: Map<string, string>): Map<string, TripInfo> {
  const rows = parseCSV(txt);
  const h = rows[0].map(x => x.trim().toLowerCase());
  const iTrip = h.indexOf('trip_id');
  const iRoute = h.indexOf('route_id');
  const iDir = h.indexOf('direction_id');
  const iHead = h.indexOf('trip_headsign');
  const out = new Map<string, TripInfo>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;
    const tid = String(r[iTrip] || '');
    if (!tid) continue;
    const rid = String(r[iRoute] || '');
    const short = routeShortById.get(rid) || '';
    const dirRaw = iDir >= 0 ? r[iDir] : '';
    const dir = (dirRaw === '' || dirRaw === undefined) ? 0 : (Number(dirRaw) === 1 ? 1 : 0);
    const headsign = iHead >= 0 ? (r[iHead] || '').trim() : '';
    out.set(tid, { short, dir: dir as 0 | 1, headsign });
  }
  return out;
}

function parseStopTimes(
  txt: string,
  tripInfo: Map<string, TripInfo>
): { depIndex: Map<string, ScheduledDep[]>; terminals: Set<string> } {
  const rows = parseCSV(txt);
  const h = rows[0].map(x => x.trim().toLowerCase());
  const iTrip = h.indexOf('trip_id');
  const iStop = h.indexOf('stop_id');
  const iDep = h.indexOf('departure_time');
  const iSeq = h.indexOf('stop_sequence');
  const idx = new Map<string, ScheduledDep[]>();
  // Sledi zadnji postaji (max stop_sequence) za vsak trip.
  const lastByTrip = new Map<string, { seq: number; stopId: number }>();
  for (let i = 1; i < rows.length; i++) {
    const st = rows[i];
    if (!st || !st.length) continue;
    const tid = String(st[iTrip] || '');
    const stopId = parseInt(st[iStop], 10);
    if (Number.isNaN(stopId)) continue;
    const sec = toSec(st[iDep] || '');
    const info = tripInfo.get(tid);
    if (!info || !info.short) continue;
    if (sec != null) {
      const key = `${stopId}|${info.short}`;
      let arr = idx.get(key);
      if (!arr) { arr = []; idx.set(key, arr); }
      arr.push({ sec, dir: info.dir, tripId: tid, headsign: info.headsign });
    }
    // Sledenje končne postaje (ne rabi departure_time).
    const seq = iSeq >= 0 ? parseInt(st[iSeq] || '', 10) : NaN;
    const prev = lastByTrip.get(tid);
    if (!prev || (!Number.isNaN(seq) && seq > prev.seq)) {
      lastByTrip.set(tid, { seq: Number.isNaN(seq) ? (prev?.seq ?? -1) + 1 : seq, stopId });
    }
  }
  for (const arr of idx.values()) arr.sort((a, b) => a.sec - b.sec);

  const terminals = new Set<string>();
  for (const [tid, last] of lastByTrip) {
    const info = tripInfo.get(tid);
    if (!info || !info.short) continue;
    terminals.add(`${info.short}|${info.dir}|${last.stopId}`);
  }
  return { depIndex: idx, terminals };
}
