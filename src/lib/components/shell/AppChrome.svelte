<script>
  import ModeRail from './ModeRail.svelte';
  import SessionControls from './SessionControls.svelte';

  export let active = 'home';
</script>

<header class="app-chrome">
  <button class="wordmark" on:click={() => active = 'home'}>
    <span>BEACON</span>
    <b>Smallverse</b>
  </button>

  <ModeRail bind:active />

  <SessionControls />
</header>
