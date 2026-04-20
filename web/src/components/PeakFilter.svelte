<script lang="ts">
  import { rt } from '../lib/store.svelte';
  import { PEAK_RANGES } from '../lib/store.svelte';
</script>

<div class="peak-bar">
  <span class="label">KONICE</span>
  <div class="chips">
    {#each PEAK_RANGES as r, i (r.label)}
      <button
        type="button"
        class="chip"
        class:active={rt.peakSel[i]}
        onclick={() => rt.togglePeak(i)}
        title="Filtriraj dogodke z urniško uro {r.label}"
      >{r.label}</button>
    {/each}
    {#if rt.peakActive}
      <button type="button" class="chip clear" onclick={() => rt.clearPeaks()} title="Počisti izbiro">×</button>
    {/if}
  </div>
  {#if rt.peakActive}
    <span class="hint mono">aktivni filter · povprečje obsega izbranih ur</span>
  {:else}
    <span class="hint mono">klik za filter · več izbir = povprečje več konic</span>
  {/if}
</div>

<style>
  .peak-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px;
    background: rgba(13, 19, 39, 0.6);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .label {
    font-size: 10px;
    letter-spacing: 0.18em;
    color: var(--text-dim);
    text-transform: uppercase;
    font-weight: 600;
  }
  .chips {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .chip {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-family: var(--font-mono);
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .chip:hover { border-color: var(--cyan); color: var(--cyan); }
  .chip.active {
    border-color: var(--cyan);
    color: var(--cyan);
    background: rgba(79, 209, 255, 0.12);
    box-shadow: 0 0 0 1px rgba(79, 209, 255, 0.35) inset;
  }
  .chip.clear {
    color: var(--text-dim);
    font-weight: 400;
    font-size: 14px;
    padding: 2px 8px;
    line-height: 1;
  }
  .chip.clear:hover { color: var(--red); border-color: var(--red); }
  .hint {
    font-size: 10px;
    color: var(--text-dim);
    margin-left: auto;
  }

  @media (max-width: 1100px) {
    .peak-bar {
      flex-wrap: wrap;
      padding: 6px 10px;
      gap: 8px;
    }
    .hint { display: none; }
    .chips { flex-wrap: wrap; }
  }
</style>
