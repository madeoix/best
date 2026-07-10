import * as THREE from 'three';

function getBitmap(texture) {
  return texture?.source?.data ?? texture?.image ?? null;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value ?? 1)));
}

function getBlendMode(value) {
  const mode = String(value ?? 'normal').toLowerCase();

  if (mode === 'add' || mode === 'additive') return 'lighter';
  if (mode === 'multiply') return 'multiply';
  if (mode === 'screen') return 'screen';
  if (mode === 'overlay') return 'overlay';

  return 'source-over';
}

function getAlphaBounds(bitmap) {
  const width =
    bitmap?.naturalWidth ??
    bitmap?.videoWidth ??
    bitmap?.width ??
    0;

  const height =
    bitmap?.naturalHeight ??
    bitmap?.videoHeight ??
    bitmap?.height ??
    0;

  if (!width || !height) {
    return {
      minX: 0,
      minY: 0,
      maxX: Math.max(1, width),
      maxY: Math.max(1, height)
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', {
    willReadFrequently: true
  });

  if (!context) {
    return { minX: 0, minY: 0, maxX: width, maxY: height };
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);

  let pixels;

  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    return { minX: 0, minY: 0, maxX: width, maxY: height };
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = pixels[(y * width + x) * 4 + 3];

      if (alpha === 0) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return { minX: 0, minY: 0, maxX: width, maxY: height };
  }

  return {
    minX,
    minY,
    maxX: maxX + 1,
    maxY: maxY + 1
  };
}

function getTransformedBounds(sprite, bitmap, alphaBounds) {
  const width =
    bitmap?.naturalWidth ??
    bitmap?.videoWidth ??
    bitmap?.width ??
    1;

  const height =
    bitmap?.naturalHeight ??
    bitmap?.videoHeight ??
    bitmap?.height ??
    1;

  const x = Number(sprite.transform?.x ?? 512);
  const y = Number(sprite.transform?.y ?? 256);
  const scaleX = Number(sprite.transform?.scaleX ?? 1) || 1;
  const scaleY = Number(sprite.transform?.scaleY ?? 1) || 1;

  const ax0 = x + (alphaBounds.minX - width / 2) * scaleX;
  const ax1 = x + (alphaBounds.maxX - width / 2) * scaleX;
  const ay0 = y + (alphaBounds.minY - height / 2) * scaleY;
  const ay1 = y + (alphaBounds.maxY - height / 2) * scaleY;

  return {
    minX: Math.min(ax0, ax1),
    minY: Math.min(ay0, ay1),
    maxX: Math.max(ax0, ax1),
    maxY: Math.max(ay0, ay1)
  };
}

function intersectionRatio(a, b) {
  const width =
    Math.min(a.maxX, b.maxX) -
    Math.max(a.minX, b.minX);

  const height =
    Math.min(a.maxY, b.maxY) -
    Math.max(a.minY, b.minY);

  if (width <= 0 || height <= 0) return 0;

  const intersection = width * height;

  const areaA =
    Math.max(1, (a.maxX - a.minX) * (a.maxY - a.minY));

  const areaB =
    Math.max(1, (b.maxX - b.minX) * (b.maxY - b.minY));

  return intersection / Math.min(areaA, areaB);
}

function clusterLayers(layers) {
  const parents = layers.map((_, index) => index);

  function find(index) {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }

    return index;
  }

  function union(a, b) {
    const rootA = find(a);
    const rootB = find(b);

    if (rootA !== rootB) parents[rootB] = rootA;
  }

  for (let a = 0; a < layers.length; a++) {
    for (let b = a + 1; b < layers.length; b++) {
      if (
        intersectionRatio(
          layers[a].designBounds,
          layers[b].designBounds
        ) >= 0.08
      ) {
        union(a, b);
      }
    }
  }

  const clusters = new Map();

  layers.forEach((layer, index) => {
    const root = find(index);

    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(layer);
  });

  return [...clusters.values()];
}

