<script>
  import { page } from '$app/stores';

  const navigation = [
    { href: '/ops', label: 'Overview', exact: true },
    { href: '/ops/live-avatars', label: 'Live avatars' }
  ];

  function isCurrent(item) {
    return item.exact
      ? $page.url.pathname === item.href
      : $page.url.pathname.startsWith(item.href);
  }
</script>

<div class="ops-shell">
  <aside class="ops-sidebar">
    <a class="ops-wordmark" href="/ops" aria-label="Observatory overview">
      <span>BEACON</span>
      <strong>Observatory</strong>
    </a>

    <div class="ops-private-label">
      <span aria-hidden="true"></span>
      Operator access
    </div>

    <nav aria-label="Observatory">
      {#each navigation as item}
        <a class:active={isCurrent(item)} href={item.href} aria-current={isCurrent(item) ? 'page' : undefined}>
          {item.label}
        </a>
      {/each}
    </nav>

    <a class="ops-exit" href="/">Return to public Beacon</a>
  </aside>

  <main class="ops-content">
    <slot />
  </main>
</div>

<style>
  .ops-shell {
    --ops-bg: #080b0f;
    --ops-panel: #0d1218;
    --ops-panel-raised: #111820;
    --ops-border: rgba(190, 213, 220, 0.12);
    --ops-muted: #81909d;
    --ops-copy: #d9e2e8;
    --ops-accent: #66c7c5;
    min-height: 100vh;
    display: grid;
    grid-template-columns: 224px minmax(0, 1fr);
    color: var(--ops-copy);
    background:
      radial-gradient(circle at 72% -20%, rgba(58, 121, 127, 0.13), transparent 42%),
      var(--ops-bg);
  }

  .ops-sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 24px 16px 18px;
    border-right: 1px solid var(--ops-border);
    background: rgba(7, 10, 14, 0.94);
  }

  .ops-wordmark {
    display: grid;
    gap: 3px;
    padding: 0 10px;
    color: inherit;
    text-decoration: none;
  }

  .ops-wordmark span,
  .ops-private-label {
    color: var(--ops-accent);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .ops-wordmark strong {
    font-size: 15px;
    font-weight: 650;
  }

  .ops-private-label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 25px 10px 12px;
    color: #82949f;
    letter-spacing: 0.12em;
  }

  .ops-private-label span {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #5cc596;
    box-shadow: 0 0 0 3px rgba(92, 197, 150, 0.09);
  }

  nav {
    display: grid;
    gap: 4px;
  }

  nav a,
  .ops-exit {
    border-radius: 7px;
    color: #93a0aa;
    font-size: 13px;
    font-weight: 550;
    padding: 9px 10px;
    text-decoration: none;
  }

  nav a:hover,
  nav a.active {
    color: #e8f1f4;
    background: rgba(103, 178, 181, 0.11);
  }

  nav a.active {
    box-shadow: inset 2px 0 var(--ops-accent);
  }

  .ops-exit {
    margin-top: auto;
    border: 1px solid var(--ops-border);
    text-align: center;
  }

  .ops-exit:hover {
    color: white;
    border-color: rgba(102, 199, 197, 0.35);
  }

  .ops-content {
    min-width: 0;
    padding: 38px clamp(24px, 4vw, 58px) 70px;
  }

  @media (max-width: 760px) {
    .ops-shell {
      grid-template-columns: 1fr;
    }

    .ops-sidebar {
      position: static;
      height: auto;
      padding: 16px;
      border-right: 0;
      border-bottom: 1px solid var(--ops-border);
    }

    .ops-private-label {
      display: none;
    }

    nav {
      display: flex;
      margin-top: 14px;
    }

    .ops-exit {
      position: absolute;
      right: 16px;
      top: 17px;
      padding: 7px 9px;
      font-size: 11px;
    }

    .ops-content {
      padding: 26px 16px 50px;
    }
  }
</style>
