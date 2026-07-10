<script>
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

  import { parseO3D } from '$lib/avatar-renderer/o3dParser.js';
  import {
    loadAvatarRenderContract,
    getRigidMeshAssets
  } from '$lib/avatar-renderer/avatarRenderContract.js';
  import {
    loadAvatarMaterialContext
  } from '$lib/avatar-renderer/avatarMaterialContext.js';
  import {
    buildHeadMorphModel
  } from '$lib/avatar-renderer/headMorphBuilder.js';
  import { buildThreeMeshGroup } from '$lib/avatar-renderer/threeMeshBuilder.js';
  import { resolveHeadSprites, isFaceFeatureSprite } from '$lib/avatar-renderer/headSpriteResolver.js';
  import { composeHeadAtlas } from '$lib/avatar-renderer/headTextureComposer.js';
  import {
    getHeadProjectionFrame
  } from '$lib/avatar-renderer/headProjection.js';

  export let avatarId;

  let host;
  let status = 'booting renderer';
  let error = null;
  let loadedModels = [];
  let showWireframe = false;
  let showOracle = true;

  let renderer;
  let scene;
  let camera;
  let controls;
  let raf;
  let modelRoot;
  let spriteRoot;
  const spriteTextureLoader = new THREE.TextureLoader();

  function loadSpriteTexture(url) {
    return new Promise((resolve, reject) => {
      spriteTextureLoader.load(
        url,
        (texture) => resolve(texture),
        undefined,
        (error) => reject(
          new Error(`Failed to load head sprite ${url}: ${error?.message ?? error}`)
        )
      );
    });
  }

  $: oracleBase = avatarId ? `/avatar-oracles/${avatarId}` : '';

  async function loadO3D(url, materialContext = null) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} ${res.status}`);

    const xmlText = await res.text();
    const parsed = parseO3D(xmlText);

    const meshes = [];

    for (const parsedMesh of parsed.meshes) {
      const meshGroup = buildThreeMeshGroup({
        parsedMesh,
        sourceUrl: url,
        materials: parsed.materials,
        avatarId,
        materialContext,
        showWireframe
      });

      if (meshGroup) meshes.push(meshGroup);
    }

    return meshes;
  }

  function syncDebugVisibility() {
    if (!modelRoot) return;
    modelRoot.traverse((obj) => {
      if (obj.name === 'wireframe') obj.visible = showWireframe;
    });
  }

  $: {
    showWireframe;
    syncDebugVisibility();
  }


  async function addHeadSpriteOverlay(materialContext = null) {
    if (!avatarId || !modelRoot) return;

    const projectionFrame =
      getHeadProjectionFrame(modelRoot);

    const faceMesh = projectionFrame.faceMesh;

    if (!faceMesh) {
      throw new Error(
        'No selected face mesh was found for UV rendering'
      );
    }

    const uvAttribute =
      faceMesh.geometry?.getAttribute?.('uv');

    if (!uvAttribute) {
      throw new Error(
        `Selected face mesh has no UV coordinates: ${faceMesh.name}`
      );
    }

    const sprites = (
      await resolveHeadSprites(avatarId)
    ).filter(isFaceFeatureSprite);

    const atlas = await composeHeadAtlas(
      sprites,
      loadSpriteTexture,
      materialContext
    );

    const material = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      transparent: true,
      alphaTest: 0.001,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });

    // Clone the actual selected face mesh so the atlas uses
    // precisely the same geometry, UVs and transforms.
    const overlay = faceMesh.clone(false);

    overlay.name = 'head-uv-atlas-overlay';
    overlay.geometry = faceMesh.geometry;
    overlay.material = material;
    overlay.renderOrder = 60;

    overlay.userData = {
      strategy: 'uv-atlas-overlay',
      sourceFaceMesh: faceMesh.name,
      atlasSize: [atlas.width, atlas.height],
      sourceSpriteCount: sprites.length,
      uvCount: uvAttribute.count
    };

    faceMesh.parent.add(overlay);
    spriteRoot = overlay;

    loadedModels = [
      ...loadedModels,
      {
        url: 'head-design-atlas',
        strategy: 'uv-atlas-overlay',
        faceMesh: faceMesh.name,
        baseFaceMaterial: {
          name: faceMesh.material?.name ?? null,
          type: faceMesh.material?.type ?? null,
          color:
            faceMesh.material?.color
              ? `#${faceMesh.material.color.getHexString()}`
              : null,
          opacity:
            faceMesh.material?.opacity ?? null,
          transparent:
            faceMesh.material?.transparent ?? null,
          map:
            faceMesh.material?.map?.name ?? null,
          userData:
            faceMesh.material?.userData ?? null
        },
        atlasMaterial: {
          color:
            material.color
              ? `#${material.color.getHexString()}`
              : null,
          opacity: material.opacity,
          transparent: material.transparent,
          map: material.map?.name ?? null
        },
        atlasSize: [
          atlas.width,
          atlas.height
        ],
        sourceSpriteCount: sprites.length,
        filteredLayerCount:
          atlas.filteredLayerCount,
        filterStrategy:
          atlas.filterStrategy,
        uvCount: uvAttribute.count,
        layers: atlas.layers,
        count: 1
      }
    ];
  }

  function fitModel() {
    const box = new THREE.Box3().setFromObject(modelRoot);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    box.getSize(size);
    box.getCenter(center);

    modelRoot.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    modelRoot.scale.setScalar(4.2 / maxDim);

    // SmallVerse O3D front axis -> Three.js camera.
    modelRoot.rotation.y = -Math.PI / 2;

    camera.position.set(0, 0.8, 6);
    controls.target.set(0, 0.15, 0);
    controls.update();
  }

  function onResize() {
    if (!host || !renderer || !camera) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  }

  async function buildScene() {
    if (!host || !avatarId) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050914);

    camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.01, 1000);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.1;

    scene.add(new THREE.HemisphereLight(0xdbeeff, 0x101020, 2.8));

    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(3, 6, 5);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x72ccff, 2.4);
    rim.position.set(-5, 2, -4);
    scene.add(rim);

    modelRoot = new THREE.Group();
    scene.add(modelRoot);

    status = 'loading universal avatar render contract';

    const contract =
      await loadAvatarRenderContract(avatarId);

    const materialContext =
      await loadAvatarMaterialContext(
        avatarId,
        contract
      );

    loadedModels = [
      {
        url:
          `/avatar-renders/${avatarId}/` +
          'render-contract.v4.json',
        contract: contract.contract,
        gender: contract.gender,
        stats: contract.stats,
        materialContext: materialContext.debug,
        count: 0
      }
    ];

    status = 'loading selected rigid meshes';

    const rigidAssets =
      getRigidMeshAssets(
        contract,
        avatarId
      );

    for (const asset of rigidAssets) {
      const url = asset.url;

      try {
        const meshes = await loadO3D(url, materialContext);

        for (const mesh of meshes) {
          modelRoot.add(mesh);
        }

        loadedModels = [
          ...loadedModels,
          {
            url,
            optionId: asset.option_id,
            selectedId: asset.selected_id,
            meshes: meshes.map((group) => ({
              name: group.name,
              materials: group.children
                .filter(
                  (child) => child.isMesh
                )
                .map((child) => ({
                  name: child.name,
                  materialId:
                    child.userData?.materialId,
                  materialName:
                    child.userData?.materialName,
                  texture:
                    child.userData
                      ?.materialTexture
                }))
            })),
            count: meshes.reduce(
              (total, group) =>
                total +
                group.children.filter(
                  (child) => child.isMesh
                ).length,
              0
            )
          }
        ];
      } catch (loadError) {
        loadedModels = [
          ...loadedModels,
          {
            url,
            optionId: asset.option_id,
            selectedId: asset.selected_id,
            error: String(
              loadError?.message ??
              loadError
            ),
            count: 0
          }
        ];
      }
    }

    status = 'building weighted head morph';

    const morphedHead =
      await buildHeadMorphModel({
        contract,
        avatarId,
        materialContext,
        showWireframe
      });

    for (const group of morphedHead.groups) {
      modelRoot.add(group);
    }

    loadedModels = [
      ...loadedModels,
      {
        url: 'render-contract.v4.json#head-morph',
        ...morphedHead.debug,
        meshes: morphedHead.groups.map(
          (group) => ({
            name: group.name,
            materials: group.children
              .filter(
                (child) => child.isMesh
              )
              .map((child) => ({
                name: child.name,
                materialId:
                  child.userData?.materialId,
                materialName:
                  child.userData?.materialName,
                texture:
                  child.userData
                    ?.materialTexture
              }))
          })
        ),
        count: morphedHead.count
      }
    ];

    await addHeadSpriteOverlay(
      materialContext
    );

    fitModel();

    const meshCount = loadedModels.reduce((n, m) => n + (m.count || 0), 0);
    status = `rendering ${meshCount} mesh(es)`;

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener('resize', onResize);
  }

  onMount(() => {
    buildScene().catch((e) => {
      error = String(e?.message ?? e);
      status = 'renderer failed';
    });

    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
      controls?.dispose?.();
      renderer?.dispose?.();
      renderer?.domElement?.remove?.();
      renderer?.dispose?.();
    };
  });
