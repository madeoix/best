const DEFAULT_SKIN = '#d7a27b';

const SKIN_COLORS = Object.freeze({
  skincolortan: '#c99069',
  skincolorpink: '#efb198',
  skincolorpale: '#f2c7ae',
  skincolorlight: '#e8b892',
  skincolormedium: '#c88c63',
  skincolordark: '#85563f',
  skincoloreggshell: '#e8c2ab',
  skincolorpeach: '#e6ad87',
  skincolorredbrown: '#9a6049'
});

const CLOTHING_COLORS = Object.freeze({
  white: '#f2f2f2',
  black: '#202226',
  brown: '#6f4b32',
  yellow: '#d8b13b',
  red: '#b63c3c',
  blue: '#3f6f9d',
  green: '#4b7d55'
});

function token(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function colorFromOption(value, fallback) {
  const key = token(value);

  if (!key) return fallback;
  if (SKIN_COLORS[key]) return SKIN_COLORS[key];

  for (const [name, color] of Object.entries(CLOTHING_COLORS)) {
    if (key.includes(name)) return color;
  }

  return fallback;
}

function normalizeGender(value) {
  return token(value).includes('male') && !token(value).includes('female')
    ? 'male'
    : 'female';
}

/**
 * Resolve the small base-body palette and the calibrated forward head slot.
 *
 * This is deliberately separate from animation planning. Animation frames,
 * cells, offsets, and mirrors come from avatar.xml; these values only fill the
 * recovered client's `composite` textures until equipped item XML is compiled.
 */
export function getAvatarBaseAppearance({ gender = 'female', selectedOptions = {} } = {}) {
  const resolvedGender = normalizeGender(
    selectedOptions.GenderOptions ?? gender
  );

  const skin = colorFromOption(
    selectedOptions.SkinColorOptions,
    resolvedGender === 'male' ? '#d99b70' : DEFAULT_SKIN
  );

  const top = colorFromOption(selectedOptions.TopColorOptions, '#f2f2f2');
  const bottom = colorFromOption(selectedOptions.BottomColorOptions, '#202226');

  return {
    gender: resolvedGender,
    colors: { skin, top, bottom },
    head: resolvedGender === 'male'
      ? { x: 24, y: 27, width: 80, height: 94 }
      : { x: 22, y: 24, width: 84, height: 98 }
  };
}

export function getForwardIdleRig({ gender = 'female', selectedOptions = {} } = {}) {
  const appearance = getAvatarBaseAppearance({ gender, selectedOptions });
  const { gender: resolvedGender, colors, head } = appearance;
  const { skin, top, bottom } = colors;

  return {
    canvas: { width: 128, height: 256 },
    gender: resolvedGender,
    colors,
    head,
    layers: [
      {
        id: 'shadow',
        url: '/avatar-assets/avatars/body/base/unisex/shadow.png',
        x: 32,
        y: 215,
        cols: 1,
        rows: 1,
        col: 0,
        row: 0,
        tint: null
      },
      {
        id: 'left-leg-skin',
        url: '/avatar-assets/avatars/body/base/unisex/leg_idle.png',
        x: 38,
        y: 127,
        cols: 4,
        rows: 2,
        col: 2,
        row: 0,
        tint: skin
      },
      {
        id: 'right-leg-skin',
        url: '/avatar-assets/avatars/body/base/unisex/leg_idle.png',
        x: 55,
        y: 127,
        cols: 4,
        rows: 2,
        col: 2,
        row: 1,
        tint: skin
      },
      {
        id: 'left-pants',
        url: '/avatar-assets/avatars/body/base/unisex/skinny_leg_idle.png',
        x: 38,
        y: 127,
        cols: 4,
        rows: 2,
        col: 2,
        row: 0,
        tint: bottom
      },
      {
        id: 'right-pants',
        url: '/avatar-assets/avatars/body/base/unisex/skinny_leg_idle.png',
        x: 55,
        y: 127,
        cols: 4,
        rows: 2,
        col: 2,
        row: 1,
        tint: bottom
      },
      {
        id: 'left-foot',
        url: '/avatar-assets/avatars/body/base/unisex/foot_idle.png',
        x: 38,
        y: 127,
        cols: 4,
        rows: 2,
        col: 2,
        row: 0,
        tint: skin
      },
      {
        id: 'right-foot',
        url: '/avatar-assets/avatars/body/base/unisex/foot_idle.png',
        x: 55,
        y: 127,
        cols: 4,
        rows: 2,
        col: 2,
        row: 1,
        tint: skin
      },
      {
        id: 'torso',
        url: `/avatar-assets/avatars/body/base/${resolvedGender}/tshirt_torso.png`,
        x: 42,
        y: 88,
        cols: 5,
        rows: 1,
        col: 2,
        row: 0,
        tint: top
      },
      {
        id: 'left-arm-skin',
        url: '/avatar-assets/avatars/body/base/unisex/arm_idle.png',
        x: 29,
        y: 96,
        cols: 4,
        rows: 2,
        col: 2,
        row: 0,
        tint: skin
      },
      {
        id: 'right-arm-skin',
        url: '/avatar-assets/avatars/body/base/unisex/arm_idle.png',
        x: 71,
        y: 96,
        cols: 4,
        rows: 2,
        col: 2,
        row: 1,
        tint: skin
      },
      {
        id: 'left-sleeve',
        url: '/avatar-assets/items/base/consumables/clothing/shared/shr_short_arm_idle.png',
        x: 29,
        y: 96,
        cols: 4,
        rows: 2,
        col: 2,
        row: 0,
        tint: top
      },
      {
        id: 'right-sleeve',
        url: '/avatar-assets/items/base/consumables/clothing/shared/shr_short_arm_idle.png',
        x: 71,
        y: 96,
        cols: 4,
        rows: 2,
        col: 2,
        row: 1,
        tint: top
      }
    ]
  };
}

export function getSpriteFrame(image, layer) {
  const cols = Math.max(1, Number(layer.cols) || 1);
  const rows = Math.max(1, Number(layer.rows) || 1);
  const width = Math.floor(image.width / cols);
  const height = Math.floor(image.height / rows);
  const col = Math.max(0, Math.min(cols - 1, Number(layer.col) || 0));
  const row = Math.max(0, Math.min(rows - 1, Number(layer.row) || 0));

  return {
    sx: col * width,
    sy: row * height,
    width,
    height
  };
}

export function tintImageData(imageData, color) {
  if (!color) return imageData;

  const hex = String(color).replace('#', '');
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);

  if (![r, g, b].every(Number.isFinite)) return imageData;

  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;

    const luminance = (
      pixels[index] * 0.2126 +
      pixels[index + 1] * 0.7152 +
      pixels[index + 2] * 0.0722
    ) / 255;

    pixels[index] = Math.round(r * luminance);
    pixels[index + 1] = Math.round(g * luminance);
    pixels[index + 2] = Math.round(b * luminance);
  }

  return imageData;
}

export function buildDifferenceImageData(actual, oracle) {
  if (!actual || !oracle || actual.data.length !== oracle.data.length) {
    throw new Error('Difference inputs must have matching dimensions');
  }

  const output = new ImageData(actual.width, actual.height);

  for (let index = 0; index < actual.data.length; index += 4) {
    const alpha = Math.max(actual.data[index + 3], oracle.data[index + 3]);
    const delta = (
      Math.abs(actual.data[index] - oracle.data[index]) +
      Math.abs(actual.data[index + 1] - oracle.data[index + 1]) +
      Math.abs(actual.data[index + 2] - oracle.data[index + 2]) +
      Math.abs(actual.data[index + 3] - oracle.data[index + 3])
    ) / 4;

    output.data[index] = Math.min(255, delta * 2.2);
    output.data[index + 1] = Math.min(255, delta * 0.35);
    output.data[index + 2] = Math.min(255, delta * 0.8);
    output.data[index + 3] = alpha ? Math.max(55, Math.min(255, delta * 2.4)) : 0;
  }

  return output;
}
