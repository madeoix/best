<script>
  import { onMount } from 'svelte';

  export let avatarId;

  let headCanvas;
  let bodyCanvas;
  let status = 'loading';
  let error = '';
  let bundle = null;
  let headDesign = null;
  let meshes = [];
  let bodyBounds = null;
  let headBounds = null;

  const W = 128;
  const H = 256;
  const HEAD = 128;

  function n(v, fallback = 0) {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  }

  function a(el, names, fallback = null) {
    for (const name of names) {
      const v = el?.getAttribute?.(name);
      if (v !== null && v !== undefined && v !== '') return v;
    }
    return fallback;
  }

  function parseO3D(xmlText, ref, optionId) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error(`O3D parse failed: ${ref}`);

    return [...doc.querySelectorAll('mesh')].map((meshNode) => {
      const vertices = [...meshNode.querySelectorAll('vertices > vertex, vertices > v')].map((v) => ({
        x: n(a(v, ['x', 'px', 'a'], 0)),
        y: n(a(v, ['y', 'py', 'b'], 0)),
        z: n(a(v, ['z', 'pz', 'c'], 0))
      }));

      const uvs = [...meshNode.querySelectorAll('uvs > uv, uvs > v')].map((uv) => ({
        u: n(a(uv, ['u', 'x', 'a'], 0)),
        v: n(a(uv, ['v', 'y', 'b'], 0))
      }));

      const faces = [...meshNode.querySelectorAll('faces > face, faces > f')]
        .map((f) => ({
          a: Math.trunc(n(a(f, ['a', 'v0', 'i0'], -1), -1)),
          b: Math.trunc(n(a(f, ['b', 'v1', 'i1'], -1), -1)),
          c: Math.trunc(n(a(f, ['c', 'v2', 'i2'], -1), -1)),
          m: Math.trunc(n(a(f, ['m', 'material'], 0), 0))
        }))
        .filter((f) => f.a >= 0 && f.b >= 0 && f.c >= 0);

      return {
        ref,
        optionId,
        name: meshNode.getAttribute('name') || ref.split('/').pop(),
        vertices,
        uvs,
        faces
      };
    });
  }

  function cloneMesh(mesh, name) {
    return {
      ...mesh,
      name,
      vertices: mesh.vertices.map((v) => ({ ...v })),
      uvs: mesh.uvs.map((uv) => ({ ...uv })),
      faces: mesh.faces.map((f) => ({ ...f }))
    };
  }

  function blendMeshes(items, name, weights) {
    const usable = items.filter(Boolean);
    if (!usable.length) return null;
    if (usable.length === 1) return cloneMesh(usable[0], name);

    // SWF/O3D morph targets may contain vertices but zero faces.
    // Use the mesh that actually has faces as the drawable surface,
    // while still blending vertex positions from all same-count targets.
    const surface = usable.find((m) => m.faces?.length > 0) || usable[0];

    const sameVertexCount = usable.every((m) => m.vertices.length === surface.vertices.length);
    if (!sameVertexCount) return cloneMesh(surface, `${name}_vertex_count_mismatch`);

    const total = weights.reduce((x, y) => x + y, 0) || 1;

    return {
      ...surface,
      name,
      vertices: surface.vertices.map((_, i) => {
        let x = 0;
        let y = 0;
        let z = 0;

        usable.forEach((m, j) => {
          const w = (weights[j] ?? 0) / total;
          x += m.vertices[i].x * w;
          y += m.vertices[i].y * w;
          z += m.vertices[i].z * w;
        });

        return { x, y, z };
      }),
      uvs: surface.uvs,
      faces: surface.faces
    };
  }

  function classified() {
    const faceCute = meshes.find((m) => m.name === 'face_F_cute');
    const faceThin = meshes.find((m) => m.name === 'face_F_thin');
    const noseStraight = meshes.find((m) => m.name === 'n_03_straight');
    const noseButton = meshes.find((m) => m.name === 'face_M_anime');
    const glasses = meshes.find((m) => m.name === 'gl_surfy');
    const hairBack = meshes.find((m) => m.name === 'fhair_vamp_b');
    const hairFront = meshes.find((m) => m.name === 'fhair_vamp_a');

    return {
      face: blendMeshes([faceCute, faceThin], 'face_blend', [0.87, 0.13]),
      nose: blendMeshes([noseStraight, noseButton], 'nose_blend', [0.42, 0.58]),
      glasses,
      hairBack,
      hairFront
    };
  }

  function bounds(list) {
    const pts = list.filter(Boolean).flatMap((m) => m.vertices);
    if (!pts.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };

    return {
      minX: Math.min(...pts.map((p) => p.x)),
      maxX: Math.max(...pts.map((p) => p.x)),
      minY: Math.min(...pts.map((p) => p.y)),
      maxY: Math.max(...pts.map((p) => p.y))
    };
  }

  function drawMesh(ctx, mesh, project, stroke, fill = null) {
    if (!mesh) return;

    if (fill) {
      ctx.fillStyle = fill;
      for (const f of mesh.faces) {
        const va = mesh.vertices[f.a];
        const vb = mesh.vertices[f.b];
        const vc = mesh.vertices[f.c];
        if (!va || !vb || !vc) continue;

        const pa = project(va);
        const pb = project(vb);
        const pc = project(vc);

        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.lineTo(pc.x, pc.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.35;

    for (const f of mesh.faces) {
      const va = mesh.vertices[f.a];
      const vb = mesh.vertices[f.b];
      const vc = mesh.vertices[f.c];
      if (!va || !vb || !vc) continue;

      const pa = project(va);
      const pb = project(vb);
      const pc = project(vc);

      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.lineTo(pc.x, pc.y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  async function drawHeadTexture() {
    const ctx = headCanvas?.getContext?.('2d');
    if (!ctx) return;

    // Transparent texture canvas: Flash passes this into bodyView.setHeadTexture().
    ctx.clearRect(0, 0, HEAD, HEAD);

    const c = classified();
    const ordered = [c.hairBack, c.face, c.nose, c.glasses, c.hairFront].filter(Boolean);
    const b = bounds(ordered);
    const dx = b.maxX - b.minX || 1;
    const dy = b.maxY - b.minY || 1;
    const scale = Math.min(58 / dx, 62 / dy);

    const project = (p) => ({
      x: HEAD / 2 + (p.x - (b.minX + dx / 2)) * scale,
      y: HEAD / 2 - (p.y - (b.minY + dy / 2)) * scale
    });

    // SWF-shaped order, not final materials yet.
    // Hair/side pass first. This hairstyle's fhair_vamp_a surface is broad,
    // so draw it before repainting the face/details.
    drawMesh(ctx, c.hairBack, project, 'rgba(80,54,38,0.14)', 'rgba(70,45,32,0.08)');

    await drawTexturedMesh(ctx, c.hairFront, project, 'h_base.png', 0.76, 'source-over', 'front', ['1']);
    await drawTexturedMesh(ctx, c.hairFront, project, 'ht_fteenvamp_shad.png', 0.34, 'multiply', 'front', ['1']);
    await drawTexturedMesh(ctx, c.hairFront, project, 'h_hilite.png', 0.16, 'screen', 'front', ['1']);
    drawMesh(ctx, c.hairFront, project, 'rgba(42,31,22,0.18)', null);

    // Face/nose repaint over hair material.
    drawMesh(ctx, c.face, project, 'rgba(120,75,45,0.22)', 'rgba(190,124,82,0.30)');
    drawMesh(ctx, c.nose, project, 'rgba(120,75,45,0.18)', 'rgba(205,145,98,0.18)');

    await drawSelectedDesignSprites(ctx, [
      'FoundationOptions',
      'BlusherOptions',
      'EyeOptions',
      'BrowOptions',
      'MouthOptions'
    ]);

    // Glasses last.
    await drawTexturedMesh(ctx, c.glasses, project, 'gl_03_surfy.png', 0.92, 'source-over', 'front', ['0']);
    drawMesh(ctx, c.glasses, project, 'rgba(130,170,185,0.30)', null);

    headBounds = canvasAlphaBounds(headCanvas);

    // No debug text on the actual texture canvas; it pollutes alpha bounds.
  }

  async function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function bodyTexture(pattern) {
    const tex = bundle?.body?.textures?.find((t) => t.ref.includes(pattern));
    if (!tex) return null;
    return tex.url || `/avatar-assets/${tex.ref}`;
  }

  function headTexture(pattern) {
    const tex = bundle?.head?.textures?.find((t) => t.ref.includes(pattern));
    if (!tex) return null;
    return tex.url || `/avatar-assets/${tex.ref}`;
  }

  async function drawHeadOverlay(ctx, pattern, x, y, w, h, alpha = 1, mode = 'source-over') {
    const url = headTexture(pattern);
    if (!url) return false;

    try {
      const img = await loadImage(url);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = mode;
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
      return true;
    } catch {
      return false;
    }
  }

  function colorForSprite(sprite) {
    const id = sprite?.attrs?.id;
    const name = sprite?.attrs?.name;
    const sid = id || name;

    const rule = headDesign?.colors?.find((c) => c.attrs?.sId === sid);
    if (!rule) return null;

    const c = Number(rule.attrs.c);
    if (!Number.isFinite(c)) return null;

    const r = (c >> 16) & 255;
    const g = (c >> 8) & 255;
    const b = c & 255;
    const alpha = Number(rule.attrs.a ?? 0.55);

    return {
      color: `rgb(${r}, ${g}, ${b})`,
      alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0.55
    };
  }

  async function drawDesignSprite(ctx, sprite, alpha = 1) {
    const attrs = sprite.attrs || {};

    const id = attrs.id || '';
    const name = attrs.name || '';

    // Hair/glasses base textures without placement are O3D material maps,
    // not 2D head-canvas sprites. Flash applies them through mesh materials.
    const hasPlacement = attrs.tx !== undefined || attrs.ty !== undefined || id.includes('Eye') || id.includes('Pupil') || id.includes('Makeup') || id.includes('Brow') || id.includes('Blusher') || id === 'Lipstick' || name.includes('Mouth');
    if (!hasPlacement) return;

    const img = await loadImage(sprite.url);

    // SWF head texture design space is roughly 1024 -> 128, so /8.
    // Parent <x tx/ty> transforms are flattened into head-design-sprites.json.
    let tx = Number(attrs.tx ?? 0);
    let ty = Number(attrs.ty ?? 0);

    const sx = Number(attrs.sx ?? 1);
    const sy = Number(attrs.sy ?? 1);
    const cx = Number(attrs.cx ?? img.width / 2);
    const cy = Number(attrs.cy ?? img.height / 2);
    const rot = Number(attrs.rot ?? 0);

    ctx.save();

    ctx.translate(tx / 8, ty / 8);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(sx / 8, sy / 8);

    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -cx, -cy);

    const tint = colorForSprite(sprite);
    if (tint) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = Math.min(alpha, tint.alpha);
      ctx.fillStyle = tint.color;
      ctx.fillRect(-cx, -cy, img.width, img.height);
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();
  }

  async function drawSelectedDesignSprites(ctx, optionIds) {
    const sprites = headDesign?.sprites ?? [];

    const selected = sprites
      .filter((s) => optionIds.includes(s.option_id))
      .filter((s) => !s.ref.includes('/icon_') && !s.ref.includes('/icons_'))
      .sort((a, b) => Number(a.attrs?.pri ?? 0) - Number(b.attrs?.pri ?? 0));

    for (const sprite of selected) {
      await drawDesignSprite(ctx, sprite, 1);
    }
  }

  function designTexture(pattern) {
    const sprite = headDesign?.sprites?.find((s) => s.ref.includes(pattern));
    if (sprite) return sprite.url;

    const tex = bundle?.head?.textures?.find((t) => t.ref.includes(pattern));
    if (tex) return tex.url || `/avatar-assets/${tex.ref}`;

    return null;
  }

  const imageCache = new Map();

  async function cachedImage(src) {
    if (!src) return null;
    if (imageCache.has(src)) return imageCache.get(src);
    const img = await loadImage(src);
    imageCache.set(src, img);
    return img;
  }

  function uvToPixels(uv, img) {
    let u = Number(uv?.u ?? 0);
    let v = Number(uv?.v ?? 0);

    // Most O3D UVs are normalized, but tolerate pixel-ish UVs too.
    if (Math.abs(u) <= 2) u *= img.width;
    if (Math.abs(v) <= 2) v *= img.height;

    return { x: u, y: v };
  }

  function drawImageTriangle(ctx, img, src, dst) {
    const [s0, s1, s2] = src;
    const [d0, d1, d2] = dst;

    const denom =
      s0.x * (s1.y - s2.y) +
      s1.x * (s2.y - s0.y) +
      s2.x * (s0.y - s1.y);

    if (!Number.isFinite(denom) || Math.abs(denom) < 0.000001) return;

    const a =
      (d0.x * (s1.y - s2.y) +
        d1.x * (s2.y - s0.y) +
        d2.x * (s0.y - s1.y)) /
      denom;

    const b =
      (d0.y * (s1.y - s2.y) +
        d1.y * (s2.y - s0.y) +
        d2.y * (s0.y - s1.y)) /
      denom;

    const c =
      (d0.x * (s2.x - s1.x) +
        d1.x * (s0.x - s2.x) +
        d2.x * (s1.x - s0.x)) /
      denom;

    const d =
      (d0.y * (s2.x - s1.x) +
        d1.y * (s0.x - s2.x) +
        d2.y * (s1.x - s0.x)) /
      denom;

    const e =
      (d0.x * (s1.x * s2.y - s2.x * s1.y) +
        d1.x * (s2.x * s0.y - s0.x * s2.y) +
        d2.x * (s0.x * s1.y - s1.x * s0.y)) /
      denom;

    const f =
      (d0.y * (s1.x * s2.y - s2.x * s1.y) +
        d1.y * (s2.x * s0.y - s0.x * s2.y) +
        d2.y * (s0.x * s1.y - s1.x * s0.y)) /
      denom;

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(d0.x, d0.y);
    ctx.lineTo(d1.x, d1.y);
    ctx.lineTo(d2.x, d2.y);
    ctx.closePath();
    ctx.clip();

    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);

    ctx.restore();
  }

  async function drawTexturedMesh(ctx, mesh, project, texturePattern, alpha = 1, mode = 'source-over', zMode = 'all', materialIds = null) {
    if (!mesh) return false;

    const url = designTexture(texturePattern);
    if (!url) return false;

    const img = await cachedImage(url);
    if (!img) return false;

    const faces = mesh.faces
      .map((face) => {
        const va = mesh.vertices[face.a];
        const vb = mesh.vertices[face.b];
        const vc = mesh.vertices[face.c];
        if (!va || !vb || !vc) return null;

        return {
          face,
          z: ((va.z ?? 0) + (vb.z ?? 0) + (vc.z ?? 0)) / 3
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.z - b.z);

    const zVals = faces.map((f) => f.z);
    const minZ = Math.min(...zVals);
    const maxZ = Math.max(...zVals);
    const midZ = minZ + (maxZ - minZ) * 0.5;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = mode;

    for (const item of faces) {
      const face = item.face;

      if (materialIds && !materialIds.includes(String(face.m))) continue;

      if (zMode === 'back' && item.z > midZ) continue;
      if (zMode === 'front' && item.z < midZ) continue;

      const va = mesh.vertices[face.a];
      const vb = mesh.vertices[face.b];
      const vc = mesh.vertices[face.c];

      const uva = mesh.uvs?.[face.a];
      const uvb = mesh.uvs?.[face.b];
      const uvc = mesh.uvs?.[face.c];

      if (!va || !vb || !vc || !uva || !uvb || !uvc) continue;

      drawImageTriangle(
        ctx,
        img,
        [uvToPixels(uva, img), uvToPixels(uvb, img), uvToPixels(uvc, img)],
        [project(va), project(vb), project(vc)]
      );
    }

    ctx.restore();
    return true;
  }

  const BODY_CROPS = {
    'skinny_leg_idle.png': [7, 5, 130, 166],
    'foot_idle.png': [6, 69, 130, 112],
    'torso.png': [6, 1, 151, 50],
    'arm_idle.png': [9, 7, 96, 142]
  };

  async function drawBodyPart(ctx, pattern, x, y, w, h, alpha = 1, tint = null) {
    const url = bodyTexture(pattern);
    if (!url) return false;

    try {
      const img = await loadImage(url);
      const crop = BODY_CROPS[pattern];

      const tmp = document.createElement('canvas');
      tmp.width = Math.max(1, Math.round(w));
      tmp.height = Math.max(1, Math.round(h));
      const tctx = tmp.getContext('2d');

      if (crop) {
        const [sx, sy, sw, sh] = crop;
        tctx.drawImage(img, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
      } else {
        tctx.drawImage(img, 0, 0, tmp.width, tmp.height);
      }

      if (tint) {
        tctx.globalCompositeOperation = 'source-atop';
        tctx.globalAlpha = tint.alpha ?? 0.55;
        tctx.fillStyle = tint.color;
        tctx.fillRect(0, 0, tmp.width, tmp.height);
        tctx.globalAlpha = 1;
        tctx.globalCompositeOperation = 'source-over';
      }

      ctx.globalAlpha = alpha;
      ctx.drawImage(tmp, x, y, w, h);
      ctx.globalAlpha = 1;
      return true;
    } catch {
      ctx.globalAlpha = 1;
      return false;
    }
  }

  function canvasAlphaBounds(canvas) {
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return null;

    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * 4 + 3];
        if (a > 12) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < 0) return null;

    return {
      x0: minX,
      y0: minY,
      x1: maxX + 1,
      y1: maxY + 1,
      w: maxX + 1 - minX,
      h: maxY + 1 - minY
    };
  }

  async function drawBodySnapshot() {
    const ctx = bodyCanvas?.getContext?.('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);

    // First real BodyView-style pass:
    // selected idle body sprites + generated head texture.
    // Positions are initial SWF-port calibration values against the 128x256 oracle.
    // Cropped visible bounds, calibrated against 128x256 Flash oracle.
    await drawBodyPart(ctx, 'skinny_leg_idle.png', 43, 111, 42, 84, 1, { color: '#111111', alpha: 0.72 });
    await drawBodyPart(ctx, 'foot_idle.png', 42, 166, 44, 45, 1, { color: '#b77a55', alpha: 0.58 });

    // Arm behind torso.
    await drawBodyPart(ctx, 'arm_idle.png', 40, 84, 48, 68, 1, { color: '#b77a55', alpha: 0.58 });

    // Torso / shirt base.
    await drawBodyPart(ctx, 'torso.png', 41, 88, 46, 27, 1, { color: '#f2f2f2', alpha: 0.70 });

    if (headCanvas) {
      // Crop actual transparent head texture bounds, then place into the
      // oracle-calibrated full-body head bbox: 39,45 -> 89,100.
      const hb = headBounds || canvasAlphaBounds(headCanvas);

      if (hb) {
        ctx.drawImage(
          headCanvas,
          hb.x0,
          hb.y0,
          hb.w,
          hb.h,
          39,
          45,
          50,
          55
        );
      } else {
        ctx.drawImage(headCanvas, 39, 45, 50, 55);
      }
    }

    ctx.strokeStyle = 'rgba(158,208,255,0.22)';
    ctx.strokeRect(39, 45, 50, 55);

    bodyBounds = canvasAlphaBounds(bodyCanvas);

    ctx.fillStyle = '#9ed0ff';
    ctx.font = '8px system-ui';
    ctx.fillText('BodySnapshot body parts', 4, 10);
  }

  async function drawAll() {
    await drawHeadTexture();
    await drawBodySnapshot();
  }

  async function load() {
    if (!avatarId) return;

    status = 'loading';
    error = '';
    bundle = null;
    meshes = [];

    try {
      const r = await fetch(`/avatar-renders/${avatarId}/render-bundle.v3.json`);
      if (!r.ok) throw new Error(`bundle ${r.status}`);
      bundle = await r.json();

      const hdr = await fetch(`/avatar-renders/${avatarId}/head-design-sprites.json`);
      if (!hdr.ok) throw new Error(`head-design-sprites ${hdr.status}`);
      headDesign = await hdr.json();

      const parsed = [];
      for (const mesh of bundle?.head?.meshes ?? []) {
        const mr = await fetch(mesh.url || `/avatar-assets/${mesh.ref}`);
        if (!mr.ok) throw new Error(`${mesh.ref}: ${mr.status}`);
        parsed.push(...parseO3D(await mr.text(), mesh.ref, mesh.option_id));
      }

      meshes = parsed;
      status = 'ready';
      requestAnimationFrame(drawAll);
    } catch (e) {
      status = 'error';
      error = e?.message || String(e);
    }
  }

  onMount(load);

  $: if (headCanvas && bodyCanvas && avatarId && status === 'ready') {
    drawAll();
  }
</script>

<div class="swf">
  <div class="stage">
    <h3>Flash thumb oracle</h3>
    <img class="thumb-oracle" src={`/avatar-oracles/${avatarId}/flash-thumb.png`} alt="Flash thumb oracle" />
  </div>

  <div class="stage">
    <h3>SWF stage 1: HeadTexture</h3>
    <canvas bind:this={headCanvas} width={HEAD} height={HEAD}></canvas>
  </div>

  <div class="stage">
    <h3>SWF stage 2: BodySnapshot</h3>
    <canvas bind:this={bodyCanvas} width={W} height={H}></canvas>
  </div>

  <div class="status">
    {#if status === 'loading'}
      loading SWF-shaped renderer…
    {:else if status === 'error'}
      <span class="bad">{error}</span>
    {:else}
      loaded · {meshes.length} raw mesh nodes · {bundle?.stats?.head_mesh_count} mesh refs
      {#if headBounds}
        <br />
        head bbox: {headBounds.x0},{headBounds.y0} → {headBounds.x1},{headBounds.y1}
        ({headBounds.w}x{headBounds.h})
      {/if}
      {#if bodyBounds}
        <br />
        body bbox: {bodyBounds.x0},{bodyBounds.y0} → {bodyBounds.x1},{bodyBounds.y1}
        ({bodyBounds.w}x{bodyBounds.h}) · target 35,45 → 94,226 (59x181)
      {/if}
    {/if}
  </div>
</div>

<style>
  .swf {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .stage {
    display: grid;
    gap: 8px;
  }

  h3 {
    margin: 0;
    font-size: 12px;
    opacity: 0.82;
  }

  canvas {
    background: #05070d;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 8px;
    image-rendering: auto;
  }

  .thumb-oracle {
    width: 100px;
    height: 100px;
    object-fit: contain;
    background: #05070d;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 8px;
  }

  .status {
    width: 100%;
    font-size: 12px;
    color: rgba(232,238,248,0.72);
  }

  .bad {
    color: #ff8a8a;
  }
</style>
