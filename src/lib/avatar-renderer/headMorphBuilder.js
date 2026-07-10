import { parseO3D } from './o3dParser.js';
import { buildThreeMeshGroup } from './threeMeshBuilder.js';
import {
  resolveContractAssetUrl
} from './avatarRenderContract.js';

function getWeight(target) {
  const value = Number(
    target?.normalized_weight ??
    target?.weight ??
    0
  );

  return Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function getAssetKeys(target, resolvedUrl) {
  return new Set(
    [
      target?.ref,
      target?.url,
      resolvedUrl
    ].filter(Boolean)
  );
}

function assetsMatch(left, right) {
  for (const key of left) {
    if (right.has(key)) return true;
  }

  return false;
}

function assertMatchingLayout(
  reference,
  candidate,
  label
) {
  if (
    reference.meshes.length !==
    candidate.meshes.length
  ) {
    throw new Error(
      `${label}: mesh count mismatch ` +
      `${reference.meshes.length} != ` +
      `${candidate.meshes.length}`
    );
  }

  reference.meshes.forEach(
    (referenceMesh, meshIndex) => {
      const candidateMesh =
        candidate.meshes[meshIndex];

      if (
        referenceMesh.vertices.length !==
        candidateMesh.vertices.length
      ) {
        throw new Error(
          `${label}: vertex count mismatch in mesh ` +
          `${meshIndex}: ` +
          `${referenceMesh.vertices.length} != ` +
          `${candidateMesh.vertices.length}`
        );
      }
    }
  );
}

function cloneParsedForBlend(parsed) {
  return {
    ...parsed,
    meshes: parsed.meshes.map((mesh) => ({
      ...mesh,
      vertices: mesh.vertices.map(
        () => [0, 0, 0]
      )
    }))
  };
}

function normalizeWeights(states) {
  const weights = states.map(
    (state) => getWeight(state.target)
  );

  const total = weights.reduce(
    (sum, weight) => sum + weight,
    0
  );

  if (total > 0) {
    return weights.map(
      (weight) => weight / total
    );
  }

  const equal = states.length
    ? 1 / states.length
    : 0;

  return states.map(() => equal);
}

function createParsedLoader() {
  const cache = new Map();

  return async function loadParsed(url) {
    if (!cache.has(url)) {
      cache.set(
        url,
        (async () => {
          const response = await fetch(url);

          if (!response.ok) {
            throw new Error(
              `Failed to load O3D morph target ` +
              `${url}: ${response.status}`
            );
          }

          return parseO3D(
            await response.text()
          );
        })()
      );
    }

    return cache.get(url);
  };
}

async function loadTargetStates({
  targets,
  avatarId,
  loadParsed
}) {
  return Promise.all(
    targets.map(async (target) => {
      const url = resolveContractAssetUrl(
        target,
        avatarId
      );

      return {
        target,
        url,
        keys: getAssetKeys(target, url),
        parsed: await loadParsed(url)
      };
    })
  );
}

function blendPrimaryGroup(states) {
  if (!states.length) {
    throw new Error(
      'Primary head morph group contains no targets'
    );
  }

  const baseState = [...states].sort(
    (left, right) =>
      getWeight(right.target) -
      getWeight(left.target)
  )[0];

  for (const state of states) {
    assertMatchingLayout(
      baseState.parsed,
      state.parsed,
      `Primary target ${state.target.selected_id}`
    );
  }

  const weights = normalizeWeights(states);
  const output = cloneParsedForBlend(
    baseState.parsed
  );

  states.forEach((state, stateIndex) => {
    const weight = weights[stateIndex];

    state.parsed.meshes.forEach(
      (sourceMesh, meshIndex) => {
        sourceMesh.vertices.forEach(
          (sourceVertex, vertexIndex) => {
            const destination =
              output.meshes[meshIndex]
                .vertices[vertexIndex];

            destination[0] +=
              sourceVertex[0] * weight;

            destination[1] +=
              sourceVertex[1] * weight;

            destination[2] +=
              sourceVertex[2] * weight;
          }
        );
      }
    );
  });

  return {
    output,
    baseState,
    debugTargets: states.map(
      (state, index) => ({
        selectedId:
          state.target.selected_id,
        optionId:
          state.target.option_id,
        ref:
          state.target.ref,
        url:
          state.url,
        contractWeight:
          getWeight(state.target),
        effectiveWeight:
          weights[index]
      })
    )
  };
}

function applySecondaryGroup({
  output,
  primaryStates,
  secondaryStates,
  groupName
}) {
  const referenceState =
    secondaryStates.find(
      (secondaryState) =>
        primaryStates.some(
          (primaryState) =>
            assetsMatch(
              secondaryState.keys,
              primaryState.keys
            )
        )
    );

  if (!referenceState) {
    return {
      group: groupName,
      applied: false,
      reason: 'no-shared-primary-reference',
      targets: secondaryStates.map(
        (state) => ({
          selectedId:
            state.target.selected_id,
          ref:
            state.target.ref,
          weight:
            getWeight(state.target)
        })
      )
    };
  }

  assertMatchingLayout(
    output,
    referenceState.parsed,
    `${groupName} reference`
  );

  const debugTargets = [];

  for (const state of secondaryStates) {
    const isReference = assetsMatch(
      state.keys,
      referenceState.keys
    );

    const weight = getWeight(
      state.target
    );

    if (isReference) {
      debugTargets.push({
        selectedId:
          state.target.selected_id,
        ref:
          state.target.ref,
        weight,
        reference: true
      });

      continue;
    }

    assertMatchingLayout(
      referenceState.parsed,
      state.parsed,
      `${groupName} target ` +
      `${state.target.selected_id}`
    );

    state.parsed.meshes.forEach(
      (targetMesh, meshIndex) => {
        const referenceMesh =
          referenceState.parsed
            .meshes[meshIndex];

        targetMesh.vertices.forEach(
          (targetVertex, vertexIndex) => {
            const referenceVertex =
              referenceMesh
                .vertices[vertexIndex];

            const destination =
              output.meshes[meshIndex]
                .vertices[vertexIndex];

            destination[0] +=
              (
                targetVertex[0] -
                referenceVertex[0]
              ) * weight;

            destination[1] +=
              (
                targetVertex[1] -
                referenceVertex[1]
              ) * weight;

            destination[2] +=
              (
                targetVertex[2] -
                referenceVertex[2]
              ) * weight;
          }
        );
      }
    );

    debugTargets.push({
      selectedId:
        state.target.selected_id,
      ref:
        state.target.ref,
      weight,
      reference: false
    });
  }

  return {
    group: groupName,
    applied: true,
    reference: {
      selectedId:
        referenceState.target.selected_id,
      ref:
        referenceState.target.ref,
      url:
        referenceState.url
    },
    targets: debugTargets
  };
}

export async function buildHeadMorphModel({
  contract,
  avatarId,
  materialContext = null,
  showWireframe = false
}) {
  const morphGroups =
    contract?.head?.morph_groups ?? {};

  const primaryGroupName =
    contract?.head?.primary_morph_group ??
    'face';

  const primaryGroup =
    morphGroups[primaryGroupName];

  if (!primaryGroup?.targets?.length) {
    throw new Error(
      `Primary morph group not found: ` +
      `${primaryGroupName}`
    );
  }

  const loadParsed =
    createParsedLoader();

  const primaryStates =
    await loadTargetStates({
      targets:
        primaryGroup.targets,
      avatarId,
      loadParsed
    });

  const primaryBlend =
    blendPrimaryGroup(primaryStates);

  const secondaryGroups = [];

  for (
    const [groupName, group]
    of Object.entries(morphGroups)
  ) {
    if (groupName === primaryGroupName) {
      continue;
    }

    if (!group?.targets?.length) {
      continue;
    }

    const secondaryStates =
      await loadTargetStates({
        targets:
          group.targets,
        avatarId,
        loadParsed
      });

    secondaryGroups.push(
      applySecondaryGroup({
        output:
          primaryBlend.output,
        primaryStates,
        secondaryStates,
        groupName
      })
    );
  }

  const groups = [];

  for (
    const parsedMesh
    of primaryBlend.output.meshes
  ) {
    const group = buildThreeMeshGroup({
      parsedMesh,
      sourceUrl:
        primaryBlend.baseState.url,
      materials:
        primaryBlend.output.materials,
      avatarId,
      materialContext,
      showWireframe
    });

    if (!group) continue;

    group.userData.morphStrategy =
      'absolute-primary-relative-secondary';

    groups.push(group);
  }

  const count = groups.reduce(
    (total, group) =>
      total +
      group.children.filter(
        (child) => child.isMesh
      ).length,
    0
  );

  return {
    groups,
    count,
    debug: {
      strategy:
        'absolute-primary-relative-secondary',

      primaryGroup:
        primaryGroupName,

      baseTarget: {
        selectedId:
          primaryBlend
            .baseState
            .target
            .selected_id,
        ref:
          primaryBlend
            .baseState
            .target
            .ref,
        url:
          primaryBlend
            .baseState
            .url
      },

      primaryTargets:
        primaryBlend.debugTargets,

      secondaryGroups,

      outputMeshes:
        primaryBlend.output.meshes.map(
          (mesh) => ({
            name: mesh.name,
            vertexCount:
              mesh.vertices.length,
            faceCount:
              mesh.faces.length
          })
        )
    }
  };
}
