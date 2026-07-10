import {
  buildFlashAvatarColorPipeline
} from './flashColorPipeline.js';

export const MATERIAL_LANE_STEP_IDS =
  Object.freeze({
    skin: 'SkinBase',
    hair: 'HairBase',
    facialhair: 'FacialHairStep'
  });

function addStepId(target, value) {
  if (
    typeof value === 'string' &&
    value.length > 0
  ) {
    target.add(value);
  }
}

function collectRepresentedStepIds(manifest) {
  const result = new Set();

  for (const sprite of manifest?.sprites ?? []) {
    addStepId(result, sprite?.id);
    addStepId(result, sprite?.name);
    addStepId(result, sprite?.label);
    addStepId(result, sprite?.cId);
    addStepId(result, sprite?.sId);

    const attrs = sprite?.attrs ?? {};

    addStepId(result, attrs.id);
    addStepId(result, attrs.name);
    addStepId(result, attrs.cId);
    addStepId(result, attrs.sId);
  }

  return result;
}

function normalizeMaterialName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Renderer binding only.
 *
 * This maps an O3D material name to an avatar color step. It does not collapse
 * an arbitrary Flash filter stack into a fabricated single transform.
 */
export function getMaterialChannel(
  materialContext,
  materialName
) {
  const key = normalizeMaterialName(materialName);

  let lane = 'default';
  let sourceId = null;

  if (
    key.includes('glass') ||
    key.includes('lens')
  ) {
    lane = 'glasses';
  } else if (
    key.includes('facialhair') ||
    key.includes('beard') ||
    key.includes('moustache') ||
    key.includes('mustache')
  ) {
    lane = 'facialhair';
    sourceId =
      MATERIAL_LANE_STEP_IDS.facialhair;
  } else if (key.includes('hair')) {
    lane = 'hair';
    sourceId =
      MATERIAL_LANE_STEP_IDS.hair;
  } else if (key.includes('skin')) {
    lane = 'skin';
    sourceId =
      MATERIAL_LANE_STEP_IDS.skin;
  }

  const filters = sourceId
    ? (
        materialContext
          ?.filtersByStepId
          ?.[sourceId] ?? []
      )
    : [];

  return {
    lane,
    sourceId,
    filters,

    // A MeshStandardMaterial color can represent one binding only.
    // Multiple Flash filters must not silently become "last wins".
    channel:
      filters.length === 1
        ? filters[0]
        : null,

    ambiguous:
      filters.length > 1
  };
}

function emptyContext(
  avatarId,
  sourceUrl,
  error = null
) {
  return {
    strategy:
      'flash-avatar-color-pipeline',

    avatarId,
    sourceUrl,

    materialLaneStepIds: {
      ...MATERIAL_LANE_STEP_IDS
    },

    filtersByStepId: {},
    links: {},
    records: [],

    diagnostics: {
      rawColorRecordCount: 0,
      resolvedFilterCount: 0,
      representedStepIds: [],
      linkCount: 0
    },

    error
  };
}

export async function loadAvatarMaterialContext(
  avatarId
) {
  if (!avatarId) {
    return emptyContext(
      avatarId,
      null,
      'avatarId is required'
    );
  }

  const sourceUrl =
    `/avatar-renders/${encodeURIComponent(avatarId)}` +
    '/head-design-sprites.json';

  let response;

  try {
    response = await fetch(sourceUrl, {
      cache: 'no-store'
    });
  } catch (error) {
    return emptyContext(
      avatarId,
      sourceUrl,
      error instanceof Error
        ? error.message
        : String(error)
    );
  }

  if (!response.ok) {
    return emptyContext(
      avatarId,
      sourceUrl,
      `HTTP ${response.status}`
    );
  }

  const manifest = await response.json();

  const representedStepIds =
    collectRepresentedStepIds(manifest);

  const pipeline =
    buildFlashAvatarColorPipeline(
      manifest?.colors ?? [],
      { representedStepIds }
    );

  return {
    strategy: pipeline.strategy,

    avatarId,
    sourceUrl,

    materialLaneStepIds: {
      ...MATERIAL_LANE_STEP_IDS
    },

    // The only canonical filter collection.
    filtersByStepId:
      pipeline.filtersByStepId,

    links:
      pipeline.links,

    records:
      pipeline.records,

    diagnostics: {
      filterOrder:
        pipeline.filterOrder,

      representedStepIds:
        [...representedStepIds],

      rawColorRecordCount:
        manifest?.colors?.length ?? 0,

      resolvedFilterCount:
        pipeline.records.filter(
          (record) =>
            Boolean(record.stepId)
        ).length,

      linkCount:
        Object.keys(
          pipeline.links
        ).length
    },

    error: null
  };
}

export const resolveAvatarMaterialContext =
  loadAvatarMaterialContext;

export default loadAvatarMaterialContext;
