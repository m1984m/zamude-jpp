export type Stop = { id: number; name: string; lat: number; lon: number };
export type ScheduledDep = { sec: number; dir: 0 | 1; tripId: string; headsign: string };

export type DelayEvent = {
  tsISO: string;         // ISO timestamp when captured
  tsMs: number;          // epoch ms (fast comparisons)
  stopId: number;
  stopName: string;
  line: string;
  dir: 0 | 1;
  headsign: string;
  schedSec: number;      // seconds-from-midnight (GTFS, can exceed 86400)
  actualSec: number;     // seconds-from-midnight of capture (clock)
  delayMin: number;      // + late, - early, 0 on-time
};

export type Snapshot = {
  tsISO: string;
  tsMs: number;
  nEvents: number;
  avgDelay: number;
  onTimePct: number;     // % events with |delay| <= 2 min
  activeLines: number;
  worstStop: { stopId: number; stopName: string; delayMin: number } | null;
};

export type ApiStatus = 'operational' | 'degraded' | 'offline';

export type CycleStats = {
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  stopsOK: number;
  stopsFail: number;
  eventsAdded: number;    // unique, after dedup
  eventsRaw: number;      // before dedup
  status: ApiStatus;
};
