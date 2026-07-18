<script>
  import { onMount } from 'svelte';
  import { modes } from '$lib/beacon/modes.js';
  import { getDesktopRuntimeInfo } from '$lib/runtime/desktopBridge.js';

  export let active = 'observatory';

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
</script>

<nav class="mode-rail" aria-label="Beacon modules">
  {#each visibleModes as mode, index}
    {#if mode.technical && !visibleModes[index - 1]?.technical}
      <span class="mode-group-label">Technical</span>
    {/if}

    <button
      class:active={active === mode.id}
      class:technical={mode.technical}
      on:click={() => active = mode.id}
      title={mode.label}
    >
      <span class="mode-glyph" aria-hidden="true">{mode.glyph}</span>
      <span>{mode.label}</span>
    </button>
  {/each}
</nav>
