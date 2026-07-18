# Beacon layout foundation

These components are the opt-in layout layer for the Beacon redesign. They do
not replace the current routes by themselves. Import components from
`$lib/components/layout` as each route is migrated.

## Shells

`AppShell` supports two intentionally different information architectures:

- `layout="public"` renders a compact top navigation for Search, Items,
  Avatars, Spaces, and public tools.
- `layout="operations"` renders a persistent operations sidebar for crawler
  health, live avatars, queue state, captures, and renderer diagnostics.

Navigation can be a flat item array or grouped operations navigation:

```svelte
<script>
  import { AppShell } from '$lib/components/layout';

  const navigation = [
    { label: 'Search', href: '/' },
    { label: 'Items', href: '/items' },
    { label: 'Avatars', href: '/avatars' },
    { label: 'Spaces', href: '/spaces' }
  ];
</script>

<AppShell {navigation} currentPath="/avatars">
  <!-- page content -->
</AppShell>
```

An operations group uses `{ label, items }`, and each item may provide
`description`, `badge`, `active`, or `disabled`.

## Page composition

- `PageHeader` owns breadcrumbs, the page title, supporting copy, metadata,
  and page-level actions.
- `EntityHero` owns the primary image or renderer, identity, status, and a
  small metric summary. Its `media` snippet accepts the avatar renderer.
- `SectionCard` provides one consistent content surface with optional header
  actions and footer evidence.
- `DataList` handles linked, selectable, static, custom, and empty rows.
- `StatusBadge` uses semantic tones such as `success`, `warning`, `danger`,
  `rare`, and `legendary`.

Use `.bui-stack`, `.bui-profile-grid`, and `.bui-profile-grid__aside` for the
standard profile composition. The aside becomes sticky on desktop and stacks
above the content on smaller screens.

## Design rules

1. Public pages present verified entities and relationships. Raw crawler state
   stays in the authenticated operations shell.
2. Use rarity colors only to communicate actual rarity.
3. Keep raw IDs in secondary metadata; names remain the primary labels.
4. Prefer structured lists and tables over collections of unrelated cards.
5. Import `beacon-foundation.css` only through these components until a route
   is migrated. Its element rules are scoped under `.beacon-foundation`.
