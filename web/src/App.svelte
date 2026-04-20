<script lang="ts">
  import { onMount } from 'svelte';
  import { rt } from './lib/store.svelte';
  import { loadGTFSFromFile } from './lib/gtfs';
  import StatusBar from './components/StatusBar.svelte';
  import KpiTiles from './components/KpiTiles.svelte';
  import Histogram from './components/Histogram.svelte';
  import NetworkMap from './components/NetworkMap.svelte';
  import Heatmap from './components/Heatmap.svelte';
  import TopStops from './components/TopStops.svelte';
  import LiveFeed from './components/LiveFeed.svelte';
  import DirectionBars from './components/DirectionBars.svelte';
  import AnomalyStrip from './components/AnomalyStrip.svelte';
  import PeakFilter from './components/PeakFilter.svelte';
  import ScopeTabs from './components/ScopeTabs.svelte';

  let bootError = $state<string | null>(null);

  onMount(async () => {
    if (rt.gtfs) return;
    rt.loading = true;
    try {
      rt.loadingMsg = 'Prenašam GTFS...';
      const res = await fetch(import.meta.env.BASE_URL + 'gtfs.zip');
      if (!res.ok) throw new Error(`HTTP ${res.status} pri /gtfs.zip`);
      const blob = await res.blob();
      const file = new File([blob], 'gtfs.zip', { type: 'application/zip' });
      const g = await loadGTFSFromFile(file, (m) => (rt.loadingMsg = m));
      rt.gtfs = g;
      rt.loadingMsg = `GTFS pripravljen · ${g.stops.length} postaj · ${g.lines.length} linij`;
      rt.startSync();
    } catch (err: any) {
      bootError = String(err?.message || err);
    } finally {
      rt.loading = false;
    }
  });
</script>

