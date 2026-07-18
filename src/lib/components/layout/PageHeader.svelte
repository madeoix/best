<script>
  import '$lib/styles/beacon-foundation.css';

  let {
    eyebrow = '',
    title,
    description = '',
    breadcrumbs = [],
    metadata = [],
    headingId = undefined,
    class: className = '',
    actions
  } = $props();
</script>

<header class={`bui-page-header ${className}`} data-beacon-page-header>
  {#if breadcrumbs.length}
    <nav class="bui-page-header__breadcrumbs" aria-label="Breadcrumb">
      {#each breadcrumbs as crumb, index}
        {#if index > 0}
          <span class="bui-page-header__breadcrumb-separator" aria-hidden="true">/</span>
        {/if}

        {#if crumb.href && index < breadcrumbs.length - 1}
          <a href={crumb.href}>{crumb.label}</a>
        {:else}
          <span aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>
            {crumb.label}
          </span>
        {/if}
      {/each}
    </nav>
  {/if}

  <div class="bui-page-header__row">
    <div class="bui-page-header__copy">
      {#if eyebrow}<p class="bui-eyebrow">{eyebrow}</p>{/if}
      <h1 id={headingId}>{title}</h1>
      {#if description}<p class="bui-page-header__description">{description}</p>{/if}
    </div>

    {#if actions}
      <div class="bui-page-header__actions">
        {@render actions()}
      </div>
    {/if}
  </div>

  {#if metadata.length}
    <div class="bui-page-header__meta" aria-label="Page metadata">
      {#each metadata as item}
        <span class="bui-page-header__meta-item">
          {#if item.label}<span>{item.label}</span>{/if}
          <strong>{item.value}</strong>
        </span>
      {/each}
    </div>
  {/if}
</header>
