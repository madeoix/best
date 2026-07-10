<script>
  import { onMount } from 'svelte';

  export let avatarId;

  let manifest = null;
  let loading = true;
  let error = null;

  let frame = 0;
  let playing = true;
  let dragStartX = 0;
  let dragging = false;

  $: oracleBase = avatarId ? `/avatar-oracles/${avatarId}` : '';
  $: snapshots = manifest?.snapshots ?? [];
  $: frames = snapshots.length
    ? snapshots.map((s) => s.png)
    : manifest?.latest_snapshot
      ? [manifest.latest_snapshot]
      : [`${oracleBase}/flash-saveAvatarSnapshot.png`];

  $: currentFrame = frames.length ? frames[((frame % frames.length) + frames.length) % frames.length] : null;
  $: fullBody = manifest?.latest_full_body ?? `${oracleBase}/flash-full-body.png`;
  $: thumb = manifest?.latest_thumb ?? `${oracleBase}/flash-thumb.png`;
  $: latestCapture = snapshots[0]?.capture_file ?? manifest?.saveAvatar?.[0]?.capture_file ?? 'unknown capture';

  async function loadManifest() {
    loading = true;
    error = null;

    try {
      const res = await fetch(`${oracleBase}/snapshot-manifest.json?ts=${Date.now()}`);
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      manifest = await res.json();
    } catch (e) {
      error = String(e?.message ?? e);
      manifest = {
        avatar_id: avatarId,
        source: 'fallback direct oracle paths',
        latest_snapshot: `${oracleBase}/flash-saveAvatarSnapshot.png`,
        latest_full_body: `${oracleBase}/flash-full-body.png`,
        latest_thumb: `${oracleBase}/flash-thumb.png`,
        snapshots: [],
        saveAvatar: []
      };
    } finally {
      loading = false;
    }
  }

  function nextFrame(delta = 1) {
    if (!frames.length) return;
    frame = (frame + delta + frames.length) % frames.length;
  }

  function onPointerDown(event) {
    dragging = true;
    playing = false;
    dragStartX = event.clientX;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!dragging) return;
    const dx = event.clientX - dragStartX;
    if (Math.abs(dx) >= 14) {
      nextFrame(dx > 0 ? 1 : -1);
      dragStartX = event.clientX;
    }
  }

  function onPointerUp() {
    dragging = false;
  }

  onMount(() => {
    loadManifest();

    const timer = setInterval(() => {
      if (playing && frames.length > 1) nextFrame(1);
    }, 900);

    return () => clearInterval(timer);
  });
</script>

