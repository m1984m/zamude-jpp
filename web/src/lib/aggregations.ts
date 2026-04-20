import type { DelayEvent } from './types';

export type KPI = {
  nEvents: number;
  avgDelay: number;
  onTimePct: number;
  onTimePct5: number;
  activeLines: number;
  worstStop: { stopId: number; stopName: string; delayMin: number } | null;
  worstLine: { line: string; delayMin: number } | null;
};

export function kpis(events: DelayEvent[]): KPI {
  if (!events.length) {
    return { nEvents: 0, avgDelay: 0, onTimePct: 0, onTimePct5: 0, activeLines: 0, worstStop: null, worstLine: null };
  }
  let sum = 0;
  let onTime = 0;
  let onTime5 = 0;
  const byStop = new Map<number, { name: string; sum: number; n: number }>();
  const byLine = new Map<string, { sum: number; n: number }>();
  const lines = new Set<string>();
  for (const e of events) {
    sum += e.delayMin;
    if (Math.abs(e.delayMin) <= 2) onTime++;
    if (Math.abs(e.delayMin) <= 5) onTime5++;
    lines.add(e.line);
    let s = byStop.get(e.stopId);
    if (!s) { s = { name: e.stopName, sum: 0, n: 0 }; byStop.set(e.stopId, s); }
    s.sum += e.delayMin; s.n++;
    let l = byLine.get(e.line);
    if (!l) { l = { sum: 0, n: 0 }; byLine.set(e.line, l); }
    l.sum += e.delayMin; l.n++;
  }
  let worstStop: KPI['worstStop'] = null;
  for (const [id, v] of byStop) {
    const avg = v.sum / v.n;
    if (!worstStop || avg > worstStop.delayMin) {
      worstStop = { stopId: id, stopName: v.name, delayMin: Math.round(avg * 10) / 10 };
    }
  }
  let worstLine: KPI['worstLine'] = null;
  for (const [line, v] of byLine) {
    const avg = v.sum / v.n;
    if (!worstLine || avg > worstLine.delayMin) {
      worstLine = { line, delayMin: Math.round(avg * 10) / 10 };
    }
  }
  return {
    nEvents: events.length,
    avgDelay: Math.round((sum / events.length) * 10) / 10,
    onTimePct: Math.round((onTime / events.length) * 1000) / 10,
    onTimePct5: Math.round((onTime5 / events.length) * 1000) / 10,
    activeLines: lines.size,
    worstStop,
    worstLine,
  };
}

// Bins: <-1, -1..2, 2..5, 5..10, 10..20, >20
export const HISTOGRAM_BINS = [
  { label: 'prezgodaj', min: -Infinity, max: -1, color: '#4fd1ff' },
  { label: 'točen', min: -1, max: 2, color: '#22c55e' },
  { label: '2-5 min', min: 2, max: 5, color: '#a3e635' },
  { label: '5-10 min', min: 5, max: 10, color: '#f5a524' },
  { label: '10-20 min', min: 10, max: 20, color: '#f97316' },
  { label: '>20 min', min: 20, max: Infinity, color: '#ef4444' },
];

export function histogram(events: DelayEvent[]): number[] {
  const out = HISTOGRAM_BINS.map(() => 0);
  for (const e of events) {
    for (let i = 0; i < HISTOGRAM_BINS.length; i++) {
      const b = HISTOGRAM_BINS[i];
      if (e.delayMin >= b.min && e.delayMin < b.max) { out[i]++; break; }
    }
  }
  return out;
}

// Streaming trend: bucket events by 1-min, compute avg delay.
// Returns last `windowMin` points (null for empty buckets).
export type TrendPoint = { t: number; avg: number | null; perLine: Map<string, number | null> };

export function streamingTrend(
  events: DelayEvent[],
  windowMin = 60,
  topLines: string[] = [],
): { ts: number[]; systemAvg: (number | null)[]; lineAvg: Map<string, (number | null)[]> } {
  const now = Date.now();
  const start = now - windowMin * 60_000;
  const bucketMs = 60_000;
  const nBuckets = windowMin;
  const ts: number[] = [];
  for (let i = 0; i < nBuckets; i++) ts.push(Math.floor(start / bucketMs) * bucketMs + i * bucketMs);

  const sys = new Array<{ sum: number; n: number }>(nBuckets)
    .fill(null as any).map(() => ({ sum: 0, n: 0 }));

  const perLine = new Map<string, { sum: number; n: number }[]>();
  for (const line of topLines) {
    perLine.set(line, new Array(nBuckets).fill(null as any).map(() => ({ sum: 0, n: 0 })));
  }

  for (const e of events) {
    if (e.tsMs < start) continue;
    const idx = Math.floor((e.tsMs - ts[0]) / bucketMs);
    if (idx < 0 || idx >= nBuckets) continue;
    sys[idx].sum += e.delayMin;
    sys[idx].n += 1;
    const arr = perLine.get(e.line);
    if (arr) {
      arr[idx].sum += e.delayMin;
      arr[idx].n += 1;
    }
  }

  const systemAvg = sys.map(b => b.n ? Math.round((b.sum / b.n) * 10) / 10 : null);
  const lineAvg = new Map<string, (number | null)[]>();
  for (const [line, arr] of perLine) {
    lineAvg.set(line, arr.map(b => b.n ? Math.round((b.sum / b.n) * 10) / 10 : null));
  }
  return { ts, systemAvg, lineAvg };
}

