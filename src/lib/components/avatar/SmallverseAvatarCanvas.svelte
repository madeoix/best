<script>
  import { onMount } from 'svelte';

  export let avatarId;
  export let width = 360;
  export let height = 300;

  let canvas;
  let status = 'loading';
  let error = '';
  let bundle = null;
  let parsedMeshes = [];

  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function attr(el, names, fallback = null) {
    for (const name of names) {
      const v = el?.getAttribute?.(name);
      if (v !== null && v !== undefined && v !== '') return v;
    }
    return fallback;
  }

  function parseO3D(xmlText, ref) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`O3D XML parse failed for ${ref}`);
    }

    const meshNodes = [...doc.querySelectorAll('mesh')];
    const out = [];

    for (const meshNode of meshNodes) {
      const vertexNodes = [...meshNode.querySelectorAll('vertices > vertex, vertices > v')];
      const uvNodes = [...meshNode.querySelectorAll('uvs > uv, uvs > v')];
      const faceNodes = [...meshNode.querySelectorAll('faces > face, faces > f')];

      const vertices = vertexNodes.map((v) => ({
        x: num(attr(v, ['x', 'px', 'a'], 0)),
        y: num(attr(v, ['y', 'py', 'b'], 0)),
        z: num(attr(v, ['z', 'pz', 'c'], 0))
      }));

      const uvs = uvNodes.map((uv) => ({
        u: num(attr(uv, ['u', 'x', 'a'], 0)),
        v: num(attr(uv, ['v', 'y', 'b'], 0))
      }));

      const faces = faceNodes
        .map((f) => ({
          a: Math.trunc(num(attr(f, ['a', 'v0', 'i0'], -1), -1)),
          b: Math.trunc(num(attr(f, ['b', 'v1', 'i1'], -1), -1)),
          c: Math.trunc(num(attr(f, ['c', 'v2', 'i2'], -1), -1)),
          m: Math.trunc(num(attr(f, ['m', 'material'], 0), 0))
        }))
        .filter((f) => f.a >= 0 && f.b >= 0 && f.c >= 0);

      out.push({
        ref,
        name: meshNode.getAttribute('name') || ref.split('/').pop(),
        vertices,
        uvs,
        faces
      });
    }

    return out;
  }

  function bounds(meshes) {
    const pts = meshes.flatMap((m) => m.vertices);
    if (!pts.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };

    return {
      minX: Math.min(...pts.map((p) => p.x)),
      maxX: Math.max(...pts.map((p) => p.x)),
      minY: Math.min(...pts.map((p) => p.y)),
      maxY: Math.max(...pts.map((p) => p.y))
    };
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

  function blendMeshes(meshes, name, weights) {
    const usable = meshes.filter(Boolean);
    if (!usable.length) return null;
    if (usable.length === 1) return cloneMesh(usable[0], name);

    const base = usable[0];
    const sameTopology = usable.every(
      (m) => m.vertices.length === base.vertices.length && m.faces.length === base.faces.length
    );

    if (!sameTopology) {
      return cloneMesh(base, `${name}_unblended`);
    }

    const total = weights.reduce((a, b) => a + b, 0) || 1;

    const vertices = base.vertices.map((_, i) => {
      let x = 0, y = 0, z = 0;
      usable.forEach((m, j) => {
        const w = (weights[j] ?? 0) / total;
        x += m.vertices[i].x * w;
        y += m.vertices[i].y * w;
        z += m.vertices[i].z * w;
      });
      return { x, y, z };
    });

    return {
      ...base,
      name,
      vertices,
      uvs: base.uvs,
      faces: base.faces
    };
  }

  function displayMeshes() {
    const faceCute = parsedMeshes.find((m) => m.name === 'face_F_cute');
    const faceThin = parsedMeshes.find((m) => m.name === 'face_F_thin');
    const noseStraight = parsedMeshes.find((m) => m.name === 'n_03_straight');
    const noseButton = parsedMeshes.find((m) => m.name === 'face_M_anime');

    const glasses = parsedMeshes.find((m) => m.name === 'gl_surfy');
    const hair = parsedMeshes.filter((m) => m.name?.startsWith('fhair_vamp'));

    const face = blendMeshes([faceCute, faceThin], 'face_blend_0.87_0.13', [0.87, 0.13]);
    const nose = blendMeshes([noseStraight, noseButton], 'nose_blend_0.42_0.58', [0.42, 0.58]);

    return [face, nose, glasses, ...hair].filter(Boolean);
  }

  function draw() {
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#090b12';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#9ed0ff';
    ctx.font = '12px system-ui';
    ctx.fillText('Smallverse v3 mesh debug renderer', 12, 18);

    if (!parsedMeshes.length) {
      ctx.fillStyle = '#ff8a8a';
      ctx.fillText(status === 'error' ? error : 'No parsed meshes yet', 12, 42);
      return;
    }

    const meshesToDraw = displayMeshes();
    const b = bounds(meshesToDraw);
    const dx = b.maxX - b.minX || 1;
    const dy = b.maxY - b.minY || 1;
    const scale = Math.min((width - 80) / dx, (height - 70) / dy) * 0.9;

    function project(p) {
      return {
        x: width / 2 + (p.x - (b.minX + dx / 2)) * scale,
        y: height / 2 - (p.y - (b.minY + dy / 2)) * scale
      };
    }

    ctx.lineWidth = 0.45;

    meshesToDraw.forEach((mesh, idx) => {
      ctx.strokeStyle = `hsl(${(idx * 53) % 360} 80% 65% / 0.75)`;

      for (const f of mesh.faces) {
        const a = mesh.vertices[f.a];
        const b = mesh.vertices[f.b];
        const c = mesh.vertices[f.c];
        if (!a || !b || !c) continue;

        const pa = project(a);
        const pb = project(b);
        const pc = project(c);

        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.lineTo(pc.x, pc.y);
        ctx.closePath();
        ctx.stroke();
      }
    });

    ctx.fillStyle = '#e8eef8';
    ctx.font = '11px system-ui';
    ctx.fillText(`${parsedMeshes.length} raw mesh XML objects · ${meshesToDraw.length} display meshes`, 12, height - 34);
    ctx.fillText(`${parsedMeshes.reduce((n, m) => n + m.vertices.length, 0)} vertices · ${parsedMeshes.reduce((n, m) => n + m.faces.length, 0)} faces`, 12, height - 18);

    let y = 42;
    ctx.font = '10px system-ui';
    meshesToDraw.slice(0, 10).forEach((m, i) => {
      ctx.fillStyle = `hsl(${(i * 53) % 360} 80% 70%)`;
      ctx.fillText(`${i}: ${m.name} · ${m.vertices.length}v/${m.faces.length}f`, 12, y);
      y += 12;
    });
  }

  async function load() {
    if (!avatarId) return;

    status = 'loading';
    error = '';
    bundle = null;
    parsedMeshes = [];

    try {
      const bundleUrl = `/avatar-renders/${avatarId}/render-bundle.v3.json`;
      const br = await fetch(bundleUrl);
      if (!br.ok) throw new Error(`bundle ${br.status} ${br.statusText}`);
      bundle = await br.json();

      const meshes = bundle?.head?.meshes ?? [];
      const parsed = [];

      for (const mesh of meshes) {
        const url = mesh.url || `/avatar-assets/${mesh.ref}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${mesh.ref}: ${r.status} ${r.statusText}`);

        const xml = await r.text();
        parsed.push(...parseO3D(xml, mesh.ref));
      }

      parsedMeshes = parsed;
      status = 'ready';

      requestAnimationFrame(draw);
    } catch (e) {
      status = 'error';
      error = e?.message || String(e);
      requestAnimationFrame(draw);
    }
  }

  onMount(load);

  $: if (canvas && avatarId) {
    load();
  }
</script>

<div class="box">
  <canvas bind:this={canvas} {width} {height}></canvas>

  <div class="meta">
    {#if status === 'loading'}
      loading v3 bundle…
    {:else if status === 'error'}
      <span class="bad">{error}</span>
    {:else}
      <span>v3 loaded · {bundle?.stats?.head_mesh_count ?? 0} head mesh refs · {parsedMeshes.length} parsed mesh nodes</span>
    {/if}
  </div>
</div>

<style>
  .box {
    display: grid;
    gap: 8px;
  }

  canvas {
    width: 100%;
    max-width: 520px;
    height: auto;
    border-radius: 10px;
    background: #090b12;
    border: 1px solid rgba(255,255,255,0.12);
  }

  .meta {
    font-size: 12px;
    color: rgba(232,238,248,0.75);
  }

  .bad {
    color: #ff8a8a;
  }
</style>
