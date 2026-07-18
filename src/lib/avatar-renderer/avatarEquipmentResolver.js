const EXTERNAL_TOP_SLOTS = /^(?:Top\d\d|ConSuit|Suits)$/;
const EXTERNAL_BOTTOM_SLOTS = /^(?:Bot\d\d|ConSuit|Suits)$/;

function decodeXml(value) {
  return String(value ?? '')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function parseAttributes(source) {
  const attributes = {};
  const pattern = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

  for (const match of String(source ?? '').matchAll(pattern)) {
    attributes[match[1]] = decodeXml(match[2] ?? match[3] ?? '');
  }

  return attributes;
}

function parseXml(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new TypeError('Avatar equipment XML must be a non-empty string');
  }

  const documentNode = { name: '#document', attributes: {}, children: [] };
  const stack = [documentNode];
  const tokens = source.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<[^>]+>/g) ?? [];

  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<?') || token.startsWith('<!')) continue;

    if (token.startsWith('</')) {
      const closingName = token.slice(2, -1).trim();
      const current = stack.pop();
      if (!current || current.name !== closingName) {
        throw new Error(`Malformed avatar equipment XML near </${closingName}>`);
      }
      continue;
    }

    const selfClosing = token.endsWith('/>');
    const body = token.slice(1, selfClosing ? -2 : -1).trim();
    const separator = body.search(/\s/);
    const node = {
      name: separator === -1 ? body : body.slice(0, separator),
      attributes: parseAttributes(separator === -1 ? '' : body.slice(separator + 1)),
      children: []
    };
    stack.at(-1).children.push(node);
    if (!selfClosing) stack.push(node);
  }

  if (stack.length !== 1 || documentNode.children.length !== 1) {
    throw new Error('Malformed avatar equipment XML document');
  }

  return documentNode.children[0];
}

function token(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeGender(value) {
  const normalized = token(value);
  return normalized.includes('male') && !normalized.includes('female') ? 'male' : 'female';
}

function canonicalAssetPath(source, gender) {
  const value = String(source ?? '').replace(/^\/+/, '');
  const macros = {
    '$bu/': 'avatars/body/base/unisex/',
    '$bm/': 'avatars/body/base/male/',
    '$bf/': 'avatars/body/base/female/',
    '$hu/': 'avatars/head/base/unisex/',
    '$hm/': 'avatars/head/base/male/',
    '$hf/': 'avatars/head/base/female/'
  };

  for (const [macro, replacement] of Object.entries(macros)) {
    if (value.startsWith(macro)) return `${replacement}${value.slice(macro.length)}`;
  }

  if (value.startsWith('$bg/')) {
    return `avatars/body/base/${normalizeGender(gender)}/${value.slice(4)}`;
  }

  return value;
}

function decimalColorToHex(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 0xffffff) return null;
  return `#${number.toString(16).padStart(6, '0')}`;
}

function defaultSprite(id, compositeId, source, tintKey, role, priority = 1) {
  return { id, compositeId, source, tintKey, role, priority, evidence: 'avatar-design-default' };
}

