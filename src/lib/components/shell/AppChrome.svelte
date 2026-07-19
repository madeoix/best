<script>
  import ModeRail from './ModeRail.svelte';
  import SessionControls from './SessionControls.svelte';

  export let active = 'home';

  const quickLinks = [
    { id: 'home', label: 'Discover' },
    { id: 'observatory', label: 'Catalog' },
    { id: 'spin', label: 'Spin' },
    { id: 'receipts', label: 'Receipts' }
  ];
</script>

<header class="app-chrome">
  <button class="wordmark" on:click={() => active = 'home'} aria-label="Open Beacon discovery">
    <span>B</span>
    <b>Beacon</b>
  </button>

  <ModeRail bind:active />

  <section class="client-quickbar" aria-label="Beacon quick navigation">
    <nav>
      {#each quickLinks as link}
        <button
          class:active={active === link.id}
          on:click={() => active = link.id}
        >
          {link.label}
        </button>
      {/each}
    </nav>

    <button class="client-command" on:click={() => active = 'home'}>
      <span aria-hidden="true">⌕</span>
      <span>Search Smallverse</span>
      <kbd>⌘ K</kbd>
    </button>

    <SessionControls />
  </section>
</header>