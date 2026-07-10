<script>
  import '$lib/styles/beacon.css';

  import AppChrome from '$lib/components/shell/AppChrome.svelte';
  import BeaconHome from '$lib/components/home/BeaconHome.svelte';
  import AtlasView from '$lib/components/atlas/AtlasView.svelte';
  import SpinView from '$lib/components/spin/SpinView.svelte';
  import EmptyModule from '$lib/components/modules/EmptyModule.svelte';
  import TechnicalModule from '$lib/components/modules/TechnicalModule.svelte';

  let active = 'home';
</script>

<svelte:head>
  <title>Beacon</title>
</svelte:head>

<main class={`beacon mode-${active}`}>
  <div class="ambient"></div>

  <AppChrome bind:active />

  <section class:active-panel={active === 'home'} class="mode-panel">
    <BeaconHome />
  </section>

  <section class:active-panel={active === 'observatory'} class="mode-panel">
    <AtlasView />
  </section>

  <section class:active-panel={active === 'spin'} class="mode-panel">
    <SpinView />
  </section>

  <section class:active-panel={active === 'zoltar'} class="mode-panel">
    <EmptyModule
      eyebrow="ZOLTAR"
      title="Card binder"
      message="No Zoltar card history found yet."
      detail="Cards, duplicates, and collection progress should come from real receipts or real Zoltar data."
      binder={true}
      tone="oracle"
    />
  </section>

  <section class:active-panel={active === 'receipts'} class="mode-panel">
    <EmptyModule
      eyebrow="RECEIPTS"
      title="Account event history"
      message="No receipt endpoint wired yet."
      detail="This module should read real parsed receipts only. No fake reward feed."
      tone="ledger"
    />
  </section>

  <section class:active-panel={active === 'gateway'} class="mode-panel">
    <TechnicalModule
      eyebrow="GATEWAY"
      title="Smallverse DevTools"
      placeholder="Gateway requests, decoded AMF, headers, and raw responses will live here."
      actions={[
        { id: 'test-gateway', label: 'Test spin prices' },
        { id: 'grab-session', label: 'Refresh session' }
      ]}
    />
  </section>

  <section class:active-panel={active === 'explorer'} class="mode-panel">
    <TechnicalModule
      eyebrow="EXPLORER"
      title="Wire view"
      placeholder="RTMP events, workspace observations, asset sightings, and raw streams will live here."
      actions={[
        { id: 'logs', label: 'Open logs' },
        { id: 'safe-run', label: 'Safe run' }
      ]}
    />
  </section>

  <section class:active-panel={active === 'truth'} class="mode-panel">
    <TechnicalModule
      eyebrow="SOURCE OF TRUTH"
      title="Internal layer"
      placeholder="Truth commands appear here."
      actions={[
        { id: 'disk', label: 'Disk' },
        { id: 'oom-check', label: 'OOM check' },
        { id: 'spin-files', label: 'Find spin files' }
      ]}
    />
  </section>
</main>