function defaultEquipmentSprites(gender, selectedOptions, { top = true, bottom = true, feet = true } = {}) {
  const sprites = [];
  const topSelection = selectedOptions.JSTop || 'JumpTshirt';
  const bottomSelection = selectedOptions.JSBottom || 'JumpPants';
  const feetSelection = selectedOptions.JSFeet || 'NoShoe';

  if (top && topSelection === 'JumpTshirt') {
    sprites.push(defaultSprite(
      'JumpTorsoBase',
      'Torso',
      `avatars/body/base/${gender}/tshirt_torso.png`,
      'top',
      'captured-default-top'
    ));

    for (const suffix of ['Idle', 'Walk1', 'Walk2', 'Walk3', 'Sit', 'Throw', 'Raise']) {
      sprites.push(defaultSprite(
        `JumpArm${suffix}Base`,
        `Arm${suffix}`,
        `items/base/consumables/clothing/shared/shr_short_arm_${suffix.toLowerCase()}.png`,
        'top',
        'captured-default-top'
      ));
    }
  }

  if (bottom && bottomSelection === 'JumpPants') {
    for (const suffix of ['Idle', 'Walk1', 'Walk2', 'Walk3', 'Walk4']) {
      sprites.push(defaultSprite(
        `JumpPant${suffix}Base`,
        `Leg${suffix}`,
        `avatars/body/base/unisex/skinny_leg_${suffix.toLowerCase()}.png`,
        'bottom',
        'captured-default-bottom'
      ));
    }
    sprites.push(defaultSprite('JumpSitUpperBase', 'LegSitUpper', 'avatars/body/base/unisex/skinny_sit_upper.png', 'bottom', 'captured-default-bottom'));
    sprites.push(defaultSprite('JumpSitLowerBase', 'LegSitLower', 'avatars/body/base/unisex/skinny_sit_lower.png', 'bottom', 'captured-default-bottom'));
  }

  if (feet && feetSelection === 'NoShoe') {
    for (const suffix of ['Idle', 'Walk1', 'Walk2', 'Walk3', 'Walk4']) {
      sprites.push(defaultSprite(
        `JumpFoot${suffix}Base`,
        `Leg${suffix}`,
        `avatars/body/base/unisex/foot_${suffix.toLowerCase()}.png`,
        'skin',
        'captured-default-feet',
        1.1
      ));
    }
    sprites.push(defaultSprite('JumpFootSitBase', 'LegSitLower', 'avatars/body/base/unisex/foot_sit.png', 'skin', 'captured-default-feet', 1.1));
  }

  return sprites;
}

export function parseAvatarConfigXml(source) {
  const root = parseXml(source);
  if (root.name !== 'avatar') throw new Error('Avatar config root must be <avatar>');

  const selectedOptions = {};
  const optionAttributes = {};
  const visit = (node) => {
    if (node.name === 'option' && node.attributes.id) {
      selectedOptions[node.attributes.id] = node.attributes.sel ?? '';
      optionAttributes[node.attributes.id] = { ...node.attributes };
    }
    for (const child of node.children) visit(child);
  };
  visit(root);

  const gender = normalizeGender(selectedOptions.GenderOptions ?? root.attributes.gender);
  const externalSelections = Object.entries(selectedOptions)
    .filter(([slot, selection]) => (EXTERNAL_TOP_SLOTS.test(slot) || EXTERNAL_BOTTOM_SLOTS.test(slot)) && Boolean(selection))
    .map(([slot, selection]) => ({ slot, selection }));

  return {
    gender,
    selectedOptions,
    optionAttributes,
    externalSelections
  };
}

export function compileAvatarEquipmentFragmentXml(source, {
  gender = 'female',
  slot = null,
  availableAssetPaths = null
} = {}) {
  const root = parseXml(source);
  if (root.name !== 'f') throw new Error('Avatar item fragment root must be <f>');

  const resolvedGender = normalizeGender(gender);
  const colorsBySpriteId = new Map();
  const sprites = [];

  const collectColors = (node) => {
    if (node.name === 'c' && node.attributes.sId) {
      colorsBySpriteId.set(node.attributes.sId, decimalColorToHex(node.attributes.c));
    }
    for (const child of node.children) collectColors(child);
  };
  collectColors(root);

  const visit = (node, ancestors = []) => {
    const ancestorIds = ancestors.map((ancestor) => ancestor.attributes.id);
    if (ancestorIds.includes('Icon') || ancestorIds.includes('FragmentUI')) return;

    if (node.name === 'b' && node.attributes.id === 'Gender') {
      const matchingBranch = node.children.find((child) => (
        child.name === 'g' && normalizeGender(child.attributes.id) === resolvedGender
      ));
      if (matchingBranch) visit(matchingBranch, [...ancestors, node]);
      return;
    }

    if (node.name === 's' && node.attributes.cId && node.attributes.s) {
      if (!String(node.attributes.cId).startsWith('Icon')) {
        sprites.push({
          id: node.attributes.id || `${root.attributes.id}:${sprites.length}`,
          compositeId: node.attributes.cId,
          source: canonicalAssetPath(node.attributes.s, resolvedGender),
          tint: colorsBySpriteId.get(node.attributes.id) ?? null,
          tintKey: null,
          priority: Number.isFinite(Number(node.attributes.pri)) ? Number(node.attributes.pri) : 0,
          role: 'captured-equipped-item',
          evidence: 'item-fragment-xml',
          fragmentId: root.attributes.id ?? null,
          slot: slot ?? root.attributes.parentId ?? null
        });
      }
    }

    for (const child of node.children) visit(child, [...ancestors, node]);
  };
  visit(root);

  const diagnostics = [];
  if (availableAssetPaths) {
    for (const sprite of sprites) {
      if (!availableAssetPaths.has(sprite.source)) {
        diagnostics.push({
          code: 'missing-item-sprite-sheet',
          slot: sprite.slot,
          fragmentId: sprite.fragmentId,
          compositeId: sprite.compositeId,
          source: sprite.source,
          message: `Missing authored item sprite sheet: ${sprite.source}`
        });
      }
    }
  }

  return {
    fragmentId: root.attributes.id ?? null,
    slot: slot ?? root.attributes.parentId ?? null,
    sprites,
    diagnostics
  };
}

