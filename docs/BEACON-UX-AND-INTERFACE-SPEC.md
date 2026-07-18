# Beacon UX and Interface Specification

## Status

This is a product and interface specification. It intentionally does not change
application behavior, schemas, crawlers, APIs, or publication rules. It defines
the target experience so future implementation work can be evaluated against a
single agreed design.

## 1. Product definition

Beacon is a Smallverse intelligence index. It helps a person discover and move
between three public, evidence-backed things:

- eligible rare and legendary items, including decoded variants;
- named avatars that have a usable portrait and meaningful public evidence;
- named spaces with a usable preview and meaningful public evidence.

Beacon is not a dump of crawler output, a raw protocol inspector, an alphabetical
directory of every Find Friends result, or a generic analytics dashboard.

The primary journey is:

```text
Search or browse an eligible item
  -> inspect its variants and evidence-backed appearances
  -> open a named avatar or named space
  -> follow the relationship graph without losing what the evidence means
```

The secondary journey is:

```text
Search a known avatar or space
  -> open its profile
  -> inspect only its supported items, locations, and account relationships
```

## 2. Product boundary: public Beacon vs private Ops

The two surfaces have different jobs and must not leak into one another.

| Public Beacon | Private Ops / Observatory |
| --- | --- |
| Clean, named, canonical entities | Raw capture receipts and incomplete records |
| Item, avatar, and space discovery | Crawler health, sessions, queues, retries |
| Human-readable labels and evidence meaning | IDs, hashes, XML paths, AMF/RTMP details |
| Read-only public data | Private recovery and inspection controls |
| Only publishable records | Records waiting for resolution |

### 2.1 Public publication contract

The public UI must never promote a placeholder as a usable record.

| Public entity | Required fields |
| --- | --- |
| Item | XML-confirmed eligible item, canonical name, item icon |
| Variant | Base item, decoded variant identity or explicit unknown decode state, render/icon |
| Avatar | Canonical avatar name and valid thumbnail |
| Space | Canonical space name and valid preview image |
| Relationship | Canonical endpoints and a declared evidence type |

If a record lacks these requirements, it belongs in Ops' resolution queue. It is
not rendered as `Unknown space`, a blank portrait, a raw ID, or a fake zero-value
public card.

## 3. Visual direction

### 3.1 Design goal

The visual language is a dark, minimal game archive: precise, calm, dense where
data is dense, and spacious around a primary visual. It should feel closer to a
well-designed game encyclopedia and a SkyCrypt profile than to a SaaS dashboard.

### 3.2 Recommended implementation tools

- **Tailwind CSS** for responsive layout, design tokens, spacing, typography, and
  state styling.
- **Radix UI** or **Headless UI** for accessible dialogs, menus, listboxes,
  tooltips, tabs, and keyboard behavior without forcing a visual theme.
- **Lucide** for a restrained icon set.
- **daisyUI only optionally**, and only for low-level form primitives after its
  default themes are overridden. daisyUI must not dictate Beacon's visual style.
- A small custom Beacon component layer for domain components, rather than
  composing pages from generic cards.

### 3.3 Visual rules

- Background: near-black, with graphite/blue-black content surfaces.
- Accent: one muted cyan/teal interactive color. Gold is reserved for rarity or
  collectible significance.
- Typography: high-contrast entity names, quiet metadata, readable compact rows.
- Borders: subtle one-pixel dividers; no excessive rounded rectangles.
- Imagery: item icons, avatar renders, portraits, and space previews are the
  visual anchors. Do not frame each image twice.
- Cards: use sparingly for true group boundaries, not every line of text.
- Raw technical values: hidden by default behind `Source`, `Evidence`, or a copy
  action.
- Empty states: a short factual sentence and a next action, not decorative blank
  panels.

### 3.4 Prohibited patterns

- Card inside card inside modal.
- Public lists of unnamed spaces or avatars.
- Raw IDs as titles, subtitles, or substitute names.
- Giant metric tiles without a direct decision or action.
- Browser-dashboard language such as `Explorer service unavailable` in public UI.
- Treating item co-presence, equipment, sale, and ownership as the same claim.

## 4. Global shell and navigation

### 4.1 Public navigation

```text
Beacon mark     Search     Catalog     Spaces     About                 Account
```

- **Search** is the home page and global command surface.
- **Catalog** is the eligible rare/legendary item catalogue.
- **Spaces** is the resolved world, market, and item-rich-space directory.
- **About** explains evidence boundaries, coverage, and terminology.
- The account/session control remains compact at the right.

`Avatars` is not a primary public navigation destination. Avatar pages are reached
from search, item relationships, space relationships, account relationships, and
direct canonical links. An optional avatar search/index can exist behind Search,
not as an A-Z dumping ground.

Personal automation such as Spin/Zoltar is a separate private tool. It does not
belong in the public discovery navigation.

### 4.2 Private navigation

```text
Ops
  Overview
  Crawler sessions
  Live captures
  Resolution queue
  Renderer coverage
  Capture receipts
  Session history
```

Ops must use domain language: crawler, capture, room, avatar configuration,
resolution, queue, receipt. It must not expose implementation service names unless
they are secondary technical detail.

## 5. Entity vocabulary and evidence language

The same word must always mean the same thing across Search, item, avatar, space,
and Ops pages.

