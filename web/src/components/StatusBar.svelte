<script lang="ts">
  import { rt, downloadBlob } from '../lib/store.svelte';
  import { fetchDriveDayCsv, fetchDriveAllCsv } from '../lib/driveApi';

  function fmtTime(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  const SYNC_TOTAL = 60;

  let countdownSec = $derived.by(() => {
    void rt.tick;
    if (rt.syncing) return 0;
    const ms = rt.nextSyncAt - Date.now();
    return Math.max(0, Math.min(SYNC_TOTAL, Math.ceil(ms / 1000)));
  });

  let syncPct = $derived.by(() => {
    void rt.tick;
    if (rt.syncing) return 100;
    const elapsed = SYNC_TOTAL - countdownSec;
    return Math.max(0, Math.min(100, (elapsed / SYNC_TOTAL) * 100));
  });

  let nowStr = $derived.by(() => {
    void rt.tick;
    return fmtTime(new Date());
  });

  let nowDateStr = $derived.by(() => {
    void rt.tick;
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  });

  let statusLabel = $derived.by(() => {
    if (rt.syncing) return 'SINHRONIZIRAM...';
    if (rt.apiStatus === 'operational') return 'V ŽIVO';
    if (rt.apiStatus === 'degraded') return 'OMEJENO';
    return 'OFFLINE';
  });

  let statusClass = $derived.by(() => {
    if (rt.syncing) return 'cyan';
    if (rt.apiStatus === 'operational') return '';
    if (rt.apiStatus === 'degraded') return 'amber';
    return 'red';
  });

  function prettyDay(d: string): string {
    if (!d || d.length < 8) return d;
    return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
  }

  function todayYYYYMMDD(): string {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  }

  function onDayChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    rt.setViewDay(v === 'live' ? '' : v);
  }

  let exporting = $state(false);

  async function exportSelectedDay() {
    if (exporting) return;
    exporting = true;
    try {
      const day = rt.viewDay || todayYYYYMMDD();
      const csv = await fetchDriveDayCsv(day);
      if (!csv) { alert('CSV ni na voljo za ta dan.'); return; }
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      downloadBlob(blob, `zamude_${prettyDay(day)}.csv`);
    } catch (err) {
      alert('Napaka pri prenosu: ' + (err as any)?.message);
    } finally {
      exporting = false;
    }
  }

  async function exportAll() {
    if (exporting) return;
    exporting = true;
    try {
      const csv = await fetchDriveAllCsv();
      if (!csv) { alert('Ni CSV datotek v Drive.'); return; }
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadBlob(blob, `zamude_vse_${stamp}.csv`);
    } catch (err) {
      alert('Napaka pri prenosu: ' + (err as any)?.message);
    } finally {
      exporting = false;
    }
  }
</script>

