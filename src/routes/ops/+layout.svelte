<script>
  import { onMount, setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import OpsShell from '$lib/components/ops/OpsShell.svelte';
  import { OPS_CONTEXT_KEY } from '$lib/ops/context.js';
  import {
    getDesktopOperatorOverview,
    isDesktopRuntime
  } from '$lib/runtime/desktopBridge.js';

  const access = writable({
    state: 'checking',
    overview: null,
    error: ''
  });
  let accessState = 'checking';
  let accessError = '';
  let accessRequest = 0;

  function publishAccess(value) {
    accessState = value.state;
    accessError = value.error || '';
    access.set(value);
  }

  function operatorOverviewWithTimeout(timeoutMs = 8000) {
    let timeout;
    return Promise.race([
      getDesktopOperatorOverview(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(
            'The private operator service did not respond. Keep the local runtime running, then try again.'
          ));
        }, timeoutMs);
      })
    ]).finally(() => clearTimeout(timeout));
  }

  async function refreshAccess() {
    const request = ++accessRequest;
    if (!isDesktopRuntime()) {
      publishAccess({
        state: 'unavailable',
        overview: null,
        error: 'Observatory is available only inside the Smallverse desktop application.'
      });
      return;
    }

    publishAccess({ state: 'checking', overview: null, error: '' });

    try {
      const response = await operatorOverviewWithTimeout();
      const overview = response?.data ?? response;

      if (request !== accessRequest) return;

      if (!overview || typeof overview !== 'object') {
        throw new Error('The operator service returned an invalid overview.');
      }

      publishAccess({ state: 'authorized', overview, error: '' });
    } catch (error) {
      if (request !== accessRequest) return;
      publishAccess({
        state: 'unavailable',
        overview: null,
        error: error?.message || 'Operator authorization could not be verified.'
      });
    }
  }

  setContext(OPS_CONTEXT_KEY, { access, refreshAccess });
  onMount(refreshAccess);
</script>

{#if accessState === 'authorized'}
  <OpsShell>
    <slot />
  </OpsShell>
{:else}
  <main class="ops-lock">
    <section>
      <p>PRIVATE OPERATOR SURFACE</p>
      {#if accessState === 'checking'}
        <h1>Verifying Observatory access</h1>
        <span>Asking the desktop runtime to authenticate with the private operator service.</span>
      {:else}
        <h1>Observatory unavailable</h1>
        <span>{accessError}</span>
        <small>
          Access fails closed. Open this route in Smallverse Desktop with its operator service and
          token configured; credentials are never entered into or exposed to this page.
        </small>
        <div>
          <button type="button" on:click={refreshAccess}>Try again</button>
          <a href="/">Return to Beacon</a>
        </div>
      {/if}
    </section>
  </main>
{/if}

<style>
  .ops-lock {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    color: #dbe6eb;
    background:
      radial-gradient(circle at 50% 0%, rgba(48, 115, 121, 0.14), transparent 45%),
      #070a0e;
  }

  .ops-lock section {
    width: min(100%, 560px);
    padding: 34px;
    border: 1px solid rgba(190, 213, 220, 0.14);
    border-radius: 10px;
    background: #0d1218;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
  }

  .ops-lock p {
    margin: 0 0 13px;
    color: #66c7c5;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.17em;
  }

  .ops-lock h1 {
    margin: 0 0 12px;
    color: #f0f5f7;
    font-size: clamp(25px, 5vw, 36px);
    font-weight: 580;
    letter-spacing: -0.035em;
  }

  .ops-lock span,
  .ops-lock small {
    display: block;
    color: #91a0aa;
    line-height: 1.6;
  }

  .ops-lock small {
    margin-top: 16px;
    color: #687984;
  }

  .ops-lock div {
    display: flex;
    gap: 10px;
    margin-top: 25px;
  }

  .ops-lock button,
  .ops-lock a {
    padding: 9px 13px;
    border: 1px solid rgba(102, 199, 197, 0.26);
    border-radius: 7px;
    color: #dce8eb;
    background: rgba(102, 199, 197, 0.08);
    font: inherit;
    font-size: 12px;
    text-decoration: none;
    cursor: pointer;
  }
</style>
