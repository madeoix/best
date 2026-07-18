# Owner and avatar identity graph

Beacon treats the Smallverse account and its avatars as different entities.
The canonical relationship is:

```text
owner/user id
  -> zero to three user-avatar ids
       -> avatar name and exact portrait references
```

An item observation may identify the avatar that was present, but it does not
prove that avatar is the account default. Likewise, the most recently seen or
most frequently seen avatar is only a display candidate.

## Protocol sources

The read model follows the shipped ActionScript rather than URL or identifier
heuristics:

- `FriendService.searchForFriends` calls
  `friend.searchForFriends(query, true)`. Its result is a `Person` containing
  `Person.user` and `Person.avatar`.
- `Person.user.id` is the owner/account id.
- `Person.avatar.id` is the avatar id returned for that public result. Its
  name and portrait URLs belong to that avatar.
- `AvatarService.getUsersAvatars(ownerId)` calls
  `avatarcore.getUsersAvatars`. It returns `UserAvatar` rows for the account.
- `UserAvatar.type == 1` is a user avatar. Explicit pets and NPCs are excluded.
- `UserAvatar.isDefault == true` is authoritative default-avatar evidence.
  `UserAvatar.active` is lifecycle data and is not a selected-avatar signal.

The relevant recovered files are:

- `recovered-swfs/main-source/scripts/com/smallworlds/service/friend/FriendService.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/person/data/Person.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/person/data/identity/UserIdentity.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/person/data/identity/AvatarIdentity.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/fl/AvatarService.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/data/UserAvatar.as`

## Collection and storage

`smallverse_friend_search_protocol.py` builds and decodes the two authenticated
AMF calls. `beacon_friend_search_bridge.py` can follow each observed owner with
`getUsersAvatars`, within a bounded per-run owner limit.

`beacon_owner_avatar_identity_graph.py` stores append-only evidence in SQLite
and exports `owner-avatar-identity-graph.json`. The JSON maintains independent
owner and avatar indexes, exact source portrait URLs, local cached portrait
paths, and the evidence for every owner/avatar relationship.

The game contract allows at most three user avatars per owner. Extra observed
relationships are retained as integrity warnings and overflow ids rather than
silently accepted as normal account membership.

## Selection semantics

- `primaryAvatar` is populated only from an explicit protocol signal such as
  `UserAvatar.isDefault`.
- `selectedAvatarId` is populated only when an explicit selected-avatar event
  is captured.
- `displayAvatarId` may use the latest publicly observed avatar when no
  explicit selection exists, but its evidence says `proves_primary: false`.
- A portrait URL or filename never proves owner, default, or selected state.

The API merges this graph into avatar profiles so one avatar page can show its
owner and sibling avatars. Browser-facing image fields use only synchronized,
same-origin cached PNGs; the exact CDN URL remains acquisition evidence and is
not exposed as a fallback when it is known to reject public requests.