<div class="statusbar">
  <div class="left">
    <div class="brand">
      <span class="pulse-dot {statusClass}"></span>
      <span class="title">RTPI <strong>KONTROLNI CENTER</strong></span>
      <span class="sub">JPP Maribor</span>
    </div>
    <div class="divider"></div>
    <div class="status-pill {statusClass}">{statusLabel}</div>
    {#if rt.isHistorical}
      <div class="status-pill amber hist-pill">◷ ZGODOVINA · {prettyDay(rt.viewDay)}</div>
    {/if}
  </div>

  <div class="center">
    <div class="clock-block">
      <span class="clock mono tabular">{nowStr}</span>
      <span class="date mono">{nowDateStr}</span>
    </div>
    {#if rt.gtfs}
      <div class="poll" title={rt.syncing ? 'Berem iz Drive' : `Naslednja sinhronizacija čez ${countdownSec}s`}>
        <div class="ring" style="--pct: {syncPct}%">
          <div class="ring-inner">
            <span class="ring-val mono tabular">{rt.syncing ? '•••' : countdownSec + 's'}</span>
          </div>
        </div>
        <span class="poll-label">{rt.syncing ? 'SYNC' : 'SYNC'}</span>
      </div>
    {/if}
  </div>

  <div class="right">
    {#if rt.gtfs}
      <div class="day-picker" title="Izberi dan za pregled">
        <label class="day-label" for="day-sel">DAN</label>
        <select id="day-sel" class="day-select mono" value={rt.viewDay || 'live'} onchange={onDayChange}>
          <option value="live">● V živo ({prettyDay(todayYYYYMMDD())})</option>
          {#each rt.availableDays.filter(d => d !== todayYYYYMMDD()) as d (d)}
            <option value={d}>{prettyDay(d)}</option>
          {/each}
        </select>
      </div>
      <div class="meta">
        <span class="label">DOGODKI</span>
        <span class="val mono tabular">{rt.totalEvents}</span>
      </div>
      <button class="export-btn" onclick={exportSelectedDay} disabled={exporting} title="Izvozi {rt.isHistorical ? prettyDay(rt.viewDay) : 'današnji dan'} iz Drive">⤓ CSV DAN</button>
      <button class="export-btn" onclick={exportAll} disabled={exporting} title="Izvozi vse dni iz Drive">⤓ CSV VSE</button>
    {/if}
    {#if rt.mode === 'tv'}
      <button
        class="mode-btn rotate-btn"
        class:on={rt.tvRotateOn}
        onclick={() => rt.setTvRotate(!rt.tvRotateOn)}
        title="Avtomatsko kroženje fokusa po sekcijah (vsakih 18 s)"
      >{rt.tvRotateOn ? '◉ ROTACIJA' : '○ ROTACIJA'}</button>
    {/if}
    <button class="mode-btn" onclick={() => rt.toggleMode()} title="Preklop način">
      {rt.mode === 'desktop' ? '▢ ZASLON' : '▦ TV'}
    </button>
  </div>
</div>

<style>
  .statusbar {
    height: 52px;
    background: linear-gradient(180deg, #0d1327, #080d1d);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 18px;
    gap: 16px;
    position: relative;
    flex-shrink: 0;
  }
  .statusbar::after {
    content: "";
    position: absolute;
    left: 0; right: 0; bottom: -1px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--cyan), transparent);
    opacity: 0.3;
  }
  .left { display: flex; align-items: center; gap: 12px; flex: 1; }
  .center { display: flex; align-items: center; gap: 12px; }
  .right { display: flex; align-items: center; gap: 10px; flex: 1; justify-content: flex-end; }

  .brand { display: flex; align-items: center; gap: 10px; }
  .brand .title { font-size: 14px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-muted); font-weight: 500; }
  .brand .title strong { color: var(--text); font-weight: 700; }
  .brand .sub { font-size: 11px; color: var(--text-dim); letter-spacing: 0.08em; text-transform: uppercase; margin-left: 4px; }

  .divider { width: 1px; height: 26px; background: var(--border); }

  .status-pill {
    font-size: 10px;
    letter-spacing: 0.2em;
    font-weight: 700;
    color: var(--green);
    padding: 5px 10px;
    border: 1px solid var(--green);
    border-radius: 999px;
    background: rgba(34, 197, 94, 0.08);
  }
  .status-pill.cyan { color: var(--cyan); border-color: var(--cyan); background: rgba(79, 209, 255, 0.08); }
  .status-pill.amber { color: var(--amber); border-color: var(--amber); background: rgba(245, 165, 36, 0.08); }
  .status-pill.red { color: var(--red); border-color: var(--red); background: rgba(239, 68, 68, 0.08); }

  .clock-block { display: flex; flex-direction: column; align-items: center; line-height: 1; gap: 2px; }
  .clock { font-size: 26px; font-weight: 700; letter-spacing: 0.08em; color: var(--text); }
  .date { font-size: 10px; color: var(--text-dim); letter-spacing: 0.14em; }

  .poll { display: flex; align-items: center; gap: 8px; margin-left: 6px; }
  .ring {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: conic-gradient(var(--cyan) var(--pct, 0%), rgba(79, 209, 255, 0.12) 0);
    display: flex; align-items: center; justify-content: center;
    position: relative;
    transition: background 0.4s linear;
  }
  .ring-inner {
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: #0b1122;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid rgba(79, 209, 255, 0.2);
  }
  .ring-val { font-size: 10px; font-weight: 700; color: var(--cyan); }
  .poll-label { font-size: 9px; letter-spacing: 0.16em; color: var(--text-dim); text-transform: uppercase; }

  /* TV mode scale up clock */
  :global(.app.tv) .clock { font-size: 36px; }
  :global(.app.tv) .date { font-size: 12px; }
  :global(.app.tv) .ring { width: 48px; height: 48px; }
  :global(.app.tv) .ring-val { font-size: 12px; }

  .meta { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
  .meta .label { font-size: 9px; letter-spacing: 0.16em; color: var(--text-dim); text-transform: uppercase; }
  .meta .val { font-size: 13px; color: var(--cyan); }

  .export-btn, .mode-btn {
    font-size: 11px;
    letter-spacing: 0.12em;
    padding: 6px 12px;
    font-weight: 600;
  }
  .mode-btn { border-color: var(--cyan); color: var(--cyan); background: rgba(79, 209, 255, 0.08); }
  .rotate-btn { border-color: var(--border); color: var(--text-dim); background: transparent; }
  .rotate-btn.on { border-color: var(--cyan); color: var(--cyan); background: rgba(79, 209, 255, 0.08); }

  .day-picker { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
  .day-label { font-size: 9px; letter-spacing: 0.16em; color: var(--text-dim); text-transform: uppercase; }
  .day-select {
    background: rgba(20, 28, 51, 0.7);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .day-select:hover { border-color: var(--cyan); }

  .hist-pill { margin-left: 4px; }
</style>
