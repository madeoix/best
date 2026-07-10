import * as THREE from 'three';

import {
  applyFlashColorFilterStackToImageData
} from './flashColorPipeline.js';

const ATLAS_WIDTH = 1024;
const ATLAS_HEIGHT = 512;

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : fallback;
}

function spriteSource(sprite) {
  return (
    sprite?.src ??
    sprite?.url ??
    sprite?.ref ??
    sprite?.attrs?.src ??
    sprite?.attrs?.url ??
    null
  );
}

function spriteLabel(sprite) {
  return (
    sprite?.label ??
    sprite?.id ??
    sprite?.name ??
    sprite?.cId ??
    sprite?.sId ??
    sprite?.attrs?.sId ??
    sprite?.attrs?.id ??
    sprite?.attrs?.name ??
    null
  );
}

function spriteIndex(sprite, fallback) {
  return finiteNumber(
    sprite?.index ??
    sprite?.attrs?.index,
    fallback
  );
}

function spriteTransform(sprite) {
  const transform = sprite?.transform ?? {};
  const attrs = sprite?.attrs ?? {};

  return {
    x: finiteNumber(
      transform.x ?? attrs.x,
      0
    ),

    y: finiteNumber(
      transform.y ?? attrs.y,
      0
    ),

    scaleX: finiteNumber(
      transform.scaleX ??
      transform.sx ??
      attrs.scaleX ??
      attrs.sx,
      1
    ),

    scaleY: finiteNumber(
      transform.scaleY ??
      transform.sy ??
      attrs.scaleY ??
      attrs.sy,
      1
    ),

    alpha: finiteNumber(
      transform.alpha ??
      attrs.alpha ??
      attrs.a,
      1
    ),

    blend:
      transform.blend ??
      attrs.blend ??
      attrs.blendMode ??
      'normal'
  };
}

function canvasBlendMode(value) {
  switch (String(value ?? 'normal').toLowerCase()) {
    case 'add':
    case 'lighten-add':
      return 'lighter';

    case 'multiply':
      return 'multiply';

    case 'screen':
      return 'screen';

    case 'overlay':
      return 'overlay';

    case 'darken':
      return 'darken';

    case 'lighten':
      return 'lighten';

    case 'difference':
      return 'difference';

    case 'hardlight':
    case 'hard-light':
      return 'hard-light';

    default:
      return 'source-over';
  }
}

function resolveBitmap(loaded) {
  return (
    loaded?.image ??
    loaded?.bitmap ??
    loaded?.source?.data ??
    loaded?.texture?.image ??
    loaded
  );
}

function bitmapDimensions(bitmap) {
  return {
    width:
      bitmap?.naturalWidth ??
      bitmap?.videoWidth ??
      bitmap?.width ??
      0,

    height:
      bitmap?.naturalHeight ??
      bitmap?.videoHeight ??
      bitmap?.height ??
      0
  };
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return canvas;
}

function compactFilterDiagnostics(filter) {
  return {
    index: filter.index,

    strategy: filter.strategy,

    optionId: filter.optionId,
    selectedId: filter.selectedId,

    sourceId: filter.sourceId,

    linkId: filter.linkId,
    linkWrite: filter.linkWrite,
    linkPriority: filter.linkPriority,

    linkedFrom: filter.linkedFrom,

    color: filter.color,
    amount: filter.amount,
    brightness: filter.brightness,
    contrast: filter.contrast
  };
}