| Label | Meaning |
| --- | --- |
| Equipped by | Exact avatar appearance/config evidence establishes the item was equipped |
| Observed with | Avatar and item were captured in the same context; equipment is not proven |
| Placed in | Item object was captured as placed in a space |
| Listed for sale | Sale/market evidence establishes a listing context |
| Owned by | Explicit owner/account evidence establishes ownership; never inferred from room presence |
| Seen in | Avatar presence in a space |
| Variant | A base item with a UID/config-specific decoded appearance |
| Full render | Configuration and renderer assets are sufficient for a complete reconstruction |
| Portrait only | A profile thumbnail exists, but complete configuration is not available |

## 6. Search and home page

### 6.1 Purpose

Search is the useful front door. It should immediately help a person find an item,
avatar, or space—not merely display a static catalogue heading.

### 6.2 Layout

```text
Beacon
Search Smallverse

[ Search items, avatars, spaces…                                      Cmd/Ctrl K ]

Recent rare finds                         Newly decoded variants
Recent item-rich spaces                   Useful profiles
```

Below the hero search input, show only dynamic, curatable, resolved discovery:

- recently observed eligible items;
- recently decoded variants;
- item-rich resolved spaces;
- avatar profiles with more than a standalone thumbnail.

### 6.3 Typeahead behavior

Search must update as the user types, without requiring Enter.

For `roc`:

```text
Items
  [icon] Rock High-Top Sneakers      Rare wearable · 149 observed copies
  [icon] Rock Evil Bunny Jacket      Rare wearable

Avatars
  [portrait] RockStarMaddie          Seen in 2 resolved spaces

Spaces
  [preview] Rock Room Market         17 eligible-item signals
```

Rules:

- Group by entity type.
- Each row has one image, a canonical title, one useful fact, and an entity label.
- Keyboard arrows change selection; Enter opens it; Escape closes suggestions.
- Typing must not immediately navigate away from the query.
- Empty state: `No published matches yet.` It must not invent substitute results.
- Raw IDs are accessible only through a `Copy source ID` action after opening a
  record or through a small result menu.

### 6.4 Search result ranking

1. Exact canonical-name matches.
2. Prefix matches.
3. Word matches.
4. Meaningful resolved records with stronger evidence/recency.
5. Never prioritize an unresolved record simply because it has a raw identifier.

## 7. Catalog taxonomy

The catalogue must follow how Smallverse items behave in-game, not only their
source folder paths.

### 7.1 Eligibility

The public catalogue contains only the agreed eligible XML classes—currently rare
and legendary, plus future explicit policy additions. Ordinary furniture, plain
clothing, and arbitrary objects cannot appear because they happen to be observed.

### 7.2 Faceted taxonomy

An item can belong to several facets at once.

```text
Rarity
  Rare · Legendary

Gameplay type
  Wearable · Outfit / costume · Headwear · Accessory · Footwear
  Furniture · Decor · Interactive · Collectible / curio

Collection / release
  Monthly · Seasonal · Event · Store · Retired / legacy

Variant status
  Variant-bearing · Base-only · Variant decoding incomplete

Evidence
  Equipped evidence · Placed evidence · Sale evidence · Recently observed
```

`Monthly` should be a first-class collection filter/view, not a title prefix. A
visitor should be able to browse a month/seasonal release set as a coherent group.

`Variant-bearing` should also be a first-class filter. It shows base item records
that have UID/config-driven appearance variants, not a loose pile of individual
UIDs.

### 7.3 Catalog layout

Use a dense media list or responsive item grid with filters in a left rail on wide
screens and a drawer on small screens. Do not use a card wall.

```text
Catalog                                  [search within catalog]
Filters                                  Sort: Recently observed

[icon] Rock High-Top Sneakers            Rare · Wearable · Variant-bearing
       149 copies · 23 avatars · 4 spaces

[icon] Apex Christmas Snow Jacket         Rare · Seasonal · Variant-bearing
       16 copies · 0 verified equipped links
```

## 8. Item profile

### 8.1 Purpose

An item page is the central evidence hub for one eligible base item. It explains
the item, its variants, and where it has been observed—without overclaiming
ownership.

### 8.2 Layout

```text
Catalog / Wearables / Jackets

[large selected icon]  Apex Christmas Snow Jacket
                       Rare wearable · Seasonal release
                       16 observed copies · 4 avatars · 2 spaces

Variants
[Base] [White / Blue] [Green / Gold] [Red / White] …

Equipped by                         Seen in spaces
[avatar rows]                       [space rows]

Listed for sale                     Technical source  ▸
[listing rows]                      hidden by default
```

### 8.3 Variant system

Every displayed variant must include:

- base item name;
- human-readable decoded variant label when available;
- rendered variant icon;
- observed UID count;
- decode confidence/status;
- a concealed raw UID/config/XML-path/source receipt.

Example:

```text
Rock High-Top Sneakers
  Cream / White     12 observed UIDs
  Green / White      8 observed UIDs
```

Never call a decoded `Green / White` configuration only `Parka Jacket` or expose
the UID as the visible title. The base item and specific rendered variant are two
different identities.

### 8.4 Relationship sections

The sections are deliberately separated because their evidence has different
meaning:

- **Equipped by**: exact avatar configuration proves the item is worn.
- **Observed with**: co-presence only; distinct visual language and wording.
- **Placed in spaces**: an item object exists in a room.
- **Listed for sale**: market/listing protocol receipt exists.
- **Owned by**: only explicit account/owner evidence may use this label.

