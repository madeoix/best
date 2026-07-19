<script>
  import { onMount } from 'svelte';
  import { modes } from '$lib/beacon/modes.js';
  import { getDesktopRuntimeInfo } from '$lib/runtime/desktopBridge.js';

  export let active = 'home';

  let desktop = false;

  onMount(async () => {
    try {
      await getDesktopRuntimeInfo();
      desktop = true;
    } catch {
      desktop = false;

      if (modes.find((mode) => mode.id === active)?.desktopOnly) {
        active = 'home';
      }
    }
  });

  $: visibleModes = modes.filter((mode) => !mode.desktopOnly || desktop);
  $: publicModes = visibleModes.filter((mode) => !mode.technical);
  $: technicalModes = visibleModes.filter((mode) => mode.technical);
</script>

<nav class="mode-rail" aria-label="Beacon modules">
  <div class="mode-rail-primary">
    {#each publicModes as mode}
      <button
        class:active={active === mode.id}
        on:click={() => active = mode.id}
        title={mode.label}
        aria-label={mode.label}
      >
        <span class="mode-glyph" aria-hidden="true">{mode.glyph}</span>
        <span class="mode-label">{mode.label}</span>
      </button>
    {/each}
  </div>

  {#if technicalModes.length}
    <div class="mode-rail-technical">
      <span class="mode-group-label">Operator tools</span>

      {#each technicalModes as mode}
        <button
          class:active={active === mode.id}
          class:technical={mode.technical}
          on:click={() => active = mode.id}
          title={mode.label}
          aria-label={mode.label}
        >
          <span class="mode-glyph" aria-hidden="true">{mode.glyph}</span>
          <span class="mode-label">{mode.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</nav>