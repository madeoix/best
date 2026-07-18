<script>
  import '$lib/styles/beacon-foundation.css';
  import StatusBadge from './StatusBadge.svelte';

  let {
    items = [],
    density = 'default',
    label = 'Data list',
    emptyTitle = 'No records',
    emptyDescription = 'There is no data to show yet.',
    class: className = '',
    onSelect = undefined,
    row,
    leading,
    trailing,
    empty
  } = $props();

  function selectItem(item, index) {
    if (!item.disabled) onSelect?.(item, index);
  }
</script>

<div
  class={`bui-data-list ${className}`}
  data-density={density}
  data-beacon-data-list
  role="list"
  aria-label={label}
>
  {#if items.length}
    {#each items as item, index}
      <div class="bui-data-list__item" role="listitem">
        {#if row}
          <div class="bui-data-list__row">
            {@render row(item, index)}
          </div>
        {:else if item.href && !item.disabled}
          <a
            class="bui-data-list__row"
            href={item.href}
            target={item.target}
            rel={item.target === '_blank' ? 'noreferrer' : undefined}
          >
            <div class="bui-data-list__primary">
              {#if leading || item.imageSrc || item.initials}
                <span class="bui-data-list__leading" aria-hidden="true">
                  {#if leading}
                    {@render leading(item, index)}
                  {:else if item.imageSrc}
                    <img src={item.imageSrc} alt="" />
                  {:else}
                    {item.initials}
                  {/if}
                </span>
              {/if}
              <span class="bui-data-list__copy">
                <span class="bui-data-list__label">{item.label}</span>
                {#if item.description}
                  <span class="bui-data-list__description">{item.description}</span>
                {/if}
              </span>
            </div>
            <span class="bui-data-list__trailing">
              {#if trailing}
                {@render trailing(item, index)}
              {:else}
                {#if item.value}<span class="bui-data-list__value">{item.value}</span>{/if}
                {#if item.meta}<span class="bui-data-list__meta">{item.meta}</span>{/if}
                {#if item.status?.label}
                  <StatusBadge label={item.status.label} tone={item.status.tone ?? 'neutral'} />
                {/if}
              {/if}
            </span>
          </a>
        {:else if onSelect}
          <button
            class="bui-data-list__row"
            type="button"
            disabled={item.disabled}
            aria-disabled={item.disabled ? 'true' : undefined}
            onclick={() => selectItem(item, index)}
          >
            <div class="bui-data-list__primary">
              {#if leading || item.imageSrc || item.initials}
                <span class="bui-data-list__leading" aria-hidden="true">
                  {#if leading}
                    {@render leading(item, index)}
                  {:else if item.imageSrc}
                    <img src={item.imageSrc} alt="" />
                  {:else}
                    {item.initials}
                  {/if}
                </span>
              {/if}
              <span class="bui-data-list__copy">
                <span class="bui-data-list__label">{item.label}</span>
                {#if item.description}
                  <span class="bui-data-list__description">{item.description}</span>
                {/if}
              </span>
            </div>
            <span class="bui-data-list__trailing">
              {#if trailing}
                {@render trailing(item, index)}
              {:else}
                {#if item.value}<span class="bui-data-list__value">{item.value}</span>{/if}
                {#if item.meta}<span class="bui-data-list__meta">{item.meta}</span>{/if}
                {#if item.status?.label}
                  <StatusBadge label={item.status.label} tone={item.status.tone ?? 'neutral'} />
                {/if}
              {/if}
            </span>
          </button>
        {:else}
          <div
            class="bui-data-list__row"
            aria-disabled={item.disabled ? 'true' : undefined}
          >
            <div class="bui-data-list__primary">
              {#if leading || item.imageSrc || item.initials}
                <span class="bui-data-list__leading" aria-hidden="true">
                  {#if leading}
                    {@render leading(item, index)}
                  {:else if item.imageSrc}
                    <img src={item.imageSrc} alt="" />
                  {:else}
                    {item.initials}
                  {/if}
                </span>
              {/if}
              <span class="bui-data-list__copy">
                <span class="bui-data-list__label">{item.label}</span>
                {#if item.description}
                  <span class="bui-data-list__description">{item.description}</span>
                {/if}
              </span>
            </div>
            <span class="bui-data-list__trailing">
              {#if trailing}
                {@render trailing(item, index)}
              {:else}
                {#if item.value}<span class="bui-data-list__value">{item.value}</span>{/if}
                {#if item.meta}<span class="bui-data-list__meta">{item.meta}</span>{/if}
                {#if item.status?.label}
                  <StatusBadge label={item.status.label} tone={item.status.tone ?? 'neutral'} />
                {/if}
              {/if}
            </span>
          </div>
        {/if}
      </div>
    {/each}
  {:else}
    <div class="bui-data-list__empty">
      {#if empty}
        {@render empty()}
      {:else}
        <strong>{emptyTitle}</strong>
        <p>{emptyDescription}</p>
      {/if}
    </div>
  {/if}
</div>
