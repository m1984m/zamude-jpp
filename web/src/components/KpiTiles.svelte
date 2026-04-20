<script lang="ts">
  import { rt } from '../lib/store.svelte';
  import { kpis } from '../lib/aggregations';

  let kpi = $derived(kpis(rt.events));

  // Najslabša postaja: vedno zadnji 2h iz ne-filtriranih dogodkov (ni vezano na peak filter).
  let worst2h = $derived.by(() => {
    const evs = rt.eventsRaw;
    if (!evs.length) return null;
    let maxTs = 0;
    for (const e of evs) if (e.tsMs > maxTs) maxTs = e.tsMs;
    const cutoff = maxTs - 2 * 3600 * 1000;
    const recent = evs.filter(e => e.tsMs >= cutoff);
    if (!recent.length) return null;
    return kpis(recent).worstStop;
  });

  // Tween helper (no dep): animate displayed value toward target.
  let displayAvg = $state(0);
  let displayOnTime = $state(0);
  let displayOnTime5 = $state(0);
  let displayActive = $state(0);
  let displayN = $state(0);

  $effect(() => {
    const targetAvg = kpi.avgDelay;
    const targetOT = kpi.onTimePct;
    const targetOT5 = kpi.onTimePct5;
    const targetAL = kpi.activeLines;
    const targetN = kpi.nEvents;
    const start = performance.now();
    const fromAvg = displayAvg;
    const fromOT = displayOnTime;
    const fromOT5 = displayOnTime5;
    const fromAL = displayActive;
    const fromN = displayN;
    const dur = 600;
    let rafId = 0;
    function step(now: number) {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      displayAvg = fromAvg + (targetAvg - fromAvg) * e;
      displayOnTime = fromOT + (targetOT - fromOT) * e;
      displayOnTime5 = fromOT5 + (targetOT5 - fromOT5) * e;
      displayActive = Math.round(fromAL + (targetAL - fromAL) * e);
      displayN = Math.round(fromN + (targetN - fromN) * e);
      if (t < 1) rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  });

  function avgColor(v: number): string {
    if (v > 10) return 'var(--red)';
    if (v > 5) return 'var(--amber)';
    if (v > 2) return 'var(--lime, #a3e635)';
    if (v < -1) return 'var(--cyan)';
    return 'var(--green)';
  }
  function otColor(v: number): string {
    if (v >= 80) return 'var(--green)';
    if (v >= 60) return 'var(--amber)';
    return 'var(--red)';
  }
  function odlokColor(v: number): string {
    if (v >= 90) return 'var(--green)';
    if (v >= 80) return 'var(--amber)';
    return 'var(--red)';
  }
</script>

<div class="kpi-grid">
  <div class="kpi-tile">
    <div class="kpi-label">Povp. zamuda</div>
    <div class="kpi-num" style="color: {avgColor(kpi.avgDelay)}">
      {kpi.avgDelay >= 0 ? '+' : ''}{displayAvg.toFixed(1).replace('.', ',')}
      <span class="unit">min</span>
    </div>
    <div class="kpi-sub">{rt.peakActive ? 'izbrane ure' : 'ves dan'} · n={kpi.nEvents}</div>
  </div>

  <div class="kpi-tile">
    <div class="kpi-label">Na čas (≤2 min)</div>
    <div class="kpi-num" style="color: {otColor(kpi.onTimePct)}">
      {displayOnTime.toFixed(1).replace('.', ',')}<span class="unit">%</span>
    </div>
    <div class="kpi-sub">delež točnih odhodov</div>
  </div>

  <div class="kpi-tile">
    <div class="kpi-label">Skladnost Odlok</div>
    <div class="kpi-num" style="color: {odlokColor(kpi.onTimePct5)}">
      {displayOnTime5.toFixed(1).replace('.', ',')}<span class="unit">%</span>
    </div>
    <div class="kpi-sub">≤5 min · cilj ≥ 90 %</div>
  </div>

  <div class="kpi-tile">
    <div class="kpi-label">Najslabša postaja · 2h</div>
    {#if worst2h}
      <div class="kpi-num worst">
        +{worst2h.delayMin.toString().replace('.', ',')}<span class="unit">min</span>
      </div>
      <div class="kpi-sub stop-name" title={worst2h.stopName}>{worst2h.stopName}</div>
    {:else}
      <div class="kpi-num dim">—</div>
      <div class="kpi-sub">čakam podatke</div>
    {/if}
  </div>

  <div class="kpi-tile">
    <div class="kpi-label">Aktivnih linij</div>
    <div class="kpi-num" style="color: var(--cyan)">
      {displayActive}
    </div>
    <div class="kpi-sub">
      {#if kpi.worstLine}
        Najslabša: <span class="mono">{kpi.worstLine.line}</span> (+{kpi.worstLine.delayMin})
      {:else}
        unique linij z odhodi
      {/if}
    </div>
  </div>
</div>

<style>
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    height: 100%;
    padding: 8px;
  }
  .kpi-tile {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
    position: relative;
  }
  .kpi-tile::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--cyan), transparent);
    opacity: 0.4;
  }
  .kpi-label {
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-muted);
    font-weight: 600;
  }
  .kpi-num {
    font-size: 42px;
    line-height: 1;
  }
  .kpi-num .unit {
    font-size: 14px;
    color: var(--text-muted);
    margin-left: 4px;
    font-weight: 500;
  }
  .kpi-num.worst { color: var(--red); }
  .kpi-num.dim { color: var(--text-dim); }
  .kpi-sub {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }
  .stop-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 1100px) {
    .kpi-grid {
      grid-template-columns: 1fr;
      gap: 8px;
      padding: 8px;
    }
    .kpi-num { font-size: 36px; }
  }
</style>