// Top N stops by avg delay in the window.
export function topStops(events: DelayEvent[], n = 10, minEvents = 2): Array<{
  stopId: number; stopName: string; nEvents: number; avgDelay: number; maxDelay: number; spark: number[];
}> {
  const by = new Map<number, { name: string; deltas: number[]; tsSorted: { t: number; d: number }[] }>();
  for (const e of events) {
    let s = by.get(e.stopId);
    if (!s) { s = { name: e.stopName, deltas: [], tsSorted: [] }; by.set(e.stopId, s); }
    s.deltas.push(e.delayMin);
    s.tsSorted.push({ t: e.tsMs, d: e.delayMin });
  }
  const rows = [...by.entries()]
    .filter(([, v]) => v.deltas.length >= minEvents)
    .map(([id, v]) => {
      const sum = v.deltas.reduce((a, b) => a + b, 0);
      const avg = sum / v.deltas.length;
      const max = Math.max(...v.deltas);
      v.tsSorted.sort((a, b) => a.t - b.t);
      const spark = v.tsSorted.slice(-20).map(x => x.d);
      return {
        stopId: id,
        stopName: v.name,
        nEvents: v.deltas.length,
        avgDelay: Math.round(avg * 10) / 10,
        maxDelay: max,
        spark,
      };
    });
  rows.sort((a, b) => b.avgDelay - a.avgDelay);
  return rows.slice(0, n);
}

// Heatmap: hour-of-day × line → avg delay.
export function heatmap(events: DelayEvent[]): {
  lines: string[];
  hours: number[];
  matrix: (number | null)[][]; // [lineIndex][hour]
} {
  const byLine = new Map<string, Map<number, { sum: number; n: number }>>();
  const hours = new Set<number>();
  for (const e of events) {
    const h = new Date(e.tsMs).getHours();
    hours.add(h);
    let m = byLine.get(e.line);
    if (!m) { m = new Map(); byLine.set(e.line, m); }
    let c = m.get(h);
    if (!c) { c = { sum: 0, n: 0 }; m.set(h, c); }
    c.sum += e.delayMin; c.n += 1;
  }
  const hoursArr = [...hours].sort((a, b) => a - b);
  const lines = [...byLine.keys()].sort((a, b) => a.localeCompare(b, 'sl'));
  const matrix: (number | null)[][] = lines.map(line => {
    const m = byLine.get(line)!;
    return hoursArr.map(h => {
      const c = m.get(h);
      return c ? Math.round((c.sum / c.n) * 10) / 10 : null;
    });
  });
  return { lines, hours: hoursArr, matrix };
}

// Direction bars: avg delay per line per direction.
export function directionBars(events: DelayEvent[]): Array<{
  line: string;
  dir0Avg: number | null; dir0N: number;
  dir1Avg: number | null; dir1N: number;
}> {
  const by = new Map<string, { d0: number[]; d1: number[] }>();
  for (const e of events) {
    let r = by.get(e.line);
    if (!r) { r = { d0: [], d1: [] }; by.set(e.line, r); }
    (e.dir === 0 ? r.d0 : r.d1).push(e.delayMin);
  }
  const avg = (arr: number[]) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
  const out: Array<{ line: string; dir0Avg: number | null; dir0N: number; dir1Avg: number | null; dir1N: number }> = [];
  for (const [line, r] of by) {
    out.push({ line, dir0Avg: avg(r.d0), dir0N: r.d0.length, dir1Avg: avg(r.d1), dir1N: r.d1.length });
  }
  out.sort((a, b) => a.line.localeCompare(b.line, 'sl'));
  return out;
}

// Anomaly: line where ≥3 consecutive stops show delay > 8 min in last 5 min.
export function detectAnomalies(events: DelayEvent[]): Array<{ line: string; stops: number; avg: number }> {
  const recent = events.filter(e => e.tsMs > Date.now() - 5 * 60_000);
  const byLine = new Map<string, DelayEvent[]>();
  for (const e of recent) {
    if (e.delayMin < 8) continue;
    let arr = byLine.get(e.line);
    if (!arr) { arr = []; byLine.set(e.line, arr); }
    arr.push(e);
  }
  const out: Array<{ line: string; stops: number; avg: number }> = [];
  for (const [line, arr] of byLine) {
    const unique = new Set(arr.map(e => e.stopId));
    if (unique.size >= 3) {
      const avg = arr.reduce((a, b) => a + b.delayMin, 0) / arr.length;
      out.push({ line, stops: unique.size, avg: Math.round(avg * 10) / 10 });
    }
  }
  out.sort((a, b) => b.avg - a.avg);
  return out;
}

// Events filtered per stop (for map coloring).
export function delaysByStop(events: DelayEvent[], windowMs: number = 10 * 60_000): Map<number, {
  avg: number; n: number; max: number;
}> {
  const cutoff = Date.now() - windowMs;
  const by = new Map<number, { deltas: number[] }>();
  for (const e of events) {
    if (e.tsMs < cutoff) continue;
    let s = by.get(e.stopId);
    if (!s) { s = { deltas: [] }; by.set(e.stopId, s); }
    s.deltas.push(e.delayMin);
  }
  const out = new Map<number, { avg: number; n: number; max: number }>();
  for (const [id, v] of by) {
    const sum = v.deltas.reduce((a, b) => a + b, 0);
    out.set(id, {
      avg: Math.round((sum / v.deltas.length) * 10) / 10,
      n: v.deltas.length,
      max: Math.max(...v.deltas),
    });
  }
  return out;
}