Each row links to a canonical avatar or space page and carries a concise context
such as location and last observation time.

## 9. Avatar profiles

### 9.1 Publication and discovery

There is no default public page that lists every avatar returned by Find Friends.
The Find Friends corpus is an internal identity asset. A public avatar profile is
discoverable when it is named, has a portrait, and has useful connected evidence.

Avatar profiles are opened through:

- global search;
- avatar rows on an item page;
- avatar rows on a space page;
- a resolved account/avatar relationship;
- direct canonical URL.

### 9.2 Profile hierarchy

```text
                         [full avatar render]

                         James Kanaka
                         last seen in Oasis W&R
                         Account relationship: resolved / unavailable
                         Primary avatar: confirmed / likely / unknown

Current appearance          Rare-item history          Spaces
equipment by slot           equipped / observed        resolved previews

Account avatars             Evidence
only proven siblings        collapsed source detail
```

### 9.3 Render states

The hero communicates truthfully:

- `Full reconstruction` — config and required assets are available.
- `Partial reconstruction` — some layers/configurations are missing.
- `Portrait available` — only the trusted thumbnail is available.

The UI never pretends a portrait is a full render. It also never renders a giant
floating head beside meaningless metrics.

### 9.4 Current appearance

When exact configuration exists, show equipped items organized by avatar slot:

```text
Head     [item]
Top      [item]
Bottoms  [item]
Shoes    [item]
Accessory[item]
```

Only items proved by the appearance/config capture appear here. Items merely
placed in a room or offered in a market belong in other evidence sections.

### 9.5 Account and primary-avatar policy

One owner/account can have multiple avatar IDs and names. Beacon must model that
without silently choosing a random first capture.

`Primary avatar` may be:

- **Confirmed**: protocol/source explicitly provides the selected/default avatar.
- **Likely**: evidence supports a confidence-scored inference; the UI labels it
  as likely and explains why in Evidence.
- **Unknown**: no valid basis to choose. Do not pick one.

Sibling avatars are only shown when the owner-to-avatar relationship is resolved.

## 10. Space index and space profiles

### 10.1 Space index

The public space index contains only named, preview-backed, meaningful spaces.
It should have filters:

```text
Markets · Popular rooms · Item-rich · Recently observed · Personal spaces
```

Each row uses a wide preview and concise context:

```text
[space preview] New World Flea Market
                Market · 963 eligible-item signals · 22 observed avatars
```

No `Unknown space` grids. A room ID without a canonical name and image remains in
the private resolution workflow.

### 10.2 Space profile

```text
[banner/large preview]
New World Flea Market
Market · last observed Jul 16

Rare items placed here       Listings                 Avatars seen here
[item rows]                  [sale rows]             [avatar rows]

Observation timeline
```

`Placed`, `Listed`, and `Seen` remain distinct. A space does not own all objects
or avatars shown within it.

## 11. Ops / Observatory

Ops is a private working surface. It is useful only if it answers what is working,
what happened recently, and what needs a decision.

### 11.1 Overview

```text
Crawler status
crawler-01  Popular-room and object capture       last receipt 2m ago
crawler-02  Avatar identity/config enrichment     next job in 45s

Needs attention
14 rooms await canonical metadata
7 avatar configurations await renderer coverage
1 crawler session needs renewal

Recent receipts
time · crawler · room · avatars · UIDs · configs · outcome
```

### 11.2 Queues

- unresolved space metadata;
- unresolved avatar identity/thumbnail;
- owner-to-avatar relationships awaiting proof;
- renderer asset/config coverage gaps;
- failed/expired crawler sessions;
- failed imports or malformed capture receipts.

Each row identifies the reason, evidence available, last attempt, next action, and
whether it is safe for automatic retry. It is not a generic `service unavailable`
dashboard.

## 12. Component inventory

The interface should be composed from a small, repeatable domain component set.

| Component | Use |
| --- | --- |
| `AppShell` | navigation, compact session/account control, route frame |
| `SearchPalette` | typeahead, entity grouping, keyboard navigation |
| `EntityRow` | a compact item/avatar/space result with one visual anchor |
| `ItemIcon` | base or selected variant icon, rarity marker, alt text |
| `VariantStrip` | readable variant tabs/thumbnails, not raw UID grid |
| `AvatarChip` | thumbnail, canonical name, short context, link |
| `SpaceRow` | preview, canonical name, category/context, link |
| `EvidenceLabel` | Equipped by / Observed with / Placed in / Listed for sale |
| `EvidenceTable` | dense relationship rows with expandable source detail |
| `RenderStage` | full / partial / portrait-only avatar output |
| `SourceDisclosure` | raw IDs, XML paths, hashes, receipts, copy actions |
| `ResolutionQueue` | private Ops-only incomplete entity work |

## 13. Empty, loading, and error states

Every non-content state must explain what is missing and what happens next.

| Situation | Public UI wording |
| --- | --- |
| No search matches | No published matches yet. |
| Avatar lacks full config | Portrait available; full appearance has not been captured yet. |
| Item has no verified equipment relation | No verified equipped appearances yet. |
| Space has no listings | No sale listings captured for this space. |
| Variant decode incomplete | Variant appearance captured; readable decode is still pending. |

Do not show blank avatars, `Unknown`, zero-value cards, or raw fallback IDs. The
actual unresolved detail remains in Ops.

