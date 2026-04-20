<script lang="ts">
  import { rt } from '../lib/store.svelte';
  import { heatmap } from '../lib/aggregations';

  let data = $derived.by(() => {
    void rt.tick;
    return heatmap(rt.events);
  });

  function color(v: number | null): string {
    if (v === null) return 'transparent';
    if (v <= -1) return 'rgba(79, 209, 255, 0.6)';
    if (v <= 2) return 'rgba(34, 197, 94, 0.5)';
    if (v <= 5) return 'rgba(163, 230, 53, 0.6)';
    if (v <= 10) return 'rgba(245, 165, 36, 0.75)';
    if (v <= 20) return 'rgba(249, 115, 22, 0.85)';
    return 'rgba(239, 68, 68, 0.95)';
  }
  function textColor(v: number | null): string {
    if (v === null) return 'transparent';
    if (v > 5) return '#0f1629';
    return 'var(--text)';
  }
</script>

<div class="heat">
  {#if data.lines.length === 0}
    <div class="empty">čakam podatke</div>
  {:else}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th class="corner"></th>
            {#each data.hours as h}
              <th class="hour mono">{String(h).padStart(2, '0')}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each data.lines as line, i}
            <tr>
              <th class="line-label mono">{line}</th>
              {#each data.matrix[i] as v, j (j)}
                <td class="cell mono" style="background: {color(v)}; color: {textColor(v)};">
                  {v !== null ? (v >= 0 ? '+' : '') + v.toString().replace('.', ',') : ''}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .heat {
    width: 100%; height: 100%;
    padding: 10px 12px;
    overflow: hidden;
    display: flex; flex-direction: column;
  }
  .empty {
    display: flex; align-items: center; justify-content: center;
    flex: 1; color: var(--text-dim); font-size: 12px;
  }
  .scroll {
    overflow: auto;
    flex: 1;
    min-height: 0;
  }
  table {
    border-collapse: separate;
    border-spacing: 2px;
    font-family: var(--font-mono);
  }
  th {
    font-weight: 500;
    color: var(--text-muted);
    font-size: 10px;
    padding: 4px 6px;
    text-align: center;
    background: var(--surface-2);
    border-radius: 4px;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  th.corner { background: transparent; }
  th.line-label {
    position: sticky;
    left: 0;
    background: var(--surface);
    color: var(--cyan);
    font-weight: 600;
    text-align: center;
    z-index: 2;
    min-width: 46px;
  }
  td.cell {
    min-width: 38px;
    height: 22px;
    padding: 0 4px;
    font-size: 10px;
    text-align: center;
    border-radius: 3px;
    transition: background 0.3s ease;
  }
</style>