export async function composeHeadAtlas(
  sprites,
  loadSpriteTexture,
  materialContext = null
) {
  if (typeof document === 'undefined') {
    throw new Error(
      'composeHeadAtlas requires a browser DOM'
    );
  }

  if (typeof loadSpriteTexture !== 'function') {
    throw new TypeError(
      'loadSpriteTexture must be a function'
    );
  }

  const atlasCanvas =
    createCanvas(ATLAS_WIDTH, ATLAS_HEIGHT);

  const atlasContext =
    atlasCanvas.getContext('2d', {
      willReadFrequently: true
    });

  if (!atlasContext) {
    throw new Error(
      'Could not create the head atlas 2D context'
    );
  }

  atlasContext.clearRect(
    0,
    0,
    ATLAS_WIDTH,
    ATLAS_HEIGHT
  );

  atlasContext.imageSmoothingEnabled = true;

  const orderedSprites = (sprites ?? [])
    .map((sprite, originalIndex) => ({
      sprite,
      originalIndex,
      index: spriteIndex(
        sprite,
        originalIndex
      )
    }))
    .sort((left, right) => {
      if (left.index !== right.index) {
        return left.index - right.index;
      }

      return (
        left.originalIndex -
        right.originalIndex
      );
    });

  const filtersByStepId =
    materialContext?.filtersByStepId ?? {};

  const layers = [];

  let filteredLayerCount = 0;
  let appliedFilterCount = 0;

  for (const entry of orderedSprites) {
    const sprite = entry.sprite;

    const label = spriteLabel(sprite);
    const source = spriteSource(sprite);
    const transform = spriteTransform(sprite);

    if (!source) {
      layers.push({
        index: entry.index,
        label,
        source: null,
        skipped: 'missing-source'
      });

      continue;
    }

    let loaded;

    try {
      loaded = await loadSpriteTexture(
        source,
        sprite
      );
    } catch (error) {
      layers.push({
        index: entry.index,
        label,
        source,
        skipped: 'load-failed',
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });

      continue;
    }

    const bitmap = resolveBitmap(loaded);
    const { width, height } =
      bitmapDimensions(bitmap);

    if (!bitmap || width <= 0 || height <= 0) {
      layers.push({
        index: entry.index,
        label,
        source,
        skipped: 'invalid-bitmap',
        bitmapSize: [width, height]
      });

      continue;
    }

    const layerCanvas =
      createCanvas(width, height);

    const layerContext =
      layerCanvas.getContext('2d', {
        willReadFrequently: true
      });

    if (!layerContext) {
      throw new Error(
        `Could not create layer context for ${source}`
      );
    }

    layerContext.clearRect(
      0,
      0,
      width,
      height
    );

    layerContext.drawImage(
      bitmap,
      0,
      0,
      width,
      height
    );

    const filters = label
      ? filtersByStepId[label] ?? []
      : [];

    if (filters.length > 0) {
      const imageData =
        layerContext.getImageData(
          0,
          0,
          width,
          height
        );

      applyFlashColorFilterStackToImageData(
        imageData,
        filters
      );

      layerContext.putImageData(
        imageData,
        0,
        0
      );

      filteredLayerCount += 1;
      appliedFilterCount += filters.length;
    }

    atlasContext.save();

    atlasContext.globalAlpha =
      transform.alpha;

    atlasContext.globalCompositeOperation =
      canvasBlendMode(transform.blend);

    atlasContext.translate(
      transform.x,
      transform.y
    );

    atlasContext.scale(
      transform.scaleX,
      transform.scaleY
    );

    // SmallVerse composite-step coordinates place the sprite around its
    // center. Negative scale values mirror around the same anchor.
    atlasContext.drawImage(
      layerCanvas,
      -width / 2,
      -height / 2
    );

    atlasContext.restore();

    layers.push({
      index: entry.index,
      label,
      src: source,

      bitmapSize: [
        width,
        height
      ],

      transform,

      filterCount: filters.length,

      filters:
        filters.map(
          compactFilterDiagnostics
        )
    });
  }

  const texture =
    new THREE.CanvasTexture(atlasCanvas);

  texture.name = 'smallverse-head-atlas';

  texture.colorSpace =
    THREE.SRGBColorSpace;

  texture.flipY = true;

  texture.minFilter =
    THREE.LinearFilter;

  texture.magFilter =
    THREE.LinearFilter;

  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return {
    texture,
    canvas: atlasCanvas,

    width: ATLAS_WIDTH,
    height: ATLAS_HEIGHT,

    size: [
      ATLAS_WIDTH,
      ATLAS_HEIGHT
    ],

    sourceSpriteCount:
      orderedSprites.length,

    filteredLayerCount,
    appliedFilterCount,

    filterStrategy:
      'flash-linked-ordered-filter-stack',

    layers,

    diagnostics: {
      strategy:
        'flash-linked-ordered-filter-stack',

      filterOrder:
        'manifest order; each filter: colorize -> brightness -> contrast',

      sourceSpriteCount:
        orderedSprites.length,

      filteredLayerCount,
      appliedFilterCount,

      linkCount:
        Object.keys(
          materialContext?.links ?? {}
        ).length
    }
  };
}

export default composeHeadAtlas;
