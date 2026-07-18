<script>
  import '$lib/styles/beacon-foundation.css';

  let {
    layout = 'public',
    navigation = [],
    currentPath = '',
    brand = 'Beacon',
    product = 'Smallverse',
    brandHref = '/',
    status = null,
    mainId = 'beacon-main',
    contentWidth = 'wide',
    class: className = '',
    brandMark,
    actions,
    sidebarFooter,
    children
  } = $props();

  let navigationGroups = $derived.by(() => {
    if (navigation.some((entry) => Array.isArray(entry?.items))) {
      return navigation;
    }

    return [{ label: null, items: navigation }];
  });

  // Public navigation is a flat list with an optional nested Tools entry.
  // The previous grouping helper treated the presence of that one nested
  // entry as proof that *every* item was a group, which silently removed
  // Search, Catalog and Spaces from the desktop navigation.
  let publicNavigation = $derived(
    layout === 'operations'
      ? navigationGroups.flatMap((group) => group.items ?? [])
      : navigation
  );

  function isCurrent(item) {
    if (typeof item?.active === 'boolean') return item.active;
    return Boolean(currentPath && item?.href && currentPath === item.href);
  }
</script>

<div
  class={`beacon-foundation bui-shell bui-shell--${layout} ${className}`}
  data-beacon-shell
  data-layout={layout}
>
  <a class="bui-shell__skip-link" href={`#${mainId}`}>Skip to content</a>

  {#if layout === 'operations'}
    <aside class="bui-shell__sidebar" aria-label="Operations navigation">
      <div class="bui-shell__sidebar-header">
        <a class="bui-shell__brand" href={brandHref} aria-label={`${brand} ${product}`}>
          <span class="bui-shell__brand-mark" aria-hidden="true">
            {#if brandMark}
              {@render brandMark()}
            {:else}
              BE
            {/if}
          </span>
          <span class="bui-shell__brand-copy">
            <strong>{brand}</strong>
            <span>{product}</span>
          </span>
        </a>

        {#if status?.label}
          <div class="bui-shell__status" data-tone={status.tone ?? 'success'}>
            <span class="bui-shell__status-dot" aria-hidden="true"></span>
            <span>{status.label}</span>
          </div>
        {/if}
      </div>

      <nav class="bui-shell__sidebar-nav" aria-label="Operations sections">
        {#each navigationGroups as group}
          <div class="bui-shell__nav-group">
            {#if group.label}
              <p class="bui-shell__nav-label">{group.label}</p>
            {/if}

            {#each group.items ?? [] as item}
              {#if item.disabled}
                <span class="bui-shell__ops-link" aria-disabled="true">
                  <span class="bui-shell__ops-link-copy">
                    <strong>{item.label}</strong>
                    {#if item.description}<span>{item.description}</span>{/if}
                  </span>
                  {#if item.badge !== undefined}
                    <span class="bui-shell__nav-badge">{item.badge}</span>
                  {/if}
                </span>
              {:else}
                <a
                  class="bui-shell__ops-link"
                  href={item.href}
                  aria-current={isCurrent(item) ? 'page' : undefined}
                >
                  <span class="bui-shell__ops-link-copy">
                    <strong>{item.label}</strong>
                    {#if item.description}<span>{item.description}</span>{/if}
                  </span>
                  {#if item.badge !== undefined}
                    <span class="bui-shell__nav-badge">{item.badge}</span>
                  {/if}
                </a>
              {/if}
            {/each}
          </div>
        {/each}
      </nav>

      {#if sidebarFooter}
        <div class="bui-shell__sidebar-footer">
          {@render sidebarFooter()}
        </div>
      {/if}
    </aside>
  {:else}
    <header class="bui-shell__topbar">
      <a class="bui-shell__brand" href={brandHref} aria-label={`${brand} ${product}`}>
        <span class="bui-shell__brand-mark" aria-hidden="true">
          {#if brandMark}
            {@render brandMark()}
          {:else}
            BE
          {/if}
        </span>
        <span class="bui-shell__brand-copy">
          <strong>{brand}</strong>
          <span>{product}</span>
        </span>
      </a>

      <nav class="bui-shell__public-nav" aria-label="Primary navigation">
        {#each publicNavigation as item}
          {#if Array.isArray(item?.items)}
            <details class="bui-shell__tools-menu" class:active={isCurrent(item)}>
              <summary class="bui-shell__public-link">
                <span>{item.label}</span>
                <span class="bui-shell__tools-caret" aria-hidden="true">⌄</span>
              </summary>
              <div class="bui-shell__tools-popover">
                {#each item.items as tool}
                  <a href={tool.href} aria-current={isCurrent(tool) ? 'page' : undefined}>
                    <span>
                      <strong>{tool.label}</strong>
                      {#if tool.description}<small>{tool.description}</small>{/if}
                    </span>
                    <span aria-hidden="true">→</span>
                  </a>
                {/each}
              </div>
            </details>
          {:else if item.disabled}
            <span class="bui-shell__public-link" aria-disabled="true">{item.label}</span>
          {:else}
            <a
              class="bui-shell__public-link"
              href={item.href}
              aria-current={isCurrent(item) ? 'page' : undefined}
            >
              <span>{item.label}</span>
              {#if item.badge !== undefined}
                <span class="bui-shell__nav-badge">{item.badge}</span>
              {/if}
            </a>
          {/if}
        {/each}
      </nav>

      {#if actions || status?.label}
        <div class="bui-shell__actions">
          {#if status?.label}
            <div class="bui-shell__status" data-tone={status.tone ?? 'success'}>
              <span class="bui-shell__status-dot" aria-hidden="true"></span>
              <span>{status.label}</span>
            </div>
          {/if}
          {#if actions}{@render actions()}{/if}
        </div>
      {/if}
    </header>
  {/if}

  <main class="bui-shell__main" id={mainId} tabindex="-1">
    <div class="bui-shell__content" data-width={contentWidth}>
      {@render children?.()}
    </div>
  </main>
</div>
