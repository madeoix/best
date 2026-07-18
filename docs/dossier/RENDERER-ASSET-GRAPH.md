# Renderer and asset dependency graph

## Two separate render products

Smallverse Lab has two renderers with different inputs and must not conflate them:

1. **Item variant icon renderer** — definition assets plus one item instance configuration produce a variant-specific icon.
2. **Avatar renderer** — one avatar configuration plus the recovered body/head/equipment assets and animation definitions produce an assembled avatar frame or animation.

A fetched server PNG is a captured reference/oracle. It is not proof that the local renderer reconstructed the same image.

## Avatar input graph

```text
RTMP Avatar.<avatar_id> state
  └─ compressed config
      └─ zlib-inflated <avatar> config XML
          ├─ gender/base selections
          ├─ head selections and transforms
          ├─ color/material selections
          └─ equipped option/asset references

recovered avatar.xml
  ├─ animation definitions (Idle, Walk, Wave, angles, timing)
  ├─ global frames
  ├─ body-node references
  └─ texture/frame transforms

recovered assets
  ├─ body sprite textures
  ├─ head sprite/design atlases
  ├─ O3D meshes
  ├─ material/texture definitions
  └─ equipment assets

all inputs
  └─ render contract
      └─ frame plan
          └─ ordered composite/mesh scene
              └─ locally reconstructed PNG/animation
```

## Current renderer modules

| Module | Responsibility |
|---|---|
| `assetResolver.js` | normalize recovered/local asset paths |
| `avatarRenderContract.js` | load and resolve versioned render-contract assets |
| `avatarRenderSource.js` | rank captured and reconstructed output candidates |
| `avatarSpriteXmlCompiler.js` | parse recovered avatar animation XML into typed nodes, frames, and animations |
| `avatarAnimationPlanner.js` | expand nested timelines, frame durations, angles, and node references |
| `avatarEquipmentResolver.js` | map selected configuration options to equipment slots/assets |
| `bodySpriteCompositor.js` | base appearance and low-level sprite/color operations |
| `avatarXmlBodyCompositor.js` | produce ordered body/equipment/head layers for a frame |
| `headSpriteResolver.js` | resolve selected head sprites from generated manifests |
| `headTextureComposer.js` | apply transforms, blend modes, filters, and atlas composition |
| `headFeatureCompositor.js` | compose individual facial features |
| `headMorphBuilder.js` | construct head morph state |
| `headProjection.js` | project head geometry/texture to the rendered view |
| `flashColorPipeline.js` | reproduce captured Flash color/filter operations |
| `avatarMaterialContext.js` | resolve material channels and represented filter steps |
| `materialResolver.js` | create renderer material definitions |
| `o3dParser.js` | parse recovered O3D mesh XML |
| `threeMeshBuilder.js` | convert parsed meshes/material groups to Three.js geometry |
| `designManifest.js` | discover referenced render assets and visible meshes |
| `avatarXmlBodyCompositor.js` | final 2D XML-driven body rig/composite plan |

Evidence: **Implemented** under `src/lib/avatar-renderer/`.

## Recovered animation semantics

`avatarSpriteXmlCompiler.js` and `avatarAnimationPlanner.js` currently recognize recovered XML rather than inventing CSS animations. The planner accounts for:

- default frame rate and duration;
- global animation frames;
- nested node animations;
- least-common-multiple timing across nested cycles;
- frame and angle selection;
- node offsets, mirrors, anchors, and draw order.

Supported labels in the current compositor include Idle, Walk, and Wave plus discrete view angles. Support in code does not prove visual parity for every asset combination.

## Capture oracle and reconstruction

For one avatar/config snapshot, retain:

- `config.xml` and SHA-256;
- captured thumbnail, preview, and full-body assets when available;
- request/capture metadata;
- locally reconstructed frame;
- alignment overlay;
- difference heatmap;
- renderer version and asset manifest hashes.

The public avatar image should prefer a verified local reconstruction only after it passes an explicit parity gate. Before that, a captured portrait may be shown as a portrait, but it must not be labeled a full avatar render.

## Floating-head failure explained

A floating head appears when the read model has a portrait or head asset but lacks one or more of:

- authoritative config XML;
- selected base-body/gender state;
- body animation XML;
- equipment-slot resolution;
- body textures;
- composed frame output.

The UI previously promoted the best available image candidate without requiring a complete render contract. That behavior hides missing pipeline stages. Public rendering must distinguish `portrait`, `captured_full_body`, `reconstructed_unverified`, `reconstructed_verified`, and `missing`.

## Item variant icon graph

```text
ItemDefinition(source_xml)
  ├─ base name/type/rarity
  └─ base icon/SWF/XML assets

ItemInstance(uid)
  └─ captured config/configXML
      ├─ color/material selections
      ├─ texture/design references
      └─ transforms/options

definition + normalized config
  └─ variant key
      ├─ readable decoded label
      ├─ exact renderer inputs
      └─ rendered PNG + SHA-256
```

The public variant row must contain UID, normalized variant key, decoded label or unresolved status, rendered-asset status, asset hash/path, observation source, and timestamp. Reusing `Parka Jacket` as the variant label merely because the definition is a parka is incorrect.

## Render authority and caches

- `static/avatar-oracles/` contains captured comparison evidence.
- `static/avatar-renders/` contains generated contracts/manifests and outputs.
- `static/avatar-assets/` contains recovered or imported renderer inputs.
- `static/variant-icons/` contains variant outputs when materialized.
- `docs/research/avatar-renderer-research.json` and calibration documents are research evidence, not public authority.

The 2026-07-16 artifact census found 394 variant PNGs, 1,933 avatar thumbnail PNGs, 873 avatar-asset PNGs, 113 O3D avatar assets, and only 19 PNGs under `static/avatar-renders`. These counts explain why the UI can display many portraits and item variants while full-body render coverage remains sparse. A portrait count must never be reported as a full-render count.

The current repository has multiple generations of render documents and fallback candidates. A single versioned `render-contract` must own one avatar/config snapshot. Candidate discovery should not merge contradictory generations silently.

## Renderer verification matrix

| Gate | Pass condition |
|---|---|
| identity | render contract avatar ID equals profile avatar ID |
| config | XML exists, parses, and hash matches manifest |
| assets | every required base/equipment/head reference resolves |
| animation | selected animation and angle produce a nonempty frame plan |
| composition | output includes required body nodes, not only head |
| determinism | same contract/assets produce same output hash |
| oracle | alignment and difference metrics are retained |
| publication | only verified status may be called a reconstructed avatar render |

## Unresolved renderer work

1. Full parity with Flash filters, blend modes, and every material channel is not proven.
2. All equipment option types are not mapped to recovered assets.
3. Primary/default avatar selection is upstream identity work, not renderer logic.
4. A complete regression corpus covering genders, angles, animations, rare equipment, and custom heads is absent.
5. The item variant renderer’s full config vocabulary still needs a source-indexed decoder catalog.
6. O3D reconstruction is experimental until it agrees with captured Flash output across the calibration corpus.