</script>

<section class="mesh-wrap">
  <div class="mesh-header">
    <div>
      <div class="eyebrow">Interactive Mesh Renderer</div>
      <h2>O3D Render Stage</h2>
    </div>
    <div class="status">{status}</div>
  </div>

  <div class="split" class:no-oracle={!showOracle}>
    <div class="panel">
      <div class="panel-label">Browser O3D / Three.js render</div>
      <div bind:this={host} class="three-host"></div>
    </div>

    {#if showOracle}
      <div class="panel oracle">
        <div class="panel-label">Flash oracle PNG</div>
        <img src={`${oracleBase}/flash-saveAvatarSnapshot.png?ts=${Date.now()}`} alt="Flash oracle render" />
      </div>
    {/if}
  </div>

  <div class="mesh-controls">
    <label>
      <input type="checkbox" bind:checked={showWireframe} />
      wireframe
    </label>
    <label>
      <input type="checkbox" bind:checked={showOracle} />
      oracle
    </label>
  </div>

  {#if error}
    <pre class="error">{error}</pre>
  {/if}

  <details class="debug">
    <summary>loaded meshes</summary>
    <pre>{JSON.stringify(loadedModels, null, 2)}</pre>
  </details>
</section>

<style>
  .mesh-wrap {
    width: min(1180px, calc(100vw - 32px));
    margin: 32px auto;
    color: #eef6ff;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .mesh-header {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 18px;
    margin-bottom: 16px;
  }

  .eyebrow {
    color: #a0e6ff;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 12px;
    font-weight: 900;
  }

  h2 {
    margin: 4px 0 0;
    font-size: clamp(28px, 5vw, 48px);
  }

  .status {
    color: #9eb4c8;
    border: 1px solid rgba(160, 230, 255, 0.18);
    border-radius: 999px;
    padding: 8px 12px;
    background: rgba(6, 16, 32, 0.65);
  }

  .split {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.65fr);
    gap: 14px;
  }

  .split.no-oracle {
    grid-template-columns: 1fr;
  }

  .panel {
    position: relative;
    border: 1px solid rgba(137, 216, 255, 0.2);
    border-radius: 24px;
    min-height: 560px;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 44%, rgba(44, 170, 255, 0.22), transparent 25%),
      linear-gradient(180deg, #071020, #050812);
    box-shadow: inset 0 0 80px rgba(120, 190, 255, 0.05);
  }

  .panel-label {
    position: absolute;
    z-index: 5;
    top: 14px;
    left: 14px;
    color: #aee8ff;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    opacity: 0.82;
  }

  .three-host {
    position: absolute;
    inset: 0;
  }

  .oracle {
    display: grid;
    place-items: center;
  }

  .oracle img {
    width: min(250px, 70%);
    filter:
      drop-shadow(0 0 18px rgba(126, 218, 255, 0.5))
      drop-shadow(0 28px 36px rgba(0, 0, 0, 0.68));
  }

  .mesh-controls {
    display: flex;
    gap: 14px;
    margin-top: 14px;
    color: #aee8ff;
    font-size: 13px;
  }

  .mesh-controls label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 1px solid rgba(137, 216, 255, 0.16);
    border-radius: 999px;
    padding: 8px 12px;
    background: rgba(6, 16, 32, 0.72);
  }

  .debug {
    margin-top: 14px;
    border: 1px solid rgba(137, 216, 255, 0.16);
    border-radius: 16px;
    padding: 12px;
    background: rgba(6, 16, 32, 0.72);
  }

  .debug pre,
  .error {
    overflow: auto;
    white-space: pre-wrap;
    color: #b9d8ee;
  }

  .error {
    border: 1px solid rgba(255, 80, 80, 0.25);
    border-radius: 14px;
    padding: 12px;
    background: rgba(80, 0, 0, 0.28);
  }

  @media (max-width: 900px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
</style>