## 14. Responsive behavior

### Desktop

- Content column has a readable maximum width, not a tiny panel floating in a
  huge empty viewport.
- Item/space evidence can use split-column layouts.
- Avatar profile uses the render as a visual anchor and evidence sections below.

### Mobile

- Navigation becomes a compact menu/drawer.
- Search suggestions become a full-width overlay.
- Lists remain rows; grids collapse without turning every record into a card.
- Variant strips become horizontally scrollable with clear selected state.
- Technical evidence remains collapsed.

## 15. Non-negotiable acceptance criteria

Before calling the redesign complete:

1. Public pages contain no raw avatar IDs, raw space IDs, unknown names, or blank
   image placeholders as public records.
2. The primary public action is useful typeahead search with named images.
3. The catalog contains only policy-eligible rare/legendary records and supports
   game-native facets, including monthly/seasonal and variant-bearing views.
4. Variant pages show base items and decoded variants separately.
5. Every displayed avatar/item/space relationship has a declared evidence meaning.
6. Avatar pages are profile experiences, with honest renderer state and no random
   A-Z crawler directory as the main feature.
7. Space pages show canonical name and preview or are not public.
8. Ops is action-oriented and private; unresolved records and raw identifiers live
   there.
9. Interface primitives are consistent, accessible, keyboard-usable, and not
   assembled as generic dashboard cards.
10. No screen invents information that the canonical evidence model does not
    support.

## 16. Implementation order after design approval

1. Agree on this specification and amend it before interface work.
2. Confirm public eligibility and canonical DTO contracts so the UI has no need
   for placeholders.
3. Build design tokens and shared domain components.
4. Replace global shell and Search/typeahead.
5. Rebuild catalog and item profile around taxonomy and evidence vocabulary.
6. Rebuild avatar profile and space profile around canonical joins.
7. Move unresolved/index-only material completely behind Ops.
8. Redesign Ops as an actionable operations workbench.
9. Test routes with real canonical records, partial renderer data, empty evidence,
   and small screens.

## 17. Open decisions for review

These should be agreed before app code changes:

1. Exact public eligibility policy: rare/legendary only, and whether any explicit
   non-rare collection exception is allowed.
2. The canonical collection taxonomy: monthly naming, seasons, events, store
   releases, retired items.
3. Whether `Likely primary avatar` is acceptable publicly or should stay private
   until explicitly confirmed.
4. Which space categories should be public: markets, popular rooms, personal
   spaces, or only spaces with rare-item evidence.
5. Whether a dedicated public variant browse route is useful now or variants should
   remain entirely inside item pages until coverage grows.
6. The exact visual palette and typography after reviewing one static mockup.

## 18. Art direction and scene-background system

### 18.1 Purpose

Beacon should feel rooted in Smallverse rather than built on a generic dark
application background. The supplied in-game captures demonstrate a strong visual
language: isometric streets, markets, storefronts, room interiors, greenery,
signage, and player-built displays. Those images should establish atmosphere, but
must never reduce legibility or compete with the record being read.

The visual inspiration is the way SkyCrypt gives a profile a sense of place using
a static game scene. Beacon can use a more archival version of that idea: a
curated, darkened compilation of Smallverse markets, streets, official trading
spaces, and representative collector rooms.

### 18.2 Background composition

The background is a static or very slowly changing scene composition—not a busy
animated slideshow.

```text
In-game scene source
  -> crop to a desktop-safe composition
  -> desaturate slightly
  -> apply dark navy/black gradient overlay
  -> add blur only outside the readable content focal area
  -> optionally add subtle grain/vignette
  -> use as a page-level atmospheric layer
```

Recommended visual treatment:

- Keep the source scene recognizable at the edges: shop windows, roads, market
  booths, greenery, and silhouettes should be faintly visible.
- Use a 75–90% dark overlay behind standard content.
- Use a stronger solid-to-transparent gradient directly under text and lists.
- Do not blur the whole image into meaningless gray. The point is a sense of
  Smallverse place, not an abstract wallpaper.
- Avoid continuous parallax, video, or rapidly rotating backgrounds. These hurt
  readability, native-app performance, and the calm archival tone.
- Respect reduced-motion preference: no movement at all when requested.

### 18.3 Scene pools

Maintain named, curated scene pools rather than randomly using every screenshot.

| Pool | Appropriate routes | Examples |
| --- | --- | --- |
| World / market | Search, Catalog, Spaces | street markets, trading district, storefronts |
| Collectors | item-rich space pages | curated personal shops, collectible displays |
| Fashion / avatar | avatar profiles, wearable items | social streets, dressing-oriented rooms, high-quality interiors |
| Seasonal | monthly/event collections | event scenes, holiday areas, seasonal markets |
| Neutral | About and Ops | low-detail architectural/game scenes or solid dark surface |

The screenshot archive is reference material for selecting/cropping these scenes.
Before production use, each visual needs a source record: original screenshot,
crop coordinates, route pool, readability review, and whether it contains
identifiable private player information that should be avoided or obscured.

### 18.4 Per-route background behavior

| Route | Background behavior |
| --- | --- |
| Search | world/market composition, dark enough for universal search |
| Catalog | quieter market/street scene, lower contrast than Search |
| Item | contextual treatment based on item facet, with a neutral fallback |
| Avatar profile | fashion/social/interior scene with a stable render stage |
| Space profile | that exact space's canonical preview/banner; no unrelated wallpaper |
| Ops | nearly solid dark background; operational clarity takes priority |

