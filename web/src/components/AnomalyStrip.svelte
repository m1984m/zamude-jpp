<script lang="ts">
  import { rt } from '../lib/store.svelte';
  import { detectAnomalies } from '../lib/aggregations';

  let anomalies = $derived.by(() => {
    void rt.tick;
    return detectAnomalies(rt.events);
  });
</script>

{#if anomalies.length}
  <div class="strip">
    <span class="badge">⚠ KASKADNA ZAMUDA</span>
    <div class="items">
      {#each anomalies as a (a.line)}
        <span class="item">
          <span class="line mono">{a.line}</span>
          <span class="detail">{a.stops} postaj · povp. +{a.avg} min</span>
        </span>
      {/each}
    </div>
  </div>
{/if}

<style>
  .strip {
    background: linear-gradient(90deg, rgba(239, 68, 68, 0.25), rgba(239, 68, 68, 0.1));
    border-top: 1px solid var(--red);
    border-bottom: 1px solid rgba(239, 68, 68, 0.5);
    padding: 8px 18px;
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 12px;
    color: var(--text);
    box-shadow: 0 0 16px rgba(239, 68, 68, 0.25);
    flex-shrink: 0;
  }
  .badge {
    background: var(--red);
    color: #001724;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
  }
  .items {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
  .item { display: flex; align-items: center; gap: 6px; }
  .line {
    background: var(--red);
    color: #001724;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 11px;
  }
  .detail { color: var(--text-muted); font-size: 11px; }
</style>
