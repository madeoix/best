<script>
  import '$lib/styles/beacon-foundation.css';
  import StatusBadge from './StatusBadge.svelte';

  let {
    eyebrow = '',
    title,
    description = '',
    imageSrc = '',
    imageAlt = '',
    mediaLabel = 'No media available',
    status = null,
    metadata = [],
    headingLevel = 1,
    class: className = '',
    media,
    actions,
    children
  } = $props();
</script>

<section class={`bui-entity-hero ${className}`} data-beacon-entity-hero>
  <div class="bui-entity-hero__media">
    {#if media}
      {@render media()}
    {:else if imageSrc}
      <img src={imageSrc} alt={imageAlt} />
    {:else}
      <div class="bui-entity-hero__media-placeholder">{mediaLabel}</div>
    {/if}
  </div>

  <div class="bui-entity-hero__body">
    <div class="bui-entity-hero__heading">
      {#if eyebrow}<p class="bui-eyebrow">{eyebrow}</p>{/if}
      <div class="bui-entity-hero__title-row">
        {#if headingLevel === 2}
          <h2>{title}</h2>
        {:else}
          <h1>{title}</h1>
        {/if}

        {#if status?.label}
          <StatusBadge label={status.label} tone={status.tone ?? 'neutral'} />
        {/if}
      </div>
      {#if description}<p class="bui-entity-hero__description">{description}</p>{/if}
    </div>

    {#if metadata.length}
      <div class="bui-entity-hero__metadata" aria-label="Entity summary">
        {#each metadata as item}
          <div class="bui-entity-hero__metric">
            <span>{item.label}</span>
            <strong title={item.value}>{item.value}</strong>
          </div>
        {/each}
      </div>
    {/if}

    {#if children}{@render children()}{/if}

    {#if actions}
      <div class="bui-entity-hero__actions">
        {@render actions()}
      </div>
    {/if}
  </div>
</section>
