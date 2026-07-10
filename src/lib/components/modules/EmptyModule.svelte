<script>
  import { Button } from '$lib/components/ui/button/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';

  export let eyebrow = '';
  export let title = '';
  export let message = '';
  export let detail = '';
  export let binder = false;
  export let tone = 'default';
</script>

<section class={`module workspace-module empty-workspace tone-${tone}`}>
  <header class="workspace-module-header">
    <div>
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <span>{detail}</span>
    </div>

    <div class="workspace-status-card">
      <Badge variant="secondary">Not wired</Badge>
      <span>Waiting for real Smallverse data.</span>
    </div>
  </header>

  <section class="empty-workspace-grid">
    <main class="empty-workspace-panel">
      <section class="workspace-empty-state large">
        <b>{message}</b>
        <span>{detail}</span>

        <Button variant="outline" disabled>
          Real data required
        </Button>
      </section>
    </main>

    <aside class="empty-workspace-rail">
      {#if binder}
        <div class="binder-preview" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </div>
      {:else}
        <div class="module-wireframe" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </div>
      {/if}
    </aside>
  </section>
</section>
