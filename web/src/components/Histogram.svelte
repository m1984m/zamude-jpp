<script lang="ts">
  import { rt } from '../lib/store.svelte';
  import { histogram, HISTOGRAM_BINS } from '../lib/aggregations';

  let counts = $derived.by(() => {
    void rt.tick;
    return histogram(rt.events);
  });

  let maxCount = $derived(Math.max(1, ...counts));
  let total = $derived(counts.reduce((a, b) => a + b, 0));
</script>

<div class="hist">
  <div class="bars">
    {#each HISTOGRAM_BINS as bin, i}
      {@const c = counts[i]}
      {@const pct = total ? (c / total) * 100 : 0}
      {@const h = (c / maxCount) * 100}
      <div class="col">
        <div class="bar-holder">
          <div class="bar" style="height: {h}%; background: {bin.color};"></div>
          <div class="bar-value mono">{c}</div>
        </div>
        <div class="bar-label">{bin.label}</div>
        <div class="bar-pct mono">{pct.toFixed(0)}%</div>
      </div>
    {/each}
  </div>
  <div class="meta">
    <span class="mono">n = {total}</span>
  </div>
</div>

<style>
  .hist {
    width: 100%; height: 100%;
    padding: 12px 16px 8px;
    display: flex; flex-direction: column;
    min-height: 0;
  }
  .bars {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
    align-items: end;
    min-height: 0;
  }
  .col {
    display: flex; flex-direction: column; align-items: center;
    gap: 4px; min-width: 0; height: 100%;
  }
  .bar-holder {
    width: 100%;
    flex: 1;
    display: flex; flex-direction: column; justify-content: flex-end;
    position: relative;
    min-height: 0;
  }
  .bar {
    width: 100%;
    min-height: 2px;
    border-radius: 3px 3px 0 0;
    transition: height 0.6s cubic-bezier(0.2, 0.7, 0.3, 1);
    box-shadow: 0 0 16px currentColor;
    opacity: 0.8;
  }
  .bar-value {
    position: absolute;
    top: 4px; left: 0; right: 0;
    text-align: center;
    font-size: 11px;
    color: var(--text);
    font-weight: 600;
  }
  .bar-label {
    font-size: 9px;
    text-align: center;
    color: var(--text-muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }
  .bar-pct {
    font-size: 10px;
    color: var(--text-dim);
  }
  .meta {
    text-align: right;
    font-size: 10px;
    color: var(--text-dim);
    margin-top: 6px;
  }
</style>
