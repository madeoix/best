<script>
  import ItemsAtlas from '$lib/components/atlas/ItemsAtlas.svelte';
</script>

<svelte:head>
  <title>Items · Smallverse Beacon</title>
  <meta
    name="description"
    content="Browse rare and legendary Smallverse items backed by captured ownership and space evidence."
  />
</svelte:head>

<section class="item-index" aria-labelledby="items-title">
  <header class="atlas-header">
    <div>
      <p>ITEM INDEX</p>
      <h1 id="items-title">Items</h1>
      <span>Rare and legendary catalog records, observed variants, owners, and source evidence.</span>
    </div>
  </header>

  <ItemsAtlas />
</section>

<style>
  .item-index{width:min(1180px,calc(100% - 40px));margin:0 auto;padding:62px 0 100px}.atlas-header{margin-bottom:35px}.atlas-header p{margin:0 0 9px;color:var(--beacon-accent);font-size:10px;font-weight:700;letter-spacing:.16em}.atlas-header h1{margin:0;font-size:clamp(40px,6vw,64px);font-weight:520;letter-spacing:-.055em}.atlas-header span{display:block;margin-top:12px;color:var(--beacon-text-muted);font-size:13px}
</style>
