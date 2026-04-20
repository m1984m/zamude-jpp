<script lang="ts">
  import { rt } from '../lib/store.svelte';
  import type { DelayEvent } from '../lib/types';

  const MAX_ITEMS = 60;

  function keyOf(e: DelayEvent): string {
    return `${e.tsISO.slice(0,10)}|${e.stopId}|${e.line}|${e.schedSec}`;
  }

  let feed = $derived.by(() => {
    const evs = rt.events;
    if (!evs.length) return [] as DelayEvent[];
    // Sort desc, dedup by natural key, cap.
    const sorted = evs.slice().sort((a, b) => b.tsMs - a.tsMs);
    const seen = new Set<string>();
    const out: DelayEvent[] = [];
    for (const e of sorted) {
      const k = keyOf(e);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  });

  function sev(d: number): string {
    if (d > 10) return 'red';
    if (d > 5) return 'amber';
    if (d > 2) return 'lime';
    if (d < -1) return 'cyan';
    return 'green';
  }

  function fmtTime(tsMs: number): string {
    const d = new Date(tsMs);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }
</script>

<div class="feed">
  {#if !feed.length}
    <div class="empty">čakam dogodke</div>
  {:else}
    <div class="items">
      {#each feed as ev (keyOf(ev))}
        <div class="item flash-in">
          <div class="ts mono">{fmtTime(ev.tsMs)}</div>
          <div class="line mono">{ev.line}</div>
          <div class="dir {ev.dir === 0 ? 'd0' : 'd1'}">{ev.dir === 0 ? '→1' : '→2'}</div>
          <div class="stop" title={ev.stopName}>{ev.stopName}</div>
          <div class="delay mono {sev(ev.delayMin)}">
            {ev.delayMin >= 0 ? '+' : ''}{ev.delayMin} min
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .feed {
    width: 100%; height: 100%;
    overflow: hidden;
    display: flex; flex-direction: column;
  }
  .empty {
    display: flex; align-items: center; justify-content: center;
    flex: 1; color: var(--text-dim); font-size: 12px;
  }
  .items {
    flex: 1;
    overflow-y: auto;
    padding: 4px 10px 10px;
    min-height: 0;
  }
  .item {
    display: grid;
    grid-template-columns: 68px 38px 28px 1fr 60px;
    gap: 8px;
    align-items: center;
    padding: 6px 6px;
    font-size: 11px;
    border-bottom: 1px solid rgba(31, 42, 74, 0.4);
  }
  .ts { color: var(--text-dim); font-size: 10px; }
  .line {
    font-weight: 700;
    color: var(--cyan);
    background: rgba(79, 209, 255, 0.1);
    border: 1px solid rgba(79, 209, 255, 0.3);
    border-radius: 5px;
    text-align: center;
    padding: 2px 4px;
    font-size: 11px;
  }
  .dir {
    font-size: 10px;
    color: var(--text-dim);
    text-align: center;
  }
  .stop {
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .delay {
    text-align: right;
    font-weight: 600;
  }
  .delay.red { color: var(--red); }
  .delay.amber { color: var(--amber); }
  .delay.lime { color: #a3e635; }
  .delay.green { color: var(--green); }
  .delay.cyan { color: var(--cyan); }
</style>
