<script>
  import { onDestroy, onMount } from 'svelte';

  import SmallverseO3DRenderStage from './SmallverseO3DRenderStage.svelte';
  import { compileAvatarSpriteXml } from '$lib/avatar-renderer/avatarSpriteXmlCompiler.js';
  import {
    buildAvatarXmlBodyRig,
    FORWARD_AVATAR_ANGLE,
    SUPPORTED_AVATAR_ANGLES,
    SUPPORTED_AVATAR_ANIMATIONS
  } from '$lib/avatar-renderer/avatarXmlBodyCompositor.js';
  import {
    buildDifferenceImageData,
    getSpriteFrame,
    tintImageData
  } from '$lib/avatar-renderer/bodySpriteCompositor.js';

  export let avatarId;
  export let oracleUrl = null;
  export let mode = 'lab';

  let compositeCanvas;
  let differenceCanvas;
  let overlayCanvas;
  let headDataUrl = null;
  let headCaptureState = 'pending';
  let headCaptureWarning = '';
  let contract = null;
  let avatarConfigXml = null;
  let spriteModel = null;
  let rig = null;
  let status = 'loading avatar XML and render contract';
  let error = '';
  let warnings = [];
  let overlayOpacity = 0.5;
  let showHead = true;
  let selectedAnimation = 'Idle';
  let selectedAngle = FORWARD_AVATAR_ANGLE;
  let frameIndex = 0;
  let playing = true;
  let generation = 0;
  let playbackTimer = null;

  const imageCache = new Map();

  function angleLabel(angle) {
    const labels = {
      0: 'Right',
      45: 'Front-right',
      90: 'Front',
      135: 'Front-left',
      180: 'Left',
      225: 'Back-left',
      270: 'Back',
      315: 'Back-right'
    };

    return `${labels[angle] ?? 'View'} (${angle}°)`;
  }

  function loadImage(url) {
    if (!url) return Promise.reject(new Error('Image URL is missing'));
    if (imageCache.has(url)) return imageCache.get(url);

    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load ${url}`));
      image.src = url;
    });

    imageCache.set(url, promise);
    return promise;
  }

  async function measureDataUrlAlpha(dataUrl) {
    const image = await loadImage(dataUrl);
    const scratch = document.createElement('canvas');
    scratch.width = image.naturalWidth || image.width;
    scratch.height = image.naturalHeight || image.height;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, scratch.width, scratch.height).data;
    let nonTransparentPixels = 0;

    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] > 8) nonTransparentPixels += 1;
    }

    return nonTransparentPixels;
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;

    canvas.width = 128;
    canvas.height = 256;
    canvas.style.width = '256px';
    canvas.style.height = '512px';

    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
    context.clearRect(0, 0, 128, 256);

    return context;
  }

  function renderTintedFrame(target, image, layer) {
    const frame = getSpriteFrame(image, layer);
    const scratch = document.createElement('canvas');
    scratch.width = frame.width;
    scratch.height = frame.height;

    const scratchContext = scratch.getContext('2d', { willReadFrequently: true });
    scratchContext.drawImage(
      image,
      frame.sx,
      frame.sy,
      frame.width,
      frame.height,
      0,
      0,
      frame.width,
      frame.height
    );

    if (layer.tint) {
      const pixels = scratchContext.getImageData(0, 0, frame.width, frame.height);
      scratchContext.putImageData(tintImageData(pixels, layer.tint), 0, 0);
    }

    const flipHorizontal = Boolean(layer.flip?.horizontal);
    const flipVertical = Boolean(layer.flip?.vertical);

    target.save();
    target.globalAlpha = Number.isFinite(layer.alpha) ? layer.alpha : 1;
    target.globalCompositeOperation = layer.blendMode === 'normal'
      ? 'source-over'
      : (layer.blendMode || 'source-over');
    target.translate(
      layer.x + (flipHorizontal ? frame.width : 0),
      layer.y + (flipVertical ? frame.height : 0)
    );
    target.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
    target.drawImage(scratch, 0, 0);
    target.restore();
  }

  function clearPlaybackTimer() {
    if (playbackTimer) clearTimeout(playbackTimer);
    playbackTimer = null;
  }

  function schedulePlayback() {
    clearPlaybackTimer();
    if (!playing || !rig || rig.animation.frameCount <= 1) return;

    playbackTimer = setTimeout(() => {
      frameIndex = (frameIndex + 1) % rig.animation.frameCount;
      rebuildRig();
    }, Math.max(50, 1000 / rig.animation.framerate));
  }

  async function drawOracleComparison(currentGeneration) {
    if (!rig?.oracleComparable || !oracleUrl) return false;

    const oracle = await loadImage(oracleUrl);
    if (currentGeneration !== generation) return false;

    const oracleScratch = document.createElement('canvas');
    oracleScratch.width = 128;
    oracleScratch.height = 256;
    const oracleContext = oracleScratch.getContext('2d', { willReadFrequently: true });
    oracleContext.clearRect(0, 0, 128, 256);
    oracleContext.drawImage(oracle, 0, 0, 128, 256);

    const compositePixels = compositeCanvas
      .getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, compositeCanvas.width, compositeCanvas.height);

    const oracleScaled = document.createElement('canvas');
    oracleScaled.width = compositeCanvas.width;
    oracleScaled.height = compositeCanvas.height;
    const oracleScaledContext = oracleScaled.getContext('2d', { willReadFrequently: true });
    oracleScaledContext.drawImage(oracleScratch, 0, 0, oracleScaled.width, oracleScaled.height);
    const oraclePixels = oracleScaledContext.getImageData(
      0,
      0,
      oracleScaled.width,
      oracleScaled.height
    );

    const difference = buildDifferenceImageData(compositePixels, oraclePixels);
    differenceCanvas
      .getContext('2d', { willReadFrequently: true })
      .putImageData(difference, 0, 0);

    const overlayContext = overlayCanvas.getContext('2d');
    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayContext.globalAlpha = 1;
    overlayContext.drawImage(compositeCanvas, 0, 0);
    overlayContext.globalAlpha = overlayOpacity;
    overlayContext.drawImage(oracleScaled, 0, 0);
    overlayContext.globalAlpha = 1;

    return true;
  }

  async function compose() {
    if (!contract || !rig || !compositeCanvas) return;

    const currentGeneration = ++generation;
    status = `rendering ${rig.animation.id} · ${rig.animation.angle}° · frame ${rig.animation.frameIndex + 1}/${rig.animation.frameCount}`;
    warnings = [
      ...rig.warnings,
      ...(headCaptureWarning ? [headCaptureWarning] : [])
    ];

    const context = prepareCanvas(compositeCanvas);
    prepareCanvas(differenceCanvas);
    prepareCanvas(overlayCanvas);

    for (const layer of rig.layers) {
      // Keep avatar.xml's base head as the deterministic fallback. A captured
      // O3D reconstruction replaces it only in the calibrated forward view.
      if (layer.nodeId === 'Head' && rig.head.supported && showHead && headDataUrl) {
        continue;
      }

      try {
        const image = await loadImage(layer.url);
        if (currentGeneration !== generation) return;
        renderTintedFrame(context, image, layer);
      } catch (layerError) {
        warnings = [...warnings, `${layer.id}: ${layerError.message}`];
      }
    }

    if (showHead && rig.head.supported && headDataUrl) {
      try {
        const head = await loadImage(headDataUrl);
        if (currentGeneration !== generation) return;
        context.drawImage(head, rig.head.x, rig.head.y, rig.head.width, rig.head.height);
      } catch (headError) {
        warnings = [...warnings, `reconstructed head: ${headError.message}`];
      }
    }

    try {
      const compared = await drawOracleComparison(currentGeneration);
      if (currentGeneration !== generation) return;

      if (compared) {
        status = headDataUrl
          ? 'authored XML forward idle + reconstructed head; oracle comparison active'
          : (headCaptureState === 'pending'
              ? 'authored XML forward idle + base head; waiting for reconstructed head'
              : 'authored XML forward idle + base head; oracle comparison active');
      } else if (rig.head.supported) {
        status = headDataUrl
          ? `authored XML ${rig.animation.id} rendered with reconstructed forward head`
          : `authored XML ${rig.animation.id} rendered with base head atlas`;
      } else {
        status = `authored XML ${rig.animation.id} rendered at ${rig.animation.angle}° with base head atlas`;
      }
    } catch (oracleError) {
      warnings = [...warnings, `oracle: ${oracleError.message}`];
      status = 'XML body state rendered without oracle comparison';
    }
  }

  function rebuildRig() {
    if (!contract || !spriteModel) return;

    try {
      rig = buildAvatarXmlBodyRig(spriteModel, {
        animationId: selectedAnimation,
        angle: Number(selectedAngle),
        frameIndex,
        gender: contract.gender,
        selectedOptions: contract.selected_options,
        configXml: avatarConfigXml
      });
      frameIndex = rig.animation.frameIndex;
      compose();
      schedulePlayback();
    } catch (buildError) {
      error = buildError?.message ?? String(buildError);
      status = 'XML animation plan failed';
      clearPlaybackTimer();
    }
  }

  function selectAnimation() {
    frameIndex = 0;
    rebuildRig();
  }

  function selectAngle() {
    frameIndex = 0;
    rebuildRig();
  }

  function togglePlayback() {
    playing = !playing;
    schedulePlayback();
  }

  function stepFrame(direction) {
    if (!rig) return;
    playing = false;
    frameIndex = (
      frameIndex + direction + rig.animation.frameCount
    ) % rig.animation.frameCount;
    rebuildRig();
  }

  async function handleHeadCapture(event) {
    const detail = event.detail ?? {};
    const dataUrl = detail.dataUrl ?? null;

    try {
      const measuredPixels = Number.isFinite(Number(detail.nonTransparentPixels))
        ? Number(detail.nonTransparentPixels)
        : await measureDataUrlAlpha(dataUrl);

      if (!dataUrl || measuredPixels < 32) {
        headDataUrl = null;
        headCaptureState = 'unavailable';
        headCaptureWarning = measuredPixels === 0
          ? 'O3D head capture was transparent; authored avatar.xml head retained'
          : `O3D head capture contained only ${measuredPixels} opaque pixels; authored avatar.xml head retained`;
      } else {
        headDataUrl = dataUrl;
        headCaptureState = 'usable';
        headCaptureWarning = '';
      }
    } catch (captureError) {
      headDataUrl = null;
      headCaptureState = 'unavailable';
      headCaptureWarning = `O3D head capture could not be validated (${captureError?.message ?? captureError}); authored avatar.xml head retained`;
    }

    await compose();
  }

  async function loadRendererInputs() {
    if (!avatarId) return;

    error = '';
    status = 'loading avatar XML and render contract';
    headDataUrl = null;
    headCaptureState = 'pending';
    headCaptureWarning = '';

    try {
      const [contractResponse, avatarXmlResponse, avatarConfigResponse] = await Promise.all([
        fetch(`/avatar-renders/${encodeURIComponent(avatarId)}/render-contract.v4.json`, {
          cache: 'no-store'
        }),
        fetch('/avatar-assets/avatars/body/base/unisex/avatar.xml', {
          cache: 'force-cache'
        }),
        fetch(`/avatar-calibration/${encodeURIComponent(avatarId)}/live-config.xml`, {
          cache: 'no-store'
        })
      ]);

      if (!contractResponse.ok) {
        throw new Error(`render-contract.v4.json returned ${contractResponse.status}`);
      }
      if (!avatarXmlResponse.ok) {
        throw new Error(`avatar.xml returned ${avatarXmlResponse.status}`);
      }

      const [loadedContract, avatarXml, loadedAvatarConfig] = await Promise.all([
        contractResponse.json(),
        avatarXmlResponse.text(),
        avatarConfigResponse.ok ? avatarConfigResponse.text() : Promise.resolve(null)
      ]);

      contract = loadedContract;
      avatarConfigXml = loadedAvatarConfig;
      spriteModel = compileAvatarSpriteXml(avatarXml);
      frameIndex = 0;
      rebuildRig();
    } catch (loadError) {
      error = loadError?.message ?? String(loadError);
      status = 'renderer inputs failed';
    }
  }

  onMount(() => {
    loadRendererInputs();
  });

  onDestroy(() => {
    clearPlaybackTimer();
    generation += 1;
  });
</script>

<section class:public-stage={mode === 'public'} class="compositor-shell">
  {#if mode !== 'public'}<header>
    <div>
      <span>Recovered XML animation compositor</span>
      <h2>Avatar body state reconstruction</h2>
      <p>
        The recovered avatar.xml selects node frames, sprite cells, mirroring, offsets, and timing. Captured avatar config selects the authentic default jumpsuit; external clothing is rendered only when its authored item fragment and sprite sheets are available.
      </p>
    </div>
    <strong>{status}</strong>
  </header>{/if}

  {#if error}
    <div class="error">{error}</div>
  {:else}
    <SmallverseO3DRenderStage
      {avatarId}
      captureOnly={true}
      captureWidth={192}
      captureHeight={192}
      on:capture={handleHeadCapture}
    />

    <div class="state-controls" aria-label="Avatar animation controls">
      <label>
        <span>Animation</span>
        <select bind:value={selectedAnimation} on:change={selectAnimation}>
          {#each SUPPORTED_AVATAR_ANIMATIONS as animation}
            <option value={animation.id}>{animation.label}</option>
          {/each}
        </select>
      </label>

      <label>
        <span>View</span>
        <select bind:value={selectedAngle} on:change={selectAngle}>
          {#each SUPPORTED_AVATAR_ANGLES as angle}
            <option value={angle}>{angleLabel(angle)}</option>
          {/each}
        </select>
      </label>

      <div class="transport" aria-label="Timeline transport">
        <button type="button" on:click={() => stepFrame(-1)} aria-label="Previous frame">←</button>
        <button type="button" on:click={togglePlayback}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" on:click={() => stepFrame(1)} aria-label="Next frame">→</button>
      </div>

      {#if rig}
        <code>
          {rig.animation.frameId} · {rig.animation.frameIndex + 1}/{rig.animation.frameCount} · {rig.animation.framerate} fps
        </code>
      {/if}
    </div>

    {#if mode !== 'public'}<div class="scope-note">
      <strong>Implemented:</strong>
      <span>base avatar XML state, timing, angles, offsets, mirrors, skin colors, captured default outfit config, and validated forward head capture</span>
      <strong>Not implemented:</strong>
      <span>uncaptured equipped-item fragments/sprite sheets and non-forward O3D head rotation</span>
    </div>{/if}

    <div class:public-grid={mode === 'public'} class="comparison-grid">
      {#if mode !== 'public'}<article>
        <span>XML-driven reconstruction</span>
        <div class="stage checkerboard">
          <canvas bind:this={compositeCanvas}></canvas>
        </div>
      </article>

      <article>
        <span>Captured Flash oracle (forward idle)</span>
        <div class="stage checkerboard">
          {#if oracleUrl}
            <img src={oracleUrl} alt="Captured Flash avatar oracle" />
          {/if}
        </div>
      </article>{/if}

      <article>
        <span>Difference heatmap</span>
        <div class="stage checkerboard comparison-stage">
          <canvas bind:this={differenceCanvas}></canvas>
          {#if rig && !rig.oracleComparable}
            <div class="comparison-paused">Forward idle only</div>
          {/if}
        </div>
      </article>

      <article>
        <span>Alignment overlay</span>
        <div class="stage checkerboard comparison-stage">
          <canvas bind:this={overlayCanvas}></canvas>
          {#if rig && !rig.oracleComparable}
            <div class="comparison-paused">Forward idle only</div>
          {/if}
        </div>
      </article>
    </div>

    {#if mode !== 'public'}<div class="controls">
      <label>
        <input
          type="checkbox"
          bind:checked={showHead}
          disabled={!rig?.head.supported}
          on:change={compose}
        />
        forward head reconstruction ({headCaptureState})
      </label>

      <label class="range">
        <span>oracle overlay {Math.round(overlayOpacity * 100)}%</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          bind:value={overlayOpacity}
          disabled={!rig?.oracleComparable}
          on:input={compose}
        />
      </label>
    </div>{/if}

    {#if mode !== 'public' && warnings.length}
      <details>
        <summary>{warnings.length} renderer warning(s)</summary>
        <pre>{warnings.join('\n')}</pre>
      </details>
    {/if}

    {#if mode !== 'public' && rig}
      <details>
        <summary>compiled frame rig</summary>
        <pre>{JSON.stringify(rig, null, 2)}</pre>
      </details>
    {/if}
  {/if}
</section>

<style>
  .compositor-shell {
    width: min(1180px, calc(100vw - 32px));
    margin: 24px auto;
    padding: 22px;
    color: #eef5ff;
    border: 1px solid rgba(137, 216, 255, 0.2);
    border-radius: 20px;
    background: rgba(5, 10, 20, 0.82);
  }

  .compositor-shell.public-stage {
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .public-stage .state-controls {
    justify-content: center;
    margin: 0 0 14px;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .public-stage .state-controls code {
    display: none;
  }

  .comparison-grid.public-grid {
    grid-template-columns: 1fr;
  }

  .public-stage article > span {
    display: none;
  }

  .public-stage .stage {
    min-height: 390px;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .public-stage canvas {
    width: 192px;
    height: 384px;
  }

  header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
  }

  header div {
    display: grid;
    gap: 5px;
  }

  header span,
  article > span {
    color: #9ddfff;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: clamp(24px, 4vw, 38px);
  }

  p {
    max-width: 720px;
    color: rgba(238, 245, 255, 0.58);
    font-size: 12px;
    line-height: 1.55;
  }

  header strong {
    max-width: 330px;
    color: rgba(238, 245, 255, 0.7);
    font-size: 12px;
    text-align: right;
  }

  .state-controls {
    display: flex;
    align-items: end;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.025);
  }

  .state-controls label {
    display: grid;
    gap: 5px;
  }

  .state-controls label > span {
    color: rgba(238, 245, 255, 0.5);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  select,
  button {
    min-height: 34px;
    color: #eef5ff;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    background: #101827;
  }

  select {
    min-width: 164px;
    padding: 0 10px;
  }

  button {
    padding: 0 12px;
    cursor: pointer;
  }

  button:hover {
    border-color: rgba(137, 216, 255, 0.5);
  }

  .transport {
    display: flex;
    gap: 6px;
  }

  .state-controls code {
    margin-left: auto;
    padding-bottom: 9px;
    color: rgba(238, 245, 255, 0.58);
    font-size: 10px;
  }

  .scope-note {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 5px 8px;
    margin-bottom: 16px;
    padding: 10px 12px;
    color: rgba(238, 245, 255, 0.6);
    border-left: 2px solid rgba(137, 216, 255, 0.5);
    font-size: 11px;
    line-height: 1.45;
  }

  .scope-note strong {
    color: rgba(238, 245, 255, 0.86);
  }

  .comparison-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  article {
    display: grid;
    gap: 8px;
  }

  .stage {
    display: grid;
    place-items: center;
    min-height: 540px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
  }

  .checkerboard {
    background-color: #111722;
    background-image:
      linear-gradient(45deg, rgba(255,255,255,.035) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(255,255,255,.035) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(255,255,255,.035) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.035) 75%);
    background-size: 20px 20px;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0;
  }

  canvas,
  .stage img {
    width: 256px;
    height: 512px;
    object-fit: contain;
    image-rendering: auto;
  }

  .comparison-stage {
    position: relative;
  }

  .comparison-paused {
    position: absolute;
    inset: auto 12px 12px;
    padding: 8px;
    color: rgba(238, 245, 255, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    background: rgba(3, 6, 12, 0.85);
    font-size: 10px;
    text-align: center;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 24px;
    margin-top: 16px;
    color: rgba(238, 245, 255, 0.72);
    font-size: 12px;
  }

  .controls label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .range {
    flex: 1;
  }

  .range input {
    width: min(360px, 50vw);
  }

  details {
    margin-top: 14px;
    color: rgba(238, 245, 255, 0.68);
    font-size: 12px;
  }

  pre {
    max-height: 340px;
    overflow: auto;
    padding: 12px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.3);
    white-space: pre-wrap;
  }

  .error {
    padding: 16px;
    color: #ffb2b2;
    border: 1px solid rgba(255, 100, 100, 0.28);
    border-radius: 12px;
  }

  @media (max-width: 1000px) {
    .comparison-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    header,
    .controls {
      align-items: stretch;
      flex-direction: column;
    }

    header strong {
      text-align: left;
    }

    .state-controls code {
      width: 100%;
      margin-left: 0;
    }

    .scope-note {
      grid-template-columns: 1fr;
    }

    .comparison-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