### 18.5 Item-aware visual theming

Item backgrounds can vary by **category or collection**, but not randomly per item
and not by applying loud colors to every page.

| Item context | Background direction |
| --- | --- |
| Monthly / seasonal | matching event scene, with restrained collection accent |
| Wearables | social/fashion/interior pool; no color forced from the icon |
| Furniture / decor | room/interior pool |
| Marketplace/history | street/market pool |
| Variant viewer | neutral dark stage so variant color remains readable |

The selected item icon remains the primary visual. A background is secondary
context. It must never imply provenance—for example, a Christmas background does
not prove an item came from a particular room.

### 18.6 Content-layer geometry

The content should not be a narrow panel floating in an enormous blank desktop.
Use a consistent responsive frame:

```text
desktop:  max-width roughly 1180–1320px, fluid gutters
tablet:   full width minus stable 24–32px gutters
mobile:   full width minus 16px gutters
```

The page uses a quiet readable surface over the atmospheric scene. Major record
headers can be visually open; dense evidence below uses dividers and tables/lists,
not repeated cards.

## 19. Display blueprint by route

This section is the concrete display contract: what a person should see, in what
order, and what must not be shown.

### 19.1 Search (`/`)

```text
Top navigation

Atmospheric in-game market background

BEACON
Search Smallverse
Find rare items, known avatars, and observed spaces.

[ universal search input                                          Cmd/Ctrl K ]

Recent rare finds                 Newly decoded variants
compact list                      compact list

Item-rich spaces                  Useful profile links
wide image rows                   only evidence-rich avatars
```

Do not show:

- huge category dumps;
- raw capture counters as the visual focus;
- an alphabetical avatar wall;
- unresolved rooms or blank thumbnails.

### 19.2 Search suggestion panel

The suggestion panel appears directly below the search input and is the highest
priority interactive element on the home page.

```text
Items (3)
[icon] Apex Christmas Snow Jacket       Rare · seasonal · variant-bearing

Avatars (2)
[portrait] Ava Example                  Last seen in New World Flea Market

Spaces (1)
[preview] New World Flea Market         Market · 963 eligible-item signals
```

It is a single elevated surface with grouped rows—not separate nested cards. A
result has a visible type label, asset, canonical name, one useful context line,
and an obvious selected/hover state.

### 19.3 Catalog (`/items`)

```text
Catalog
Rare and legendary Smallverse items

[search catalog] [sort]

Filters: rarity | kind | collection | variant status | evidence

Monthly & seasonal              Wearables                 Variant-bearing
[small curated rail]            [dense item rows]        [small curated rail]

All eligible items
[icon] name                     rarity · facets · concise evidence counts
```

The page starts with useful collection rails only when they contain actual data.
The main catalog stays a clean list/grid. Filters describe gameplay meaning, not
file paths.

### 19.4 Item profile (`/item/:canonical-key`)

```text
Breadcrumb

[large item / selected variant]       Item title
                                      rarity · game type · collection
                                      item synopsis if sourced

                                      observed copies | verified avatars | spaces

Variant strip: base item -> selected variant -> readable decoded labels

Observed relationships
Equipped by                            Placed in spaces
avatar rows                            space rows

Listed for sale                        Observed with
sale rows                              explicitly weaker co-presence rows

Source / evidence ▸
```

This page should use an item-context background only above the fold; its evidence
area transitions to a quieter, high-contrast surface. The user should never need
to decode a UID to understand a variant.

### 19.5 Avatar profile (`/avatar/:canonical-key`)

```text
Avatar profile

 [full reconstruction or portrait]     Avatar name
                                       last observed space and time
                                       primary avatar status

 Current appearance
 [render stage] [equipment by slot]

 Spaces and market activity
 [space preview + name + role/context]

 Rare item evidence
 Equipped | Observed with | Listed / placed

 Account avatars (only proven)          Source / evidence ▸
```

The avatar is a destination when there is a reason to visit. A Find Friends-only
portrait has value to the crawler's identity layer but is not automatically a
featured public profile. Direct search may still expose it if it meets the public
identity contract, but the page must plainly say it has portrait-only coverage.

### 19.6 Space index (`/spaces`)

```text
Spaces
Markets, popular rooms, and item-rich places with resolved metadata.

Filters: markets | popular | item-rich | recently observed | seasonal

[wide preview] New World Flea Market
               market · item signals · avatar observations · latest capture
```

Spaces with no canonical name and preview are never rows here. A public index is
not a crawler backlog.

### 19.7 Space profile (`/space/:canonical-key`)

```text
[exact canonical space preview]
Space name · type · last observed

Rare items placed here          Current/historic listings
Avatars seen here               Observation timeline

Source / evidence ▸
```

The exact space preview is the hero background/header. A market profile may use a
slightly expanded scene crop from the same canonical visual, never an unrelated
generic marketplace background.

### 19.8 Variant explorer (optional later route)

This is optional until coverage is strong enough. If implemented, it lists base
items with verified config-driven variants, not individual raw UIDs.

```text
Variants
[base item icon] Rock High-Top Sneakers
  Cream / White · Green / White · Blue / White
```

Technical UID/config inspection lives behind a detail action.

### 19.9 Ops (`/ops`)

