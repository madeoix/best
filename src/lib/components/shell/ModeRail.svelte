<script>
  import { modes } from '$lib/beacon/modes.js';

  export let active = 'observatory';
</script>

<nav class="mode-rail" aria-label="Beacon modules">
  {#each modes as mode}
    <button
      class:active={active === mode.id}
      on:click={() => active = mode.id}
    >
      {mode.label}
    </button>
  {/each}
</nav>