<section class="stage-shell">
  <div class="stage-header">
    <div>
      <div class="eyebrow">Verified Flash Render</div>
      <h2>SmallVerse Avatar Oracle</h2>
    </div>

    <button class="refresh" on:click={loadManifest}>
      refresh
    </button>
  </div>

  <div
    class="render-stage"
    role="application"
    tabindex="0"
    class:dragging
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
  >
    <div class="orbital orbital-a"></div>
    <div class="orbital orbital-b"></div>
    <div class="orbital orbital-c"></div>

    {#if currentFrame}
      <img class="avatar-main" src={currentFrame} alt="Flash-rendered avatar snapshot" draggable="false" />
    {:else}
      <div class="missing">no render</div>
    {/if}

    <div class="floor"></div>
  </div>

  <div class="controls">
    <button on:click={() => nextFrame(-1)}>prev</button>
    <button on:click={() => (playing = !playing)}>{playing ? 'pause' : 'play'}</button>
    <button on:click={() => nextFrame(1)}>next</button>
  </div>

  <div class="evidence-grid">
    <div>
      <span>avatar id</span>
      <b>{avatarId}</b>
    </div>
    <div>
      <span>source</span>
      <b>{manifest?.source ?? 'loading'}</b>
    </div>
    <div>
      <span>frames</span>
      <b>{frames.length}</b>
    </div>
    <div>
      <span>latest capture</span>
      <b>{latestCapture}</b>
    </div>
  </div>

  <div class="asset-strip">
    <a href={`${oracleBase}/flash-saveAvatarSnapshot.png`} target="_blank">latest snapshot</a>
    <a href={fullBody} target="_blank">full body</a>
    <a href={thumb} target="_blank">thumb</a>
    <a href={`${oracleBase}/snapshot-manifest.json`} target="_blank">manifest</a>
    <a href={`${oracleBase}/config.xml`} target="_blank">config</a>
  </div>

  {#if loading}
    <p class="note">loading oracle manifest…</p>
  {:else if error}
    <p class="note">manifest fallback active: {error}</p>
  {/if}
</section>

<style>
  .stage-shell {
    width: min(960px, calc(100vw - 32px));
    margin: 32px auto;
    color: #eef3ff;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .stage-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: end;
    margin-bottom: 18px;
  }

  .eyebrow {
    color: #89d8ff;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 12px;
    font-weight: 800;
  }

  h2 {
    margin: 4px 0 0;
    font-size: clamp(28px, 5vw, 52px);
    line-height: 0.95;
  }

  .refresh,
  .controls button {
    border: 1px solid rgba(137, 216, 255, 0.35);
    color: #eaf8ff;
    background: rgba(8, 20, 38, 0.82);
    border-radius: 999px;
    padding: 10px 14px;
    cursor: pointer;
  }

  .render-stage {
    position: relative;
    height: min(620px, 70vh);
    min-height: 420px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid rgba(137, 216, 255, 0.2);
    border-radius: 28px;
    background:
      radial-gradient(circle at 50% 52%, rgba(48, 180, 255, 0.24), transparent 22%),
      radial-gradient(circle at 50% 100%, rgba(98, 74, 255, 0.25), transparent 35%),
      linear-gradient(180deg, #071020 0%, #0b1222 55%, #05070e 100%);
    box-shadow:
      0 0 80px rgba(0, 195, 255, 0.16),
      inset 0 0 90px rgba(100, 180, 255, 0.07);
    user-select: none;
  }

  .render-stage.dragging {
    cursor: grabbing;
  }

  .avatar-main {
    position: relative;
    z-index: 4;
    width: min(300px, 52vw);
    image-rendering: auto;
    filter:
      drop-shadow(0 0 12px rgba(126, 218, 255, 0.55))
      drop-shadow(0 30px 34px rgba(0, 0, 0, 0.72));
    transform: translateY(-12px);
  }

  .orbital {
    position: absolute;
    z-index: 2;
    width: 360px;
    height: 360px;
    border-radius: 999px;
    border: 2px solid rgba(110, 210, 255, 0.28);
    box-shadow: 0 0 28px rgba(93, 200, 255, 0.18);
  }

  .orbital-a {
    animation: spinA 7s linear infinite;
    transform: rotateX(68deg) rotateZ(0deg);
  }

  .orbital-b {
    width: 420px;
    height: 420px;
    border-color: rgba(187, 150, 255, 0.24);
    animation: spinB 10s linear infinite;
    transform: rotateX(58deg) rotateY(24deg);
  }

  .orbital-c {
    width: 250px;
    height: 250px;
    border-color: rgba(255, 255, 255, 0.18);
    animation: spinC 5s linear infinite;
    transform: rotateX(75deg) rotateY(-28deg);
  }

  .floor {
    position: absolute;
    z-index: 1;
    bottom: 90px;
    width: 360px;
    height: 88px;
    border-radius: 50%;
    background: radial-gradient(ellipse, rgba(87, 210, 255, 0.24), transparent 70%);
    filter: blur(1px);
  }

  .missing {
    color: #ffb3b3;
    z-index: 5;
  }

  .controls {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin: 16px 0;
  }

  .evidence-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-top: 18px;
  }

  .evidence-grid > div {
    border: 1px solid rgba(137, 216, 255, 0.16);
    border-radius: 16px;
    padding: 12px;
    background: rgba(8, 20, 38, 0.72);
    min-width: 0;
  }

  .evidence-grid span {
    display: block;
    color: #83a7bd;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: 6px;
  }

  .evidence-grid b {
    display: block;
    overflow-wrap: anywhere;
    font-size: 13px;
  }

  .asset-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 14px;
  }

  .asset-strip a {
    color: #aee8ff;
    border: 1px solid rgba(137, 216, 255, 0.2);
    border-radius: 999px;
    padding: 8px 12px;
    text-decoration: none;
    background: rgba(8, 20, 38, 0.55);
  }

  .note {
    color: #8ea9bc;
    font-size: 13px;
  }

  @keyframes spinA {
    from { transform: rotateX(68deg) rotateZ(0deg); }
    to { transform: rotateX(68deg) rotateZ(360deg); }
  }

  @keyframes spinB {
    from { transform: rotateX(58deg) rotateY(24deg) rotateZ(360deg); }
    to { transform: rotateX(58deg) rotateY(24deg) rotateZ(0deg); }
  }

  @keyframes spinC {
    from { transform: rotateX(75deg) rotateY(-28deg) rotateZ(0deg); }
    to { transform: rotateX(75deg) rotateY(-28deg) rotateZ(-360deg); }
  }

  @media (max-width: 760px) {
    .evidence-grid {
      grid-template-columns: 1fr;
    }

    .render-stage {
      min-height: 360px;
    }
  }
</style>
