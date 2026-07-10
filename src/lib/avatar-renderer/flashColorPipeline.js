const RED_LUMINANCE = 0.212671;
const GREEN_LUMINANCE = 0.71516;
const BLUE_LUMINANCE = 0.072169;

const IDENTITY_MATRIX = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0
];

const DEFAULT_LINK_TRANSFORM = Object.freeze({
  colorValue: 0xffffff,
  color: '#ffffff',
  amount: 0,
  alpha: 0,
  brightness: 0,
  contrast: 0
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function colorInteger(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return (number >>> 0) & 0xffffff;
}

function colorHex(value) {
  return `#${colorInteger(value).toString(16).padStart(6, '0')}`;
}

function parseLinkWrite(attrs) {
  // Mirrors AvatarColorizeFilter.importFromXML exactly.
  if (hasOwn(attrs, 'lw')) {
    return String(attrs.lw) === 'Y';
  }

  if (hasOwn(attrs, 'linkWrite')) {
    return String(attrs.linkWrite) === 'true';
  }

  return true;
}

function normalizeColorRecord(record, index) {
  const attrs = record?.attrs ?? {};

  const colorValue = colorInteger(
    attrs.c ?? attrs.color,
    0
  );

  const amount = finiteNumber(
    attrs.a ?? attrs.amount,
    0
  );

  return {
    index,

    optionId:
      record?.option_id ??
      record?.optionId ??
      null,

    selectedId:
      record?.selected_id ??
      record?.selectedId ??
      null,

    stepId:
      attrs.sId ??
      attrs.stepId ??
      null,

    linkId:
      attrs.lId ??
      attrs.linkId ??
      null,

    linkWrite: parseLinkWrite(attrs),

    linkPriority: finiteNumber(
      attrs.lp ?? attrs.linkPriority,
      0
    ),

    colorValue,
    color: colorHex(colorValue),

    amount,
    alpha: amount,

    brightness: finiteNumber(
      attrs.b ?? attrs.brightness,
      0
    ),

    contrast: finiteNumber(
      attrs.ct ?? attrs.contrast,
      0
    ),

    represented: false,
    rawAttrs: attrs
  };
}

function ownTransform(record) {
  return {
    colorValue: record.colorValue,
    color: record.color,
    amount: record.amount,
    alpha: record.amount,
    brightness: record.brightness,
    contrast: record.contrast
  };
}

/**
 * Reproduces AvatarColorizeFilter's shared lId/lw/lp state.
 *
 * Important details from Flash:
 *
 * - Writers publish before their local representation is created.
 * - An existing writer blocks another writer only when the existing writer is
 *   represented and has strictly greater priority.
 * - Equal priority therefore allows the later writer to replace the earlier.
 * - Readers eventually receive the final shared settings through the
 *   settingsChanged event.
 * - Readers with no writer receive AvatarColorizeSettings defaults.
 */
export function buildFlashAvatarColorPipeline(
  colorRecords,
  {
    representedStepIds = null
  } = {}
) {
  const represented =
    representedStepIds instanceof Set
      ? representedStepIds
      : null;

  const records = (colorRecords ?? []).map(
    normalizeColorRecord
  );

  const linkStates = new Map();

  for (const record of records) {
    if (record.linkId) {
      let state = linkStates.get(record.linkId);

      if (!state) {
        state = {
          linkId: record.linkId,
          writer: null,
          transform: { ...DEFAULT_LINK_TRANSFORM }
        };

        linkStates.set(record.linkId, state);
      }

      if (record.linkWrite) {
        const existingWriter = state.writer;

        const blocked =
          existingWriter &&
          existingWriter.represented &&
          existingWriter.linkPriority >
            record.linkPriority;

        if (!blocked) {
          state.writer = record;
          state.transform = ownTransform(record);
        }
      }
    }

    // AvatarColorizeFilter performs the link update before calling the
    // AvatarCompositeFilter representation creation.
    record.represented = Boolean(
      record.stepId &&
      (
        represented === null ||
        represented.has(record.stepId)
      )
    );
  }

  const resolvedRecords = records.map((record) => {
    let effective = ownTransform(record);
    let linkedFrom = null;
    let strategy = 'local-filter';

    if (record.linkId && !record.linkWrite) {
      const state = linkStates.get(record.linkId);

      effective = state
        ? { ...state.transform }
        : { ...DEFAULT_LINK_TRANSFORM };

      linkedFrom = state?.writer
        ? {
            index: state.writer.index,
            optionId: state.writer.optionId,
            selectedId: state.writer.selectedId,
            stepId: state.writer.stepId,
            represented: state.writer.represented
          }
        : null;

      strategy = linkedFrom
        ? 'linked-reader'
        : 'linked-reader-defaults';
    } else if (record.linkId && record.linkWrite) {
      strategy = 'linked-writer';
    }

    return {
      index: record.index,

      optionId: record.optionId,
      selectedId: record.selectedId,

      stepId: record.stepId,
      sourceId: record.stepId,

      linkId: record.linkId,
      linkWrite: record.linkWrite,
      linkPriority: record.linkPriority,

      represented: record.represented,
      strategy,
      linkedFrom,

      colorValue: effective.colorValue,
      color: effective.color,

      amount: effective.amount,
      alpha: effective.amount,

      brightness: effective.brightness,
      contrast: effective.contrast,

      original: {
        colorValue: record.colorValue,
        color: record.color,
        amount: record.amount,
        alpha: record.amount,
        brightness: record.brightness,
        contrast: record.contrast
      }
    };
  });

  // CompositeStep.addFilter() pushes filters in representation/manifest order.
  const filtersByStepId = {};

  for (const record of resolvedRecords) {
    if (!record.stepId) {
      // Pure link writers, such as BlusherColorOptions, intentionally publish
      // settings without attaching a bitmap filter to a composite step.
      continue;
    }

    if (!filtersByStepId[record.stepId]) {
      filtersByStepId[record.stepId] = [];
    }

    filtersByStepId[record.stepId].push(record);
  }

  const links = {};

  for (const [linkId, state] of linkStates) {
    links[linkId] = {
      linkId,

      writer: state.writer
        ? {
            index: state.writer.index,
            optionId: state.writer.optionId,
            selectedId: state.writer.selectedId,
            stepId: state.writer.stepId,
            represented: state.writer.represented,
            linkPriority: state.writer.linkPriority
          }
        : null,

      transform: { ...state.transform }
    };
  }

  return {
    strategy: 'flash-avatar-color-pipeline',
    filterOrder:
      'manifest-order: colorize -> brightness -> contrast',

    records: resolvedRecords,
    filtersByStepId,
    links
  };
}

/**
 * This is the exact ColorMatrix.concat behavior from the decompiled class.
 *
 * The newly supplied matrix is multiplied on the left:
 *
 *     result = next × current
 */
function concatFlashMatrix(current, next) {
  const result = new Array(20);

  let rowOffset = 0;

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      result[rowOffset + column] =
        next[rowOffset] *
          current[column] +

        next[rowOffset + 1] *
          current[column + 5] +

        next[rowOffset + 2] *
          current[column + 10] +

        next[rowOffset + 3] *
          current[column + 15] +

        (
          column === 4
            ? next[rowOffset + 4]
            : 0
        );
    }

    rowOffset += 5;
  }

  return result;
}

