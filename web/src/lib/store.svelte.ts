import type { DelayEvent, ApiStatus } from './types';
import type { GTFSIndex } from './gtfs';
import { driveEnabled, fetchDriveListing, fetchDriveDay } from './driveApi';

const SYNC_INTERVAL_MS = 60_000;

export type ViewMode = 'desktop' | 'tv';
export type ViewScope = 'odlok' | 'vse';  // 'odlok' = samo končne postaje (Odlok), 'vse' = napredno

// Peak-hour buckets [start, end) — half-open. Multi-select: empty = all hours.
export const PEAK_RANGES: Array<{ label: string; start: number; end: number }> = [
  { label: '6–8',   start: 6,  end: 8  },
  { label: '8–13',  start: 8,  end: 13 },
  { label: '13–16', start: 13, end: 16 },
  { label: '16–21', start: 16, end: 21 },
  { label: '21–23', start: 21, end: 23 },
];

function todayYYYYMMDD(now: Date = new Date()): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

function createState() {
  let gtfs = $state<GTFSIndex | null>(null);
  let loading = $state(false);
  let loadingMsg = $state('');
  let error = $state<string | null>(null);
  let todayEvents = $state<DelayEvent[]>([]);           // current day, from Drive
  let historicalEvents = $state<DelayEvent[]>([]);      // selected past day, from Drive
  let viewDay = $state<string>('');                     // '' = today (live via Drive sync)
  let availableDays = $state<string[]>([]);             // YYYYMMDD, from Drive listing
  let apiStatus = $state<ApiStatus>('operational');
  let mode = $state<ViewMode>('desktop');
  let syncing = $state(false);
  let nextSyncAt = $state<number>(0);
  let lastSyncAt = $state<number>(0);
  let loadingHistorical = $state(false);
  let peakSel = $state<boolean[]>(PEAK_RANGES.map(() => false));
  let viewScope = $state<ViewScope>('odlok');
  let tick = $state(Date.now());

  // TV auto-rotate: kroženje fokusa čez sekcije.
  const TV_SECTION_COUNT = 7;
  const TV_ROTATE_MS = 18_000;
  let tvFocusIdx = $state(-1);  // -1 = brez fokusa
  let tvRotateOn = $state(true);
  let tvRotateTimer: ReturnType<typeof setInterval> | null = null;

  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  setInterval(() => { tick = Date.now(); }, 1000);

  function startTvRotate() {
    stopTvRotate();
    tvFocusIdx = 0;
    tvRotateTimer = setInterval(() => {
      tvFocusIdx = (tvFocusIdx + 1) % TV_SECTION_COUNT;
    }, TV_ROTATE_MS);
  }
  function stopTvRotate() {
    if (tvRotateTimer) { clearInterval(tvRotateTimer); tvRotateTimer = null; }
  }
  function setTvRotate(on: boolean) {
    tvRotateOn = on;
    if (on && mode === 'tv') startTvRotate();
    else { stopTvRotate(); tvFocusIdx = -1; }
  }

  async function readToday() {
    if (syncing) return;
    syncing = true;
    try {
      const day = todayYYYYMMDD();
      const evs = await fetchDriveDay(day);
      todayEvents = evs;
      apiStatus = 'operational';
      lastSyncAt = Date.now();
      // Osveži listing občasno — po polnoči se pojavi nov dan
      if (availableDays.length === 0 || !availableDays.includes(day)) {
        try { availableDays = await fetchDriveListing(); } catch {}
      }
    } catch (err) {
      apiStatus = 'offline';
      error = String((err as any)?.message || err);
    } finally {
      syncing = false;
      nextSyncAt = Date.now() + SYNC_INTERVAL_MS;
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(readToday, SYNC_INTERVAL_MS);
    }
  }

  async function loadInitial() {
    try {
      if (driveEnabled()) {
        availableDays = await fetchDriveListing();
      }
    } catch (e) {
      console.warn('[drive] listing failed:', e);
    }
  }
  const initPromise = loadInitial();

  async function startSync() {
    if (!driveEnabled()) {
      error = 'Drive API ni konfiguriran (driveConfig.ts).';
      apiStatus = 'offline';
      return;
    }
    await initPromise;
    nextSyncAt = Date.now();
    readToday();
  }

  function stopSync() {
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    syncing = false;
  }

  function toggleMode() {
    mode = mode === 'desktop' ? 'tv' : 'desktop';
    if (mode === 'tv' && tvRotateOn) startTvRotate();
    else { stopTvRotate(); tvFocusIdx = -1; }
  }

  function applyPeakFilter(evs: DelayEvent[]): DelayEvent[] {
    if (!peakSel.some(x => x)) return evs;
    const active = PEAK_RANGES.filter((_, i) => peakSel[i]);
    return evs.filter(e => {
      const hr = Math.floor((e.schedSec % 86400) / 3600);
      for (const r of active) if (hr >= r.start && hr < r.end) return true;
      return false;
    });
  }

  function applyScopeFilter(evs: DelayEvent[]): DelayEvent[] {
    if (viewScope !== 'odlok') return evs;
    if (!gtfs) return evs;
    const t = gtfs.terminals;
    return evs.filter(e => t.has(`${e.line}|${e.dir}|${e.stopId}`));
  }

  function setViewScope(s: ViewScope) {
    viewScope = s;
  }

  function togglePeak(i: number) {
    if (i < 0 || i >= peakSel.length) return;
    const next = peakSel.slice();
    next[i] = !next[i];
    peakSel = next;
  }
  function clearPeaks() {
    peakSel = PEAK_RANGES.map(() => false);
  }

  async function setViewDay(day: string) {
    if (!day) {
      viewDay = '';
      historicalEvents = [];
      return;
    }
    viewDay = day;
    loadingHistorical = true;
    try {
      historicalEvents = await fetchDriveDay(day);
    } catch {
      historicalEvents = [];
    } finally {
      loadingHistorical = false;
    }
  }

  return {
    get gtfs() { return gtfs; },
    set gtfs(v) { gtfs = v; },
    get loading() { return loading; },
    set loading(v) { loading = v; },
    get loadingMsg() { return loadingMsg; },
    set loadingMsg(v) { loadingMsg = v; },
    get error() { return error; },
    set error(v) { error = v; },
    get events() { return applyPeakFilter(applyScopeFilter(viewDay ? historicalEvents : todayEvents)); },
    get eventsRaw() { return applyScopeFilter(viewDay ? historicalEvents : todayEvents); },
    get isHistorical() { return !!viewDay; },
    get loadingHistorical() { return loadingHistorical; },
    get viewDay() { return viewDay; },
    get availableDays() { return availableDays; },
    get apiStatus() { return apiStatus; },
    get mode() { return mode; },
    get syncing() { return syncing; },
    get nextSyncAt() { return nextSyncAt; },
    get lastSyncAt() { return lastSyncAt; },
    get totalEvents() { return applyScopeFilter(viewDay ? historicalEvents : todayEvents).length; },
    get tick() { return tick; },
    get peakSel() { return peakSel; },
    get peakActive() { return peakSel.some(x => x); },
    get viewScope() { return viewScope; },
    get tvFocusIdx() { return tvFocusIdx; },
    get tvRotateOn() { return tvRotateOn; },
    togglePeak,
    clearPeaks,
    startSync,
    stopSync,
    toggleMode,
    setViewDay,
    setViewScope,
    setTvRotate,
  };
}

export const rt = createState();

// HMR: dev sync timer can't survive module swaps safely.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot!.invalidate();
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