Ops has a flat operational layout, not decorative tiles:

```text
Crawler sessions                 Latest capture receipts
status · current task · last ok  sortable compact table

Resolution queue                 Renderer coverage
what is incomplete and why       configs/assets/action required

Session renewal                  Archive / generation status
manual controls with guardrails  bounded retention and health
```

## 20. Crawler relevance and publication policy

The crawler will necessarily encounter spaces, players, and objects that are not
interesting for Beacon's public purpose. The correct approach is not to pretend
they do not exist; it is to classify them, preserve capture evidence, and decide
whether they are useful to the public index.

### 20.1 Three levels of relevance

| Level | Meaning | Destination |
| --- | --- | --- |
| Capture-only | Valid raw event but no useful public connection yet | retained in immutable capture generation / Ops |
| Resolution candidate | Has enough clues to resolve identity or relationship | Ops resolution queue |
| Publicly useful | Canonical, eligible, and has meaningful evidence | Beacon read model |

### 20.2 Space relevance scoring

A space is publicly useful when it has a canonical name/preview and satisfies at
least one purpose criterion:

- official trading/market relevance;
- eligible rare/legendary items placed there;
- explicit sale listings for eligible items;
- recurring collector or item-rich activity;
- meaningful public avatar/item relationships;
- notable seasonal/event relevance.

Signals that lower priority but do not delete evidence:

- no eligible items or listings;
- no sustained meaningful activity;
- repeated empty/duplicate captures;
- room is only a transient game/system location;
- room is technically resolved but has no public discovery value.

The public spaces index should order by usefulness/recency, not simply by every
captured room. Capture-only rooms remain available to the internal pipeline for
future joins.

### 20.3 Official spaces and official owners

Official spaces and accounts should be **classified**, not blindly excluded from
the entire dataset.

An official space can be highly relevant: the Trading Post, official market areas,
seasonal event locations, and store spaces are valuable context. But official
items/avatars should not distort personal-owner or collector analysis.

Introduce a source-backed classification:

```text
space/operator classification
  official_world        game-owned destination or system area
  official_market       game-owned trading/store/market location
  official_event        game-run temporary event space
  player_market         player-owned market / collector location
  player_space          player-owned room
  unknown               unresolved; private only

account classification
  official_system       game/system account or NPC/operator
  official_staff        verified official/staff account if evidence supports it
  player                normal account
  unknown               unresolved; private only
```

Rules:

- Keep official spaces in the public space directory when they have user-facing
  discovery value.
- Exclude official/system owners from rankings such as `top collectors`,
  `player-owned inventory`, or ownership-derived statistics.
- Label official locations clearly (`Official market`, `Event space`) rather than
  hiding them.
- Do not infer official status from a name alone. Store the source and confidence
  for every classification.
- Apply exclusions at the relevant analysis/query layer, not by deleting source
  captures or mutating historical evidence.

### 20.4 Avatar relevance

The crawler can index avatars broadly to support later joins and thumbnails. Public
display is narrower:

- named avatar plus portrait is enough for direct search eligibility;
- featured/profile discovery requires meaningful relationship evidence;
- avatar index pages must filter to useful profiles, not every Find Friends match;
- official/system avatars are classified and omitted from player rankings while
  remaining visible where they provide location or event context.

### 20.5 Item relevance

The public catalog is defined by XML eligibility—not capture volume. A common item
can generate many UIDs and still remain private. A rare item with one good capture
is eligible and useful.

## 21. Data-display contract

The UI is a read model, not a raw-capture viewer. The display pipeline should be
conceptually:

```text
immutable raw capture generation
  -> canonical entity resolution
  -> classification and exact relationship validation
  -> public eligibility decision with reason
  -> route-specific public DTO
  -> Beacon display
```

Each public DTO should carry display-ready values, not force the frontend to guess:

| Entity | Required display fields |
| --- | --- |
| Item | canonical name, rarity, gameplay facets, icon, collection facets |
| Variant | base item, readable label, render/icon, decode state, observed count |
| Avatar | canonical name, thumbnail, render coverage status, public profile state |
| Space | canonical name, preview, classification, public relevance summary |
| Relationship | from/to display entities, evidence label, context, time, confidence/status |

Raw identifiers remain available as source metadata, not as presentation fields.

## 22. Decisions required before interface implementation

1. Confirm desired typography: neutral sans, slightly technical mono for source
   snippets only, and whether a display face is wanted for major headings.
2. Select 8–15 in-game scene crops for the initial background pools and decide
   whether player avatars/names visible in source screenshots must be obscured.
3. Confirm official-space policy: visible and labelled publicly; excluded only from
   player ownership/ranking metrics.
4. Confirm the exact rare/legendary eligibility policy and collection taxonomy.
5. Decide whether direct-search portrait-only avatars should be public immediately
   or only after they have a relationship beyond Find Friends.
6. Decide whether variants initially remain inside item profiles or get a later
   dedicated explorer.
7. Approve the route structure and the principle that unresolved entities never
   appear as placeholders in public Beacon.

## 23. Personal tools: Spin and Zoltar

Spin and Zoltar are real parts of the product, but they are not discovery routes.
They use a personal account/session and perform deliberate personal actions. They
therefore live under a `Tools` menu, visually related to Beacon but separated from
the public index.

```text
Beacon mark      Search   Catalog   Spaces                         Tools ▾
                                                                  Spin
                                                                  Zoltar
                                                                  Observatory
```

