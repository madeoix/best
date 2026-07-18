<script>
  import SpacesAtlas from '$lib/components/atlas/SpacesAtlas.svelte';
</script>

<svelte:head>
  <title>Spaces · Smallverse Beacon</title>
  <meta
    name="description"
    content="Explore Smallverse spaces and the item, owner, and capture evidence observed inside them."
  />
</svelte:head>

<section class="space-index" aria-labelledby="spaces-title">
  <header class="atlas-header">
    <div>
      <p>WORLD INDEX</p>
      <h1 id="spaces-title">Spaces</h1>
      <span>Places, markets, owners, item signals, and evidence from Beacon observations.</span>
    </div>
  </header>

  <SpacesAtlas />
</section>

<style>
  .space-index{width:min(1120px,calc(100% - 40px));margin:0 auto;padding:62px 0 100px}.atlas-header{margin-bottom:42px}.atlas-header p{margin:0 0 9px;color:var(--beacon-accent);font-size:10px;font-weight:700;letter-spacing:.16em}.atlas-header h1{margin:0;font-size:clamp(40px,6vw,64px);font-weight:520;letter-spacing:-.055em}.atlas-header span{display:block;margin-top:12px;color:var(--beacon-text-muted);font-size:13px}
</style>
