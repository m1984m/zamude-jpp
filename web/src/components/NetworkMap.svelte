<script lang="ts">
  import maplibregl, { Map as MLMap } from 'maplibre-gl';
  import { onMount } from 'svelte';
  import { rt } from '../lib/store.svelte';
  import { delaysByStop } from '../lib/aggregations';

  let container: HTMLDivElement;
  let map: MLMap | null = null;
  let loaded = $state(false);

  let delayMap = $derived.by(() => {
    void rt.tick;
    return delaysByStop(rt.events, 10 * 60_000);
  });

  function colorForDelay(d: number): string {
    if (d <= -1) return '#4fd1ff';
    if (d <= 2) return '#22c55e';
    if (d <= 5) return '#a3e635';
    if (d <= 10) return '#f5a524';
    if (d <= 20) return '#f97316';
    return '#ef4444';
  }

  function buildGeoJSON(): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    if (!rt.gtfs) return { type: 'FeatureCollection', features };
    for (const s of rt.gtfs.stops) {
      const d = delayMap.get(s.id);
      const hasDelay = !!d;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          stopId: s.id,
          name: s.name,
          avg: d?.avg ?? 0,
          n: d?.n ?? 0,
          color: hasDelay ? colorForDelay(d!.avg) : '#3b4872',
          active: hasDelay ? 1 : 0,
          radius: hasDelay ? Math.min(18, 4 + Math.sqrt(d!.n) * 2) : 3,
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  $effect(() => {
    void delayMap;
    if (!map || !loaded) return;
    const src = map.getSource('stops') as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(buildGeoJSON() as any);
  });

  onMount(() => {
    map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          'dark-tiles': {
            type: 'raster',
            tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap © CARTO',
          },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#070b18' } },
          { id: 'tiles', type: 'raster', source: 'dark-tiles' },
        ],
      },
      center: [15.645, 46.557],
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    map.on('load', () => {
      map!.addSource('stops', { type: 'geojson', data: buildGeoJSON() as any });
      map!.addLayer({
        id: 'stops-halo',
        type: 'circle',
        source: 'stops',
        filter: ['==', ['get', 'active'], 1],
        paint: {
          'circle-radius': ['*', ['get', 'radius'], 2.2],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.18,
          'circle-blur': 0.8,
        },
      });
      map!.addLayer({
        id: 'stops-dot',
        type: 'circle',
        source: 'stops',
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': ['case', ['==', ['get', 'active'], 1], 1.5, 0.5],
          'circle-stroke-color': ['case', ['==', ['get', 'active'], 1], '#ffffff', '#64759a'],
          'circle-opacity': ['case', ['==', ['get', 'active'], 1], 1, 0.5],
        },
      });

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'map-popup' });
      map!.on('mouseenter', 'stops-dot', (e) => {
        const f = e.features?.[0]; if (!f) return;
        const coords = (f.geometry as any).coordinates.slice();
        const p = f.properties!;
        map!.getCanvas().style.cursor = 'pointer';
        const avg = Number(p.avg).toFixed(1).replace('.', ',');
        const sign = Number(p.avg) >= 0 ? '+' : '';
        const body = Number(p.n)
          ? `<b>${p.name}</b><br>${sign}${avg} min · n=${p.n}`
          : `<b>${p.name}</b><br><span style="color:#5b6b93">brez odhodov v 10 min</span>`;
        popup.setLngLat(coords).setHTML(body).addTo(map!);
      });
      map!.on('mouseleave', 'stops-dot', () => {
        map!.getCanvas().style.cursor = '';
        popup.remove();
      });

      loaded = true;
    });

    return () => { if (map) map.remove(); };
  });
</script>

<div class="map-wrap" bind:this={container}></div>

<style>
  .map-wrap {
    width: 100%;
    height: 100%;
    position: relative;
  }
  :global(.maplibregl-ctrl-attrib) {
    background: rgba(7, 11, 24, 0.6) !important;
    color: var(--text-dim) !important;
    font-size: 9px !important;
  }
  :global(.maplibregl-ctrl-attrib a) {
    color: var(--text-muted) !important;
  }
  :global(.map-popup .maplibregl-popup-content) {
    background: #0f1629;
    color: var(--text);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    font-size: 12px;
    font-family: var(--font-mono);
    padding: 8px 10px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.6);
  }
  :global(.map-popup .maplibregl-popup-tip) {
    border-top-color: #0f1629 !important;
    border-bottom-color: #0f1629 !important;
  }
</style>