### 23.1 Spin (`/spin`)

The page is a calm, single-purpose action surface:

```text
Spin
Personal tool · account session is ready

             [wheel / current reward art]

             Available spins: 3
             Next free spin: 14m

             [ Spin now ]

Recent results
time                 result                    rarity / outcome
Jul 16, 10:42 PM     [item icon] Item name     Rare
```

The page has one primary action and an honest state label:

- Ready
- Spinning
- Waiting for result
- Cooldown until time
- Session needs renewal
- Action failed; source receipt available

Any automated mode must be plainly visible, opt-in, and bounded. It must not be a
hidden background behavior. Credentials and raw cookie/session values never appear
in the page body.

### 23.2 Zoltar (`/zoltar`)

Zoltar uses the same personal-tool shell, but its result surface can have a muted
fortune-machine accent: restrained amber, violet, or gold around the result only.

```text
Zoltar
Personal tool · account session is ready

            [current Zoltar state / result art]

            [ Perform action ]

Latest outcome
[large reward / outcome visual]  Human-readable result text

History
time · action · outcome · receipt status
```

The point is clarity, not simulation. The screens should not recreate the entire
game UI; they should expose only the state, action, result, and history needed to
use the tool safely.

## 24. Official space and official-account policy

### 24.1 Core policy

Official spaces must still be crawled. They are useful protocol/capture sources and
may be important to understand the game, events, store releases, or market
mechanics. But objects placed in an official game-owned space are generally not
useful as collector/ownership intelligence.

Therefore the policy is **crawl and preserve, classify, then scope the analysis**.
It is not delete, ignore, or allow official inventory to contaminate player
collection evidence.

### 24.2 Official avatar detection

The working Smallverse convention supplied for this project is that developer/
official avatar names end with `smallverse`.

The canonical classifier should preserve the observed display name and evaluate a
normalized, case-insensitive suffix rule:

```text
normalized avatar name ends with "smallverse"
  -> candidate official avatar
```

This is an explicit source-backed project rule, not a visual guess. Each resulting
classification must retain:

- original avatar name;
- normalized name;
- matched policy/rule (`name_suffix_smallverse`);
- classification confidence;
- capture generation/receipt supporting the name;
- any later manual confirmation or override.

The account/owner must be classified at the account level once a known official
avatar is linked to it. Do not classify unrelated accounts merely because they were
present in the same official room.

### 24.3 Official spaces

Official spaces should be classified by a combination of exact known-space policy,
official-avatar/account association when present, and explicit capture/source
evidence:

```text
official_world    game-owned destination/system room
official_market   Trading Post / official marketplace-style room
official_event    game-run temporary/seasonal room
player_market     player-owned trading or collector room
player_space      player-owned room
unknown           unresolved; not public
```

The exact Trading Post and other known official destinations should use a maintained
allow-list with a reason/source. That is more reliable than guessing from a space
name. An official avatar ending in `smallverse` can strengthen classification, but
should not be the only proof of every space's ownership.

### 24.4 Analysis inclusion rules

| Question / view | Official spaces and official accounts |
| --- | --- |
| Raw capture archive | Preserve completely |
| Crawler health / protocol validation | Include completely |
| Game/world directory | Show when named and useful; label Official market/event/world |
| Rare item catalog definition | XML eligibility remains unchanged |
| Player collector / ownership evidence | Exclude official owner/space-derived records |
| Player market / sale analysis | Exclude official-system inventory; retain only explicit player listing evidence |
| Item page general context | May show an official-space occurrence under a separately labelled `Official context` section, not as player ownership or collector evidence |
| Observatory's collector-focused queue | Default-hide official/system context; allow a deliberate include toggle |

This means an item found in an official Trading Post remains evidence that the item
exists in that game context, but it does not inflate owner count, copy count,
collector rankings, `equipped by`, player-space placement counts, or sale activity.

### 24.5 Display rules for official context

- Use an `Official` badge only where it explains context.
- Do not make official/developer avatar profiles part of normal player discovery.
- Do not treat official space placement as player ownership.
- Keep official context available in a collapsed secondary section on an item page
  when it is useful to explain an item/event.
- The public Spaces page can include the Trading Post and similar locations under
  an `Official spaces` or `Markets` filter, visibly labelled.

## 25. Current visual source map and future replacement map

This is a read-only map of the current source layers that produce the interface.
It exists so a redesign can be planned against real files rather than treated as a
CSS-only reskin. It does not authorize changes to these files.

### 25.1 Global application shell

| Current source | Current responsibility | Design direction |
| --- | --- | --- |
| `src/routes/+layout.svelte` | public route navigation, page shell choice, session control placement | Replace public navigation model with Search/Catalog/Spaces plus Tools; remove top-level avatar index from primary navigation |
| `src/lib/components/layout/AppShell.svelte` | public shell frame | Keep as conceptual shell boundary; redesign its geometry, background layer, and navigation slots |
| `src/lib/components/shell/AppChrome.svelte` | alternate chrome/wordmark/mode rail | Consolidate with the agreed public shell so there is one clear navigation system |
| `src/lib/components/shell/SessionControls.svelte` | account/session surface | retain as a compact right-side control, not a dominant page feature |
| `src/app.css` | Tailwind import, shadcn-svelte import, Inter, semantic CSS variables | Replace generic grayscale/shadcn defaults with Beacon tokens; Tailwind is already present |
| `src/lib/styles/beacon.css` | current Beacon visual layer | evolve/remove legacy module assumptions after component audit |
| `src/lib/styles/tokens.css`, `shell.css`, `responsive.css` | current tokens, shell, responsive behavior | consolidate into one design-token and layout system to prevent competing styling rules |

