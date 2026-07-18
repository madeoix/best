<script>
  import '$lib/styles/beacon-foundation.css';

  let {
    eyebrow = '',
    title = '',
    description = '',
    tone = 'default',
    padding = 'default',
    headingLevel = 2,
    labelledBy = undefined,
    class: className = '',
    actions,
    children,
    footer
  } = $props();

  const componentId = $props.id();
  let generatedHeadingId = $derived(
    title ? (labelledBy ?? `${componentId}-heading`) : undefined
  );
</script>

<section
  class={`bui-section-card ${className}`}
  data-tone={tone}
  data-beacon-section-card
  aria-labelledby={generatedHeadingId}
>
  {#if eyebrow || title || description || actions}
    <header class="bui-section-card__header">
      <div class="bui-section-card__header-copy">
        {#if eyebrow}<p class="bui-eyebrow">{eyebrow}</p>{/if}
        {#if title}
          {#if headingLevel === 3}
            <h3 id={generatedHeadingId}>{title}</h3>
          {:else}
            <h2 id={generatedHeadingId}>{title}</h2>
          {/if}
        {/if}
        {#if description}<p class="bui-section-card__description">{description}</p>{/if}
      </div>

      {#if actions}
        <div class="bui-section-card__actions">
          {@render actions()}
        </div>
      {/if}
    </header>
  {/if}

  <div class="bui-section-card__body" data-padding={padding}>
    {@render children?.()}
  </div>

  {#if footer}
    <footer class="bui-section-card__footer">
      {@render footer()}
    </footer>
  {/if}
</section>
