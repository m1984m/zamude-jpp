<script lang="ts">
  import { rt } from '../lib/store.svelte';
</script>

<div class="scope-bar">
  <div class="tabs">
    <button
      type="button"
      class="tab"
      class:active={rt.viewScope === 'odlok'}
      onclick={() => rt.setViewScope('odlok')}
      title="Zamude merjene le na končnih postajah (skladno z Odlokom)"
    >
      <span class="dot"></span>
      Po Odloku
      <span class="sub">končne postaje</span>
    </button>
    <button
      type="button"
      class="tab"
      class:active={rt.viewScope === 'vse'}
      onclick={() => rt.setViewScope('vse')}
      title="Zamude na vseh postajah (analitični pogled)"
    >
      <span class="dot"></span>
      Napredno
      <span class="sub">vse postaje</span>
    </button>
  </div>
</div>

<style>
  .scope-bar {
    display: flex;
    align-items: center;
    padding: 6px 14px;
    background: rgba(10, 15, 32, 0.7);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .tabs {
    display: flex;
    gap: 4px;
    background: rgba(20, 28, 51, 0.5);
    padding: 3px;
    border-radius: 10px;
    border: 1px solid var(--border);
  }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 6px 14px;
    border-radius: 7px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s, background 0.15s, border-color 0.15s;
  }
  .tab .sub {
    font-size: 9px;
    letter-spacing: 0.14em;
    color: var(--text-dim);
    font-weight: 500;
    font-family: var(--font-mono);
    text-transform: uppercase;
  }
  .tab .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-dim);
  }
  .tab:hover { color: var(--text); }
  .tab.active {
    color: var(--cyan);
    background: rgba(79, 209, 255, 0.1);
    border-color: rgba(79, 209, 255, 0.4);
    box-shadow: 0 0 0 1px rgba(79, 209, 255, 0.15) inset;
  }
  .tab.active .dot {
    background: var(--cyan);
    box-shadow: 0 0 6px var(--cyan);
  }
  .tab.active .sub { color: var(--cyan); opacity: 0.7; }

  @media (max-width: 1100px) {
    .scope-bar { padding: 6px 10px; }
    .tab { padding: 5px 10px; }
    .tab .sub { display: none; }
  }
</style>
