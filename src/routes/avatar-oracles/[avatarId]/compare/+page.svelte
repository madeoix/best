<script>
  import { page } from '$app/stores';
  import SmallverseAvatarOracleImage from '$lib/components/avatar/SmallverseAvatarOracleImage.svelte';
  import SmallverseAvatarCoreOrbit from '$lib/components/avatar/SmallverseAvatarCoreOrbit.svelte';

  $: avatarId = $page.params.avatarId;
  $: oracleBase = `/avatar-oracles/${avatarId}`;
</script>

<svelte:head>
  <title>Avatar Oracle Evidence</title>
</svelte:head>

<div class="wrap">
  <header>
    <h1>Avatar Oracle Evidence</h1>
    <code>{avatarId}</code>
  </header>

  <section class="panel">
    <h2>Verified render evidence</h2>
    <SmallverseAvatarCoreOrbit
      {avatarId}
      name="Miivfohg Iximso"
      rarity="Verified"
      evidence="Captured Flash render"
    />
  </section>

  <section class="panel">
    <h2>Technical evidence</h2>
    <p>These files explain how the Flash renderer produced the captured PNGs. They are not used as the product renderer.</p>

    <div class="links">
      <a href={`${oracleBase}/oracle.json`} target="_blank">oracle.json</a>
      <a href={`${oracleBase}/snapshot-capture.json`} target="_blank">snapshot-capture.json</a>
      <a href={`${oracleBase}/flash-saveAvatarSnapshot.png`} target="_blank">saveAvatarSnapshot.png</a>
      <a href={`${oracleBase}/config.xml`} target="_blank">config.xml</a>
      <a href={`/avatar-renders/${avatarId}/head-design-sprites.json`} target="_blank">head-design-sprites.json</a>
      <a href={`/avatar-renders/${avatarId}/render-bundle.v3.json`} target="_blank">render-bundle.v3.json</a>
    </div>
  </section>
</div>

<style>
  .wrap {
    padding: 24px;
    color: #e8eef8;
  }

  header {
    margin-bottom: 20px;
  }

  h1 {
    margin: 0 0 8px;
    font-size: 24px;
  }

  h2 {
    margin: 0 0 12px;
    font-size: 16px;
    opacity: 0.86;
  }

  code {
    opacity: 0.75;
  }

  .panel {
    max-width: 760px;
    margin-bottom: 20px;
    padding: 16px;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 14px;
    background: rgba(255,255,255,0.045);
  }

  p {
    color: rgba(232,238,248,0.72);
    font-size: 13px;
  }

  .links {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    margin-top: 12px;
  }

  .links a {
    color: #9ed0ff;
  }
</style>