<div class="app {rt.mode}">
  <StatusBar />

  {#if !rt.gtfs}
    <div class="boot">
      <div class="boot-inner">
        <div class="brand-big"><span class="pulse-dot cyan"></span> RTPI KONTROLNI CENTER</div>
        <div class="boot-msg">{rt.loadingMsg || 'Inicializacija...'}</div>
        {#if bootError}<div class="error-msg">Napaka: {bootError}</div>{/if}
      </div>
    </div>
  {:else}
    <AnomalyStrip />
    <ScopeTabs />
    <PeakFilter />
    <main class="grid" class:tv-rotate={rt.mode === 'tv' && rt.tvFocusIdx >= 0}>
      <!-- A: KPI tiles row -->
      <section class="kpi-row" class:focused={rt.tvFocusIdx === 0}>
        <KpiTiles />
      </section>

      <!-- E: Network map -->
      <section class="card map" class:focused={rt.tvFocusIdx === 1}>
        <div class="card-header">
          <span class="card-title">Mrežni zemljevid · postaje · avg zadnjih 10 min</span>
          <span class="card-meta">velikost točke ∝ √(št. dogodkov)</span>
        </div>
        <div class="card-body"><NetworkMap /></div>
      </section>

      <!-- D: Histogram -->
      <section class="card hist" class:focused={rt.tvFocusIdx === 2}>
        <div class="card-header">
          <span class="card-title">Razporeditev zamud</span>
          <span class="card-meta">6 razredov · {rt.peakActive ? 'izbrane ure' : 'ves dan'}</span>
        </div>
        <div class="card-body"><Histogram /></div>
      </section>

      <!-- G: Top stops -->
      <section class="card top-stops" class:focused={rt.tvFocusIdx === 3}>
        <div class="card-header">
          <span class="card-title">Najslabših 10 postaj</span>
          <span class="card-meta">povp + trend · {rt.peakActive ? 'izbrane ure' : 'ves dan'}</span>
        </div>
        <div class="card-body"><TopStops /></div>
      </section>

      <!-- H: Live feed -->
      <section class="card feed" class:focused={rt.tvFocusIdx === 4}>
        <div class="card-header">
          <span class="card-title">Živ tok dogodkov</span>
          <span class="card-meta">najnovejše zgoraj · max 60</span>
        </div>
        <div class="card-body"><LiveFeed /></div>
      </section>

      <!-- F: Heatmap -->
      <section class="card heat" class:focused={rt.tvFocusIdx === 5}>
        <div class="card-header">
          <span class="card-title">Heatmap · ura × linija</span>
          <span class="card-meta">kumulativno čez sejo · min</span>
        </div>
        <div class="card-body"><Heatmap /></div>
      </section>

      <!-- I: Direction bars -->
      <section class="card dir" class:focused={rt.tvFocusIdx === 6}>
        <div class="card-header">
          <span class="card-title">Smeri · v center ↔ iz centra</span>
          <span class="card-meta">povp zamuda po liniji · {rt.peakActive ? 'izbrane ure' : 'ves dan'}</span>
        </div>
        <div class="card-body"><DirectionBars /></div>
      </section>
    </main>
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
  }
  main.grid {
    flex: 1;
    display: grid;
    gap: 8px;
    padding: 8px;
    min-height: 0;
    overflow: hidden;
  }

  /* Desktop layout: 12-column grid */
  .app.desktop main.grid {
    grid-template-columns: repeat(12, 1fr);
    grid-template-rows: 160px 1fr 1fr;
    grid-template-areas:
      "kpi  kpi  kpi  kpi  kpi  kpi  kpi  kpi  map  map  map  map"
      "hist hist hist hist top  top  top  top  map  map  map  map"
      "heat heat heat heat feed feed feed feed dir  dir  dir  dir";
  }
  .app.desktop .kpi-row { grid-area: kpi; }
  .app.desktop .map { grid-area: map; }
  .app.desktop .hist { grid-area: hist; }
  .app.desktop .top-stops { grid-area: top; }
  .app.desktop .feed { grid-area: feed; }
  .app.desktop .heat { grid-area: heat; }
  .app.desktop .dir { grid-area: dir; }

  /* TV layout: denser, bigger text, fixed 16:9 */
  .app.tv main.grid {
    grid-template-columns: repeat(12, 1fr);
    grid-template-rows: 200px 1fr 1fr;
    grid-template-areas:
      "kpi  kpi  kpi  kpi  kpi  kpi  kpi  kpi  map  map  map  map"
      "hist hist hist hist top  top  top  top  map  map  map  map"
      "heat heat heat heat feed feed feed feed dir  dir  dir  dir";
    gap: 12px;
    padding: 12px;
  }
  .app.tv .kpi-row { grid-area: kpi; }
  .app.tv .map { grid-area: map; }
  .app.tv .hist { grid-area: hist; }
  .app.tv .top-stops { grid-area: top; }
  .app.tv .feed { grid-area: feed; }
  .app.tv .heat { grid-area: heat; }
  .app.tv .dir { grid-area: dir; }

  /* TV text scale-up */
  .app.tv :global(.kpi-num) { font-size: 56px; }
  .app.tv :global(.kpi-label) { font-size: 12px; }
  .app.tv :global(.card-title) { font-size: 13px; }
  .app.tv :global(.card-meta) { font-size: 12px; }

  .kpi-row {
    min-height: 0;
    transition: opacity 0.6s, filter 0.6s, transform 0.6s;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    transition: opacity 0.6s, filter 0.6s, transform 0.6s, box-shadow 0.4s, border-color 0.4s;
  }

  /* TV auto-rotate: dimm vse sekcije razen fokusirane, fokusirana dobi cyan glow. */
  main.grid.tv-rotate > section { opacity: 0.32; filter: saturate(0.7); }
  main.grid.tv-rotate > section.focused {
    opacity: 1;
    filter: none;
    box-shadow: 0 0 0 2px var(--cyan), 0 0 40px rgba(79, 209, 255, 0.35);
    border-color: var(--cyan);
    z-index: 2;
  }
  main.grid.tv-rotate > section.kpi-row.focused {
    box-shadow: 0 0 30px rgba(79, 209, 255, 0.35);
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
    background: rgba(20, 28, 51, 0.5);
    flex-shrink: 0;
  }
  .card-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-weight: 600;
    color: var(--text-muted);
  }
  .card-meta {
    font-size: 10px;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }
  .card-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .boot {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(ellipse at top, rgba(79, 209, 255, 0.06), transparent 50%),
      var(--bg);
  }
  .boot-inner {
    display: flex; flex-direction: column; align-items: center; gap: 18px;
    padding: 40px 60px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--surface);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  .brand-big {
    display: flex; align-items: center; gap: 12px;
    font-size: 24px;
    letter-spacing: 0.18em;
    font-weight: 700;
  }
  .boot-msg {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.04em;
  }
  .error-msg {
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: var(--red);
    border-radius: 8px;
    font-size: 12px;
    font-family: var(--font-mono);
  }

  /* Responsive: under 1100px, stack into single column */
  @media (max-width: 1100px) {
    .app.desktop main.grid {
      grid-template-columns: 1fr;
      grid-template-rows: auto;
      grid-template-areas:
        "kpi"
        "map"
        "feed"
        "top"
        "hist"
        "dir"
        "heat";
      overflow-y: auto;
    }
    .card { min-height: 260px; }
    .kpi-row { min-height: auto; }
  }
</style>
