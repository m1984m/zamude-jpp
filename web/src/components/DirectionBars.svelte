<script lang="ts">
  import { rt } from '../lib/store.svelte';
  import { directionBars } from '../lib/aggregations';

  let rows = $derived.by(() => {
    void rt.tick;
    return directionBars(rt.events).filter(r => r.dir0N + r.dir1N >= 1);
  });

  let maxAbs = $derived(Math.max(1, ...rows.flatMap(r => [
    r.dir0Avg !== null ? Math.abs(r.dir0Avg) : 0,
    r.dir1Avg !== null ? Math.abs(r.dir1Avg) : 0,
  ])));

  function color(v: number | null): string {
    if (v === null) return 'transparent';
    if (v > 10) return 'var(--red)';
    if (v > 5) return 'var(--amber)';
    if (v > 2) return '#a3e635';
    if (v < -1) return 'var(--cyan)';
    return 'var(--green)';
  }
</script>

<div class="dir-bars">
  {#if !rows.length}
    <div class="empty">čakam podatke</div>
  {:else}
    <div class="legend">
      <span class="l-label">← v center</span>
      <span class="l-label">iz centra →</span>
    </div>
    <div class="list">
      {#each rows as r (r.line)}
        {@const pct0 = r.dir0Avg !== null ? (Math.abs(r.dir0Avg) / maxAbs) * 100 : 0}
        {@const pct1 = r.dir1Avg !== null ? (Math.abs(r.dir1Avg) / maxAbs) * 100 : 0}
        <div class="row">
          <div class="side left">
            <div class="val mono" style="color: {color(r.dir0Avg)}">
              {r.dir0Avg !== null ? (r.dir0Avg >= 0 ? '+' : '') + r.dir0Avg.toString().replace('.', ',') : '—'}
            </div>
            <div class="bar-wrap">
              <div class="bar bar-l" style="width: {pct0}%; background: {color(r.dir0Avg)};"></div>
            </div>
          </div>
          <div class="line mono">{r.line}</div>
          <div class="side right">
            <div class="bar-wrap">
              <div class="bar bar-r" style="width: {pct1}%; background: {color(r.dir1Avg)};"></div>
            </div>
            <div class="val mono" style="color: {color(r.dir1Avg)}">
              {r.dir1Avg !== null ? (r.dir1Avg >= 0 ? '+' : '') + r.dir1Avg.toString().replace('.', ',') : '—'}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .dir-bars {
    width: 100%; height: 100%;
    overflow: hidden;
    display: flex; flex-direction: column;
    padding: 8px 12px 10px;
  }
  .legend {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 0 60px 6px;
  }
  .empty {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: var(--text-dim); font-size: 12px;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 44px 1fr;
    gap: 10px;
    align-items: center;
    padding: 5px 0;
    font-size: 11px;
  }
  .line {
    text-align: center;
    font-weight: 700;
    color: var(--cyan);
    background: rgba(79, 209, 255, 0.08);
    border-radius: 4px;
    padding: 2px 0;
  }
  .side { display: flex; align-items: center; gap: 8px; }
  .side.left { justify-content: flex-end; }
  .side.right { justify-content: flex-start; }
  .bar-wrap {
    flex: 1;
    height: 8px;
    background: rgba(31, 42, 74, 0.4);
    border-radius: 2px;
    position: relative;
    overflow: hidden;
  }
  .bar {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 2px;
    transition: width 0.6s cubic-bezier(0.2, 0.7, 0.3, 1), background 0.3s;
  }
  .bar-l { right: 0; }
  .bar-r { left: 0; }
  .val {
    font-size: 11px;
    font-weight: 600;
    min-width: 34px;
    text-align: right;
  }
  .side.right .val { text-align: left; }
</style>