export function resolveAvatarEquipment({
  configXml = null,
  selectedOptions = {},
  gender = 'female',
  fragments = [],
  availableAssetPaths = null
} = {}) {
  const parsed = configXml
    ? parseAvatarConfigXml(configXml)
    : {
        gender: normalizeGender(selectedOptions.GenderOptions ?? gender),
        selectedOptions: { ...selectedOptions },
        optionAttributes: {},
        externalSelections: Object.entries(selectedOptions)
          .filter(([slot, selection]) => (EXTERNAL_TOP_SLOTS.test(slot) || EXTERNAL_BOTTOM_SLOTS.test(slot)) && Boolean(selection))
          .map(([slot, selection]) => ({ slot, selection }))
      };
  const selections = { ...selectedOptions, ...parsed.selectedOptions };
  const externalTop = parsed.externalSelections.some(({ slot }) => EXTERNAL_TOP_SLOTS.test(slot));
  const externalBottom = parsed.externalSelections.some(({ slot }) => EXTERNAL_BOTTOM_SLOTS.test(slot));
  const sprites = defaultEquipmentSprites(parsed.gender, selections, {
    top: !externalTop,
    bottom: !externalBottom,
    feet: !externalBottom
  });
  const diagnostics = [];
  let compiledFragmentCount = 0;

  for (const external of parsed.externalSelections) {
    const fragment = fragments.find((candidate) => (
      token(candidate.selection ?? candidate.id) === token(external.selection)
        && (!candidate.slot || candidate.slot === external.slot)
    ));
    if (!fragment?.xml) {
      diagnostics.push({
        code: 'missing-item-fragment',
        slot: external.slot,
        selection: external.selection,
        message: `Equipped ${external.slot}=${external.selection} has no captured item fragment XML`
      });
      continue;
    }

    const compiled = compileAvatarEquipmentFragmentXml(fragment.xml, {
      gender: parsed.gender,
      slot: external.slot,
      availableAssetPaths
    });
    compiledFragmentCount += 1;
    sprites.push(...compiled.sprites);
    diagnostics.push(...compiled.diagnostics);
  }

  const spritesByCompositeId = {};
  for (const sprite of sprites) {
    (spritesByCompositeId[sprite.compositeId] ??= []).push(sprite);
  }
  for (const entries of Object.values(spritesByCompositeId)) {
    entries.sort((left, right) => left.priority - right.priority);
  }

  return {
    source: configXml ? 'captured-avatar-config' : 'render-contract-selected-options',
    gender: parsed.gender,
    selectedOptions: selections,
    externalSelections: parsed.externalSelections,
    sprites,
    spritesByCompositeId,
    diagnostics,
    compiledFragmentCount,
    fullyResolved: diagnostics.length === 0
  };
}
