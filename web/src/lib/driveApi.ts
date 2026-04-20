import type { DelayEvent } from './types';
import { DRIVE_API_URL } from './driveConfig';

export type DriveListing = {
  generatedAt: string;
  files: Array<{ day: string; name: string; size: number; modified: string }>;
};

export function driveEnabled(): boolean {
  return !!DRIVE_API_URL && /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(DRIVE_API_URL);
}

export async function fetchDriveListing(): Promise<string[]> {
  if (!driveEnabled()) return [];
  const url = `${DRIVE_API_URL}?action=list`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Drive list HTTP ${res.status}`);
  const data = (await res.json()) as DriveListing;
  return (data.files || []).map(f => f.day.replace(/-/g, '')).sort().reverse(); // YYYYMMDD
}

export async function fetchDriveDay(yyyymmdd: string): Promise<DelayEvent[]> {
  const csv = await fetchDriveDayCsv(yyyymmdd);
  return parseDriveCsv(csv);
}

export async function fetchDriveDayCsv(yyyymmdd: string): Promise<string> {
  if (!driveEnabled()) return '';
  const pretty = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
  const url = `${DRIVE_API_URL}?action=day&d=${pretty}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Drive day HTTP ${res.status}`);
  return await res.text();
}

// Združi CSV-je vseh dni (iz listinga) v enoten CSV z eno glavo.
export async function fetchDriveAllCsv(): Promise<string> {
  if (!driveEnabled()) return '';
  const days = await fetchDriveListing();
  if (!days.length) return '';
  const parts: string[] = [];
  let header = '';
  for (const day of days) {
    let text = await fetchDriveDayCsv(day);
    if (!text) continue;
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const nl = text.indexOf('\n');
    if (nl < 0) continue;
    if (!header) header = text.slice(0, nl + 1);
    parts.push(text.slice(nl + 1));
  }
  if (!header) return '';
  return '\uFEFF' + header + parts.join('');
}

// Parse CSV exactly as written by gas/Code.gs (sep=';', BOM, comma-decimal).
function parseDriveCsv(csv: string): DelayEvent[] {
  if (!csv) return [];
  // Strip UTF-8 BOM
  if (csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1);
  const rows = splitCsvRows(csv, ';');
  if (rows.length < 2) return [];
  const header = rows[0].map(s => s.trim());
  const col = (name: string) => header.indexOf(name);
  const iTs = col('tsISO');
  const iStop = col('stopId');
  const iName = col('stopName');
  const iLine = col('line');
  const iDir = col('dir');
  const iHead = col('headsign');
  const iSched = col('schedSec');
  const iAct = col('actualSec');
  const iDelay = col('delayMin');
  if ([iTs, iStop, iName, iLine, iDir, iSched, iAct, iDelay].some(x => x < 0)) {
    throw new Error('Drive CSV: manjkajoči stolpci');
  }
  const out: DelayEvent[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;
    const tsISO = row[iTs];
    if (!tsISO) continue;
    const tsMs = Date.parse(tsISO);
    if (Number.isNaN(tsMs)) continue;
    out.push({
      tsISO,
      tsMs,
      stopId: +row[iStop],
      stopName: row[iName] || '',
      line: row[iLine] || '',
      dir: (Number(row[iDir]) === 1 ? 1 : 0) as 0 | 1,
      headsign: iHead >= 0 ? (row[iHead] || '') : '',
      schedSec: +row[iSched],
      actualSec: +row[iAct],
      delayMin: parseFloat(String(row[iDelay]).replace(',', '.')) || 0,
    });
  }
  return out;
}

function splitCsvRows(text: string, sep: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); out.push(row); }
  return out;
}