function colorizeMatrix(colorValue, amount) {
  const red =
    ((colorValue >> 16) & 0xff) / 255;

  const green =
    ((colorValue >> 8) & 0xff) / 255;

  const blue =
    (colorValue & 0xff) / 255;

  const inverse = 1 - amount;

  return [
    inverse +
      amount * red * RED_LUMINANCE,
    amount * red * GREEN_LUMINANCE,
    amount * red * BLUE_LUMINANCE,
    0,
    0,

    amount * green * RED_LUMINANCE,
    inverse +
      amount * green * GREEN_LUMINANCE,
    amount * green * BLUE_LUMINANCE,
    0,
    0,

    amount * blue * RED_LUMINANCE,
    amount * blue * GREEN_LUMINANCE,
    inverse +
      amount * blue * BLUE_LUMINANCE,
    0,
    0,

    0, 0, 0, 1, 0
  ];
}

function brightnessMatrix(brightness) {
  return [
    1, 0, 0, 0, brightness,
    0, 1, 0, 0, brightness,
    0, 0, 1, 0, brightness,
    0, 0, 0, 1, 0
  ];
}

function contrastMatrix(contrast) {
  const factor = contrast + 1;
  const offset = 128 * (1 - factor);

  return [
    factor, 0, 0, 0, offset,
    0, factor, 0, 0, offset,
    0, 0, factor, 0, offset,
    0, 0, 0, 1, 0
  ];
}

/**
 * Builds the exact single AvatarColorizeFilter matrix:
 *
 * reset
 * -> colorize(c, a)
 * -> adjustBrightness(b)
 * -> adjustContrast(ct)
 */
export function createFlashAvatarColorMatrix(filter) {
  let matrix = IDENTITY_MATRIX.slice();

  matrix = concatFlashMatrix(
    matrix,
    colorizeMatrix(
      colorInteger(
        filter?.colorValue ??
        filter?.color ??
        0
      ),
      finiteNumber(
        filter?.amount ??
        filter?.alpha,
        0
      )
    )
  );

  matrix = concatFlashMatrix(
    matrix,
    brightnessMatrix(
      finiteNumber(filter?.brightness, 0)
    )
  );

  matrix = concatFlashMatrix(
    matrix,
    contrastMatrix(
      finiteNumber(filter?.contrast, 0)
    )
  );

  return matrix;
}

export function applyFlashColorMatrixToImageData(
  imageData,
  matrix
) {
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];

    // Uint8ClampedArray assignment performs the required per-filter clamp and
    // integer conversion before the next BitmapFilter is applied.
    pixels[index] =
      matrix[0] * red +
      matrix[1] * green +
      matrix[2] * blue +
      matrix[3] * alpha +
      matrix[4];

    pixels[index + 1] =
      matrix[5] * red +
      matrix[6] * green +
      matrix[7] * blue +
      matrix[8] * alpha +
      matrix[9];

    pixels[index + 2] =
      matrix[10] * red +
      matrix[11] * green +
      matrix[12] * blue +
      matrix[13] * alpha +
      matrix[14];

    pixels[index + 3] =
      matrix[15] * red +
      matrix[16] * green +
      matrix[17] * blue +
      matrix[18] * alpha +
      matrix[19];
  }

  return imageData;
}

/**
 * CompositeStep applies each BitmapFilter separately and in array order.
 * We deliberately quantize between filters by modifying ImageData in place.
 */
export function applyFlashColorFilterStackToImageData(
  imageData,
  filters
) {
  for (const filter of filters ?? []) {
    const matrix =
      createFlashAvatarColorMatrix(filter);

    applyFlashColorMatrixToImageData(
      imageData,
      matrix
    );
  }

  return imageData;
}
