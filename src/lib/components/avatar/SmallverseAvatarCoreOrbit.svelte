<script>
  import { onMount, onDestroy } from 'svelte';

  export let avatarId;
  export let name = 'Unknown Avatar';
  export let rarity = 'Verified';
  export let evidence = 'Captured Flash render';

  let canvas;
  let raf = 0;
  let fullImg;
  let thumbImg;
  let mx = 0;
  let my = 0;

  const shards = ['CONFIG', 'FLASH', 'PNG', 'SWF', 'O3D', 'LIVE', 'AMF', 'ORACLE'];

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function resize(ctx) {
    const dpr = window.devicePixelRatio || 1;
    const w = 720;
    const h = 560;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function project3d(x, y, z, cx, cy) {
    const camera = 520;
    const scale = camera / (camera + z);
    return {
      x: cx + x * scale,
      y: cy + y * scale,
      scale,
      z
    };
  }

  function drawEllipse(ctx, cx, cy, rx, ry, rot, alpha, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawLabel(ctx, text, x, y, scale, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    ctx.font = '10px system-ui';
    const padX = 8;
    const padY = 5;
    const tw = ctx.measureText(text).width;
    const w = tw + padX * 2;
    const h = 22;

    ctx.fillStyle = 'rgba(5, 9, 18, 0.86)';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(240,246,255,0.88)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);

    ctx.restore();
  }

  function drawCore(ctx, t, w, h) {
    const cx = w / 2;
    const cy = h / 2 + 10;

    ctx.clearRect(0, 0, w, h);

    // deep glow
    const glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, 260);
    glow.addColorStop(0, 'rgba(95,170,255,0.28)');
    glow.addColorStop(0.38, 'rgba(255,220,110,0.13)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // animated beam
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(t * 1.8) * 0.08;
    ctx.translate(cx + Math.sin(t) * 8, cy);
    ctx.rotate(Math.sin(t * 0.7) * 0.06);
    const beam = ctx.createLinearGradient(0, -260, 0, 260);
    beam.addColorStop(0, 'rgba(0,0,0,0)');
    beam.addColorStop(0.5, 'rgba(120,190,255,0.35)');
    beam.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(-45, -260, 90, 520);
    ctx.restore();

    // camera tilt
    const tiltX = my * 24;
    const tiltY = mx * 28;

    // rings, alive not static
    drawEllipse(ctx, cx, cy + 78, 170, 34, t * 0.8, 0.35, 'rgba(120,190,255,0.75)');
    drawEllipse(ctx, cx, cy + 70, 135, 25, -t * 1.1 + 0.8, 0.32, 'rgba(255,220,120,0.75)');
    drawEllipse(ctx, cx, cy + 64, 220, 44, t * 0.45 + 1.4, 0.18, 'rgba(190,130,255,0.72)');

    // orbiting shards with true depth sort
    const orbitItems = [];
    for (let i = 0; i < shards.length; i++) {
      const a = t * 1.1 + (i / shards.length) * Math.PI * 2;
      const r = 215;
      const x = Math.cos(a) * r + tiltY;
      const z = Math.sin(a) * r;
      const y = Math.sin(a * 2.0 + i) * 32 + tiltX;

      orbitItems.push({
        label: shards[i],
        ...project3d(x, y, z, cx, cy),
        a
      });
    }

    orbitItems.sort((a, b) => a.z - b.z);

    // behind shards
    for (const item of orbitItems.filter((x) => x.z < 0)) {
      drawLabel(ctx, item.label, item.x, item.y, 0.72 * item.scale, 0.28 + item.scale * 0.28);
    }

    // card/core glass
    ctx.save();
    ctx.translate(cx + tiltY * 0.12, cy + tiltX * 0.08);
    ctx.fillStyle = 'rgba(8,13,27,0.76)';
    ctx.strokeStyle = 'rgba(130,190,255,0.30)';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(80,160,255,0.35)';
    ctx.shadowBlur = 32;
    ctx.beginPath();
    ctx.roundRect(-158, -205, 316, 410, 24);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // title
    ctx.save();
    ctx.fillStyle = '#ffd86e';
    ctx.font = '10px system-ui';
    ctx.fillText(rarity.toUpperCase(), cx - 138, cy - 178);
    ctx.fillStyle = 'rgba(232,238,248,0.58)';
    ctx.textAlign = 'right';
    ctx.fillText(evidence.toUpperCase(), cx + 138, cy - 178);

    ctx.textAlign = 'left';
    ctx.font = '21px system-ui';
    ctx.fillStyle = '#f5f8ff';
    ctx.fillText(name, cx - 138, cy - 150);
    ctx.restore();

    // summon circle
    drawEllipse(ctx, cx, cy + 112, 86, 19, t * 1.9, 0.52, 'rgba(255,220,120,0.85)');

    // avatar core
    if (fullImg) {
      const bob = Math.sin(t * 2.1) * 7;
      ctx.save();
      ctx.translate(cx, cy + 28 + bob);
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 24;
      ctx.drawImage(fullImg, -64, -128, 128, 256);
      ctx.restore();
    }

    // thumb icon, like item icon
    if (thumbImg) {
      ctx.save();
      ctx.translate(cx - 118, cy - 110);
      ctx.fillStyle = 'rgba(0,0,0,0.40)';
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.roundRect(-32, -32, 64, 64, 12);
      ctx.fill();
      ctx.stroke();
      ctx.drawImage(thumbImg, -28, -28, 56, 56);
      ctx.restore();
    }

    // front shards
    for (const item of orbitItems.filter((x) => x.z >= 0)) {
      drawLabel(ctx, item.label, item.x, item.y, 0.72 * item.scale, 0.48 + item.scale * 0.42);
    }

    // sparkle particles
    ctx.save();
    for (let i = 0; i < 36; i++) {
      const a = t * (0.5 + (i % 5) * 0.08) + i * 1.73;
      const r = 95 + (i % 7) * 22;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a * 1.7) * 95;
      const pulse = 0.35 + Math.sin(t * 3 + i) * 0.25;
      ctx.globalAlpha = Math.max(0.06, pulse);
      ctx.fillStyle = i % 3 === 0 ? '#ffd86e' : '#8fc7ff';
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + (i % 3) * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // panels
    drawLabel(ctx, 'RENDER: FLASH VERIFIED', cx - 215, cy + 50, 0.95, 0.82);
    drawLabel(ctx, 'ORACLE: PNG CAPTURED', cx + 220, cy + 76, 0.95, 0.82);
  }

  async function boot() {
    const ctx = canvas.getContext('2d');
    const dims = resize(ctx);

    [fullImg, thumbImg] = await Promise.all([
      loadImage(`/avatar-oracles/${avatarId}/flash-full-body.png`),
      loadImage(`/avatar-oracles/${avatarId}/flash-thumb.png`)
    ]);

    const loop = (ms) => {
      drawCore(ctx, ms / 1000, dims.w, dims.h);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
  }

  function pointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    mx = (e.clientX - rect.left) / rect.width - 0.5;
    my = (e.clientY - rect.top) / rect.height - 0.5;
  }

  function pointerLeave() {
    mx = 0;
    my = 0;
  }

  onMount(boot);
  onDestroy(() => cancelAnimationFrame(raf));
</script>

<canvas
  bind:this={canvas}
  on:pointermove={pointerMove}
  on:pointerleave={pointerLeave}
  aria-label="Animated avatar core"
/>

<style>
  canvas {
    display: block;
    max-width: 100%;
    border-radius: 18px;
  }
</style>
