<script lang="ts">
  import { rt } from '../lib/store.svelte';
  import { topStops } from '../lib/aggregations';

  let rows = $derived.by(() => {
    void rt.tick;
    return topStops(rt.events, 10, 2);
  });

  function sparkPath(data: number[]): string {
    if (!data.length) return '';
    const w = 80, h = 20;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    const step = data.length > 1 ? w / (data.length - 1) : w;
    return data.map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  function sparkColor(v: number): string {
    if (v > 10) return 'var(--red)';
    if (v > 5) return 'var(--amber)';
    if (v > 2) return 'var(--lime, #a3e635)';
    return 'var(--green)';
  }
</script>

<div class="top-stops">
  {#if !rows.length}
    <div class="empty">čakam podatke</div>
  {:else}
    <div class="list">
      {#each rows as r, i (r.stopId)}
        <div class="row">
          <div class="rank mono">{i + 1}</div>
          <div class="name" title={r.stopName}>{r.stopName}</div>
          <svg class="spark" width="80" height="20" viewBox="0 0 80 20" preserveAspectRatio="none">
            <path d={sparkPath(r.spark)} stroke={sparkColor(r.avgDelay)} stroke-width="1.5" fill="none" />
          </svg>
          <div class="avg mono" style="color: {sparkColor(r.avgDelay)}">
            {r.avgDelay >= 0 ? '+' : ''}{r.avgDelay.toString().replace('.', ',')}
          </div>
          <div class="n mono">n={r.nEvents}</div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .top-stops {
    width: 100%; height: 100%;
    overflow: hidden;
    display: flex; flex-direction: column;
  }
  .empty {
    display: flex; align-items: center; justify-content: center;
    flex: 1; color: var(--text-dim); font-size: 12px;
  }
  .list {
    overflow-y: auto;
    flex: 1;
    padding: 4px 12px 10px;
    min-height: 0;
  }
  .row {
    display: grid;
    grid-template-columns: 20px 1fr 80px 64px 40px;
    gap: 10px;
    align-items: center;
    padding: 7px 4px;
    border-bottom: 1px solid rgba(31, 42, 74, 0.4);
    font-size: 12px;
    transition: background 0.3s;
  }
  .row:hover { background: rgba(31, 42, 74, 0.3); }
  .rank {
    color: var(--text-dim);
    font-size: 11px;
    text-align: center;
  }
  .name {
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .spark {
    opacity: 0.85;
  }
  .avg {
    font-size: 13px;
    font-weight: 600;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .n {
    color: var(--text-dim);
    font-size: 10px;
    text-align: right;
  }
</style>
