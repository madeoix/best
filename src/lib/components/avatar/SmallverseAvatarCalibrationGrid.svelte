<script>
  import { onMount } from 'svelte';

  export let avatarId;

  let loading = true;
  let manifest = null;
  let error = '';
  let selectedIndex = 0;

  $: states = manifest?.states ?? [];
  $: selected = states[selectedIndex] ?? null;

  onMount(async () => {
    if (!avatarId) {
      loading = false;
      return;
    }

    try {
      const response = await fetch(
        `/avatar-calibration/${encodeURIComponent(avatarId)}/manifest.json`,
        { cache: 'no-store' }
      );

      if (response.status === 404) {
        manifest = null;
        return;
      }

      if (!response.ok) {
        throw new Error(`Calibration manifest returned ${response.status}`);
      }

      manifest = await response.json();
    } catch (loadError) {
      error = loadError?.message ?? String(loadError);
    } finally {
      loading = false;
    }
  });
</script>

<section class="calibration-panel">
  <header>
    <div>
      <p>Renderer calibration</p>
      <h2>Captured Flash states</h2>
    </div>

    {#if manifest}
      <span>{states.length} states · {manifest.gender ?? 'unknown gender'}</span>
    {/if}
  </header>

  {#if loading}
    <div class="state">Looking for a sanitized calibration pack…</div>
  {:else if error}
    <div class="state error">{error}</div>
  {:else if !manifest}
    <div class="state">
      No calibration pack is installed for this avatar. The normal captured render still works; this panel is only for renderer development.
    </div>
  {:else if !selected}
    <div class="state">The calibration manifest contains no render states.</div>
  {:else}
    <div class="state-picker" aria-label="Captured render states">
      {#each states as state, index}
        <button
          type="button"
          class:active={index === selectedIndex}
          on:click={() => (selectedIndex = index)}
        >
          <img src={state.thumb} alt="" />
          <span>{state.label ?? `State ${index + 1}`}</span>
        </button>
      {/each}
    </div>

    <div class="selected-state">
      <figure>
        <figcaption>Full body</figcaption>
        <img class="body" src={selected.body} alt={`Captured state ${selectedIndex + 1} full body`} />
      </figure>

      <figure>
        <figcaption>Flash preview</figcaption>
        <img class="preview" src={selected.preview} alt={`Captured state ${selectedIndex + 1} preview`} />
      </figure>

      <div class="metadata">
        <strong>{selected.label ?? `State ${selectedIndex + 1}`}</strong>
        <span>Config SHA-256</span>
        <code>{selected.config_sha256}</code>
        <a href={selected.config} target="_blank" rel="noreferrer">Open sanitized config XML</a>
      </div>
    </div>
  {/if}
</section>

<style>
  .calibration-panel {
    display: grid;
    gap: 18px;
    width: min(960px, calc(100vw - 48px));
    margin: 0 auto 20px;
    padding: 22px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 18px;
    background: rgba(7, 12, 24, 0.76);
  }

  header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 18px;
  }

  header p,
  h2 {
    margin: 0;
  }

  header p {
    color: #89d8ff;
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  h2 {
    margin-top: 5px;
    font-size: 20px;
  }

  header > span,
  .state,
  .metadata span {
    color: rgba(238, 243, 255, 0.58);
    font-size: 12px;
  }

  .state {
    padding: 18px;
    border: 1px dashed rgba(255, 255, 255, 0.14);
    border-radius: 12px;
  }

  .error {
    color: #ffb2b2;
  }

  .state-picker {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .state-picker button {
    display: grid;
    flex: 0 0 auto;
    gap: 7px;
    width: 86px;
    padding: 8px;
    color: rgba(238, 243, 255, 0.66);
    font: inherit;
    font-size: 10px;
    text-align: left;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.025);
    cursor: pointer;
  }

  .state-picker button.active {
    color: #fff;
    border-color: rgba(137, 216, 255, 0.65);
    background: rgba(137, 216, 255, 0.08);
  }

  .state-picker img {
    width: 68px;
    height: 68px;
    object-fit: contain;
    border-radius: 7px;
    background: #04070d;
  }

  .selected-state {
    display: grid;
    grid-template-columns: minmax(150px, 220px) minmax(280px, 1fr) minmax(180px, 240px);
    gap: 18px;
    align-items: start;
  }

  figure {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  figcaption {
    color: rgba(238, 243, 255, 0.48);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  figure img {
    width: 100%;
    object-fit: contain;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: #04070d;
  }

  .body {
    height: 320px;
  }

  .preview {
    height: 260px;
  }

  .metadata {
    display: grid;
    gap: 8px;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.025);
  }

  .metadata code {
    overflow-wrap: anywhere;
    color: rgba(238, 243, 255, 0.78);
    font-size: 10px;
  }

  .metadata a {
    margin-top: 6px;
    color: #9ed0ff;
    font-size: 12px;
  }

  @media (max-width: 820px) {
    .selected-state {
      grid-template-columns: 1fr;
    }

    .body,
    .preview {
      height: 280px;
    }
  }
</style>
