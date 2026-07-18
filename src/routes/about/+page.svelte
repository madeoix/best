<svelte:head>
  <title>About Beacon · Smallverse</title>
  <meta name="description" content="What Smallverse Beacon indexes and what its evidence means." />
</svelte:head>

<main class="about">
  <header>
    <p>BEACON</p>
    <h1>Smallverse, indexed with receipts.</h1>
    <span>Beacon is an evidence-backed archive for eligible items, resolved avatars, and resolved spaces.</span>
  </header>

  <section class="principles" aria-label="Beacon principles">
    <article><strong>Only resolved records</strong><span>Public pages require a real name and usable image. Incomplete crawler records stay private.</span></article>
    <article><strong>Evidence has a meaning</strong><span>Equipped, placed, listed, seen, and owned are separate claims. Beacon does not turn one into another.</span></article>
    <article><strong>Source stays available</strong><span>Technical IDs and XML paths are available in a record’s source disclosure, not used as public labels.</span></article>
  </section>

  <section class="vocabulary">
    <p>EVIDENCE VOCABULARY</p>
    <dl>
      <div><dt>Equipped by</dt><dd>Exact appearance/config evidence shows an avatar wearing the item.</dd></div>
      <div><dt>Placed in</dt><dd>An item object was observed in the named space.</dd></div>
      <div><dt>Listed for sale</dt><dd>Market evidence shows a listing context in that space.</dd></div>
      <div><dt>Portrait available</dt><dd>A trusted avatar thumbnail exists; this is not a full body reconstruction.</dd></div>
    </dl>
  </section>
</main>

<style>
  .about{width:min(1040px,calc(100% - 40px));margin:0 auto;padding:clamp(58px,10vw,132px) 0 110px}.about header{max-width:760px;padding-bottom:52px;border-bottom:1px solid var(--beacon-divider)}.about header p,.vocabulary>p{margin:0 0 12px;color:var(--beacon-accent);font-size:10px;font-weight:720;letter-spacing:.16em}.about h1{max-width:700px;margin:0;font-size:clamp(44px,7vw,76px);font-weight:520;letter-spacing:-.06em;line-height:.95}.about header>span{display:block;max-width:590px;margin-top:20px;color:var(--beacon-text-muted);font-size:16px;line-height:1.65}.principles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:42px 0 70px;border-top:1px solid var(--beacon-divider)}.principles article{padding:20px 20px 20px 0;border-bottom:1px solid var(--beacon-divider)}.principles article+article{padding-left:20px;border-left:1px solid var(--beacon-divider)}.principles strong{display:block;font-size:15px;font-weight:590}.principles span{display:block;margin-top:9px;color:var(--beacon-text-muted);font-size:12px;line-height:1.6}.vocabulary{max-width:780px}.vocabulary dl{margin:0;border-top:1px solid var(--beacon-divider)}.vocabulary dl div{display:grid;grid-template-columns:180px 1fr;gap:30px;padding:17px 0;border-bottom:1px solid var(--beacon-divider)}dt{font-size:13px;font-weight:600}dd{margin:0;color:var(--beacon-text-muted);font-size:13px;line-height:1.55}@media(max-width:700px){.about{width:min(100% - 28px,1040px)}.principles{grid-template-columns:1fr}.principles article+article{padding-left:0;border-left:0}.vocabulary dl div{grid-template-columns:1fr;gap:6px}}
</style>