function unionBounds(layers) {
  return layers.reduce(
    (bounds, layer) => ({
      minX: Math.min(bounds.minX, layer.designBounds.minX),
      minY: Math.min(bounds.minY, layer.designBounds.minY),
      maxX: Math.max(bounds.maxX, layer.designBounds.maxX),
      maxY: Math.max(bounds.maxY, layer.designBounds.maxY)
    }),
    {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    }
  );
}

function composeCluster(layers, featureIndex) {
  const ordered = [...layers].sort(
    (a, b) => Number(a.sprite.index) - Number(b.sprite.index)
  );

  const bounds = unionBounds(ordered);

  const width = Math.max(1, Math.ceil(bounds.maxX - bounds.minX));
  const height = Math.max(1, Math.ceil(bounds.maxY - bounds.minY));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create head feature canvas');
  }

  context.clearRect(0, 0, width, height);

  for (const layer of ordered) {
    const sprite = layer.sprite;
    const bitmap = layer.bitmap;

    const bitmapWidth =
      bitmap?.naturalWidth ??
      bitmap?.videoWidth ??
      bitmap?.width ??
      1;

    const bitmapHeight =
      bitmap?.naturalHeight ??
      bitmap?.videoHeight ??
      bitmap?.height ??
      1;

    const x = Number(sprite.transform?.x ?? 512);
    const y = Number(sprite.transform?.y ?? 256);
    const scaleX = Number(sprite.transform?.scaleX ?? 1) || 1;
    const scaleY = Number(sprite.transform?.scaleY ?? 1) || 1;

    context.save();
    context.globalAlpha = clamp01(sprite.transform?.alpha);
    context.globalCompositeOperation = getBlendMode(
      sprite.transform?.blend
    );

    context.translate(
      x - bounds.minX,
      y - bounds.minY
    );

    context.scale(scaleX, scaleY);

    context.drawImage(
      bitmap,
      -bitmapWidth / 2,
      -bitmapHeight / 2,
      bitmapWidth,
      bitmapHeight
    );

    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;

  const firstIndex = Math.min(
    ...ordered.map((layer) => Number(layer.sprite.index ?? 0))
  );

  const centerX = bounds.minX + width / 2;
  const centerY = bounds.minY + height / 2;

  return {
    index: featureIndex,
    firstIndex,
    texture,
    bounds: {
      ...bounds,
      width,
      height,
      centerX,
      centerY
    },
    anchor: {
      index: firstIndex,
      label: `feature-${featureIndex}`,
      transform: {
        x: centerX,
        y: centerY,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        blend: 'normal'
      }
    },
    sprites: ordered.map((layer) => layer.sprite)
  };
}

export async function composeHeadFeatures(
  sprites,
  loadTexture
) {
  const texturePromises = new Map();

  function getTexture(url) {
    if (!texturePromises.has(url)) {
      texturePromises.set(url, loadTexture(url));
    }

    return texturePromises.get(url);
  }

  const layers = await Promise.all(
    sprites.map(async (sprite) => {
      const texture = await getTexture(sprite.src);
      const bitmap = getBitmap(texture);

      if (!bitmap) {
        throw new Error(
          `Head feature bitmap unavailable: ${sprite.src}`
        );
      }

      const alphaBounds = getAlphaBounds(bitmap);

      return {
        sprite,
        texture,
        bitmap,
        alphaBounds,
        designBounds: getTransformedBounds(
          sprite,
          bitmap,
          alphaBounds
        )
      };
    })
  );

  return clusterLayers(layers)
    .sort((a, b) => {
      const indexA = Math.min(
        ...a.map((layer) => Number(layer.sprite.index ?? 0))
      );

      const indexB = Math.min(
        ...b.map((layer) => Number(layer.sprite.index ?? 0))
      );

      return indexA - indexB;
    })
    .map(composeCluster);
}
