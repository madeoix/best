# Endpoint migration matrix

| Current endpoint | Boundary | Batch status |
|---|---|---|
| `/api/beacon/world` | Public read API | Migrated |
| `/api/beacon/observatory/status` | Public read API | Migrated |
| `/api/beacon/observatory/search` | Public read API | Migrated |
| `/api/beacon/observatory/item` | Public read API | Pending |
| `/api/beacon/item/profile` | Public read API | Pending |
| `/api/beacon/item/profiles` | Public read API | Pending |
| `/api/beacon/avatar/profile` | Public read API | Pending |
| `/api/beacon/avatar/badge` | Public read API | Pending |
| `/api/beacon/space/profile` | Public read API | Pending |
| `/api/beacon/spin/prices` | Public read API | Pending |
| `/api/beacon/sessions` | Operator or Tauri | Pending |
| `/api/beacon/action` | Operator API | Pending |
| `/api/beacon/overview` | Operator API | Pending |
| `/api/vps/status` | Operator API | Replaced by scoped service status |
| `/api/vps/action` | Operator or Tauri | Pending |
| `/api/launch` | Tauri only | Pending |
| `/api/recent` | Tauri only | Pending |

`/api/vps/status` is not copied literally. The replacement exposes only
allowlisted service metadata and does not return arbitrary journal or system
output to the consumer application.
