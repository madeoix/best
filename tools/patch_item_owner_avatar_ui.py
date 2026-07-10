from pathlib import Path
import time

FILES = [
    Path("src/lib/components/home/BeaconItemPreview.svelte"),
    Path("src/lib/components/home/BeaconProfileDialog.svelte"),
]

CSS_MARKER = "/* owner identity avatar portraits */"
CSS = f"""
{CSS_MARKER}
.workspace-avatar-grid b,
.command-preview-people b {{
  overflow: hidden;
}}

.workspace-avatar-grid b img,
.command-preview-people b img {{
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}}
"""


def backup(path):
    backup_path = path.with_name(f"{path.name}.before-owner-avatar-ui.{int(time.time())}")
    backup_path.write_text(path.read_text(), encoding="utf-8")
    print(f"backup {backup_path}")


def replace_each_block(text, start_token, replacement):
    start = text.find(start_token)
    if start == -1:
        raise SystemExit(f"missing block start: {start_token}")

    end = text.find("{/each}", start)
    if end == -1:
        raise SystemExit(f"missing {{/each}} after: {start_token}")

    end += len("{/each}")
    return text[:start] + replacement + text[end:]


def append_css(text):
    if CSS_MARKER in text:
        return text

    if "</style>" in text:
        return text.replace("</style>", CSS + "\n</style>", 1)

    return text.rstrip() + "\n\n<style>\n" + CSS + "\n</style>\n"


item_preview = Path("src/lib/components/home/BeaconItemPreview.svelte")
profile_dialog = Path("src/lib/components/home/BeaconProfileDialog.svelte")

for path in FILES:
    if not path.exists():
        raise SystemExit(f"missing file: {path}")
    backup(path)

text = item_preview.read_text(encoding="utf-8")
text = replace_each_block(
    text,
    "{#each owners.slice(0, 3) as owner}",
    """{#each owners.slice(0, 3) as owner}
      {@const portrait = owner.avatar_portrait_thumb_url || owner.avatar_portrait_url || owner.avatar_portrait_snapshot_url || ''}
      {@const name = owner.display_avatar_name || owner.primary_avatar_name || owner.avatar_name || 'Unknown avatar'}
      <article>
        <b class:has-portrait={!!portrait}>
          {#if portrait}
            <img src={portrait} alt={name} loading="lazy" decoding="async" />
          {:else}
            {name.slice(0, 1)}
          {/if}
        </b>
        <span>{name}</span>
      </article>
    {/each}"""
)
text = append_css(text)
item_preview.write_text(text, encoding="utf-8")
print(f"patched {item_preview}")

text = profile_dialog.read_text(encoding="utf-8")
text = replace_each_block(
    text,
    "{#each owners.slice(0, 8) as owner}",
    """{#each owners.slice(0, 8) as owner}
            {@const portrait = owner.avatar_portrait_thumb_url || owner.avatar_portrait_url || owner.avatar_portrait_snapshot_url || ''}
            {@const name = owner.display_avatar_name || owner.primary_avatar_name || owner.avatar_name || 'Unknown avatar'}
            <article>
              <b class:has-portrait={!!portrait}>
                {#if portrait}
                  <img src={portrait} alt={name} loading="lazy" decoding="async" />
                {:else}
                  {name.slice(0, 1)}
                {/if}
              </b>
              <div>
                <strong>{name}</strong>
                <span>
                  {#if owner.avatar_candidate_count > 1}
                    {owner.avatar_candidate_count} avatar candidates
                  {:else if owner.avatar_portrait_status === 'captured_reference_unverified'}
                    portrait captured, not public
                  {:else}
                    {owner.latest_space_name || shortId(owner.owner_id) || 'space unresolved'}
                  {/if}
                </span>
              </div>
            </article>
          {/each}"""
)
text = append_css(text)
profile_dialog.write_text(text, encoding="utf-8")
print(f"patched {profile_dialog}")