The project already imports Tailwind CSS and shadcn-svelte's Tailwind layer in
`src/app.css`. The recommendation is therefore not a tooling migration for its own
sake. It is a coherent token/component redesign using the existing Tailwind base,
while avoiding generic shadcn/daisy card defaults.

### 25.2 Current public route sources

| Route | Current source | Required future display role |
| --- | --- | --- |
| `/` | `src/routes/+page.svelte`, `src/lib/components/home/BeaconHome.svelte` | real universal-search home and curated discovery |
| `/items` | `src/routes/items/+page.svelte`, atlas/item components | eligible catalog with gameplay/collection facets |
| `/item/:…` | `src/lib/components/item/ItemProfile.svelte` and route integration | item evidence hub with variant strip and separated relationship types |
| `/avatars` | `src/routes/avatars/+page.svelte` | demote from primary public navigation; convert to filtered/discovery-only index or internal aid |
| `/avatar/:avatarId` | `src/routes/avatar/[avatarId]/+page.svelte`, `avatarProfileView.js` | SkyCrypt-inspired evidence-backed profile |
| `/spaces` | `src/routes/spaces/+page.svelte`, atlas space components | named/previewed public world and market directory only |
| `/spin` | `src/routes/spin/+page.svelte`, `SpinView.svelte` | private personal action page |
| `/zoltar` | `src/routes/zoltar/+page.svelte` | private personal action/result page |
| `/ops` | `src/routes/ops/*`, observatory/ops components | private actionable capture/queue/session workspace |

### 25.3 Existing display and state sources

| Current source | What it supplies | Required design constraint |
| --- | --- | --- |
| `src/lib/beacon/api.js` and `src/lib/runtime/apiClient.js` | public/API data access | frontend must consume display-ready canonical DTOs, not manufacture labels from raw values |
| `src/lib/beacon/beaconState.js` | main Beacon page state | state needs a clean distinction between public data and unresolved/operator-only data |
| `src/lib/beacon/atlasState.js`, `stores/worldStore.js` | spaces/atlas state | public space list must apply canonical-name/preview/public-eligibility requirements |
| `src/lib/beacon/itemGroups.js` | current text-keyword item grouping | replace name-heuristic groups with canonical gameplay facets and collection metadata |
| `src/lib/beacon/itemVariant.js` | variant presentation data | render base item, decoded variant label, and raw UID as separate layers |
| `src/lib/beacon/avatarProfileView.js` | avatar profile projection | enforce canonical name, valid portrait, exact evidence categories, and honest renderer state |
| `src/lib/components/home/*` | search/result/preview UI | replace static/split card composition with command-style typeahead and curated discovery |
| `src/lib/components/atlas/*` | item/space display primitives | convert card grid behavior to dense rows/media panels where appropriate |
| `src/lib/components/avatar/*` | portrait, calibration, Flash and reconstructed-render stages | use only the appropriate verified render level in the public avatar hero |
| `src/lib/components/observatory/*`, `src/lib/components/ops/*` | private operations views | show current jobs, receipts, resolution reasons, and actions rather than generic service tiles |

### 25.4 Renderer source map

The renderer should not be treated as one binary feature. The visual layer must
choose among supported states supplied by the renderer pipeline.

| Source area | Role in visual output | Public display role |
| --- | --- | --- |
| `avatarRenderSource.js`, `avatarRenderContract.js` | render-source/provenance contract | determine whether output is full, partial, or portrait-only |
| `avatarXmlBodyCompositor.js`, `avatarSpriteXmlCompiler.js`, `bodySpriteCompositor.js` | XML-driven body/sprite reconstruction | full/partial avatar body stage when required inputs exist |
| `avatarEquipmentResolver.js` | maps captured configuration to equipment layers/slots | equipment-by-slot section, only when exact |
| `assetResolver.js`, `materialResolver.js`, `avatarMaterialContext.js` | assets/materials/colors | renderer coverage and missing-asset explanation |
| `avatarAnimationPlanner.js` | supported animation planning | future motion states such as idle/wave/walk, only after parity is validated |
| `SmallverseAvatarCompositeStage.svelte`, `SmallverseAvatarCanvas.svelte` | visual render stages | public hero presentation for full/partial reconstruction |
| `SmallverseFlashRenderStage.svelte`, `SmallverseFlashOracleRenderer.svelte` | Flash/reference comparison | private verification/calibration, not default public presentation |

### 25.5 Styling migration principles

1. Do not layer a new Tailwind/daisy theme over legacy CSS and hope specificity
   resolves it. Inventory and retire/replace route styling deliberately.
2. Put colors, radii, border treatment, typography, z-index, and layout widths in
   a single Beacon token source.
3. Use semantic domain components; do not let every route hand-roll a card.
4. Keep technical/legacy styles for renderer calibration and Ops where they are
   actually appropriate; the public index should not inherit their visual density.
5. Build static reference screens for Search, item profile, avatar profile, space
   profile, Spin, and Zoltar before converting routes one by one.
