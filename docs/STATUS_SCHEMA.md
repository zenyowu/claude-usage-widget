# status.json contract (schema_version 2)

Public HTTPS endpoint serves this JSON. Provider secrets never appear here.

## Top level

| Field | Type | Notes |
| --- | --- | --- |
| `generated` | string (RFC 3339) | Aggregate time |
| `stale_after_seconds` | number | Default `1200` |
| `host` | string | User-chosen alias |
| `schema_version` | number | `2` |
| `generator_version` | string | Repo `VERSION` |
| `providers` | object | Keys: `cursor`, `antigravity` |
| `tasks` | array | Best-effort; empty is OK |

## Provider block

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `cursor` \| `antigravity` |
| `label` | string | Display name |
| `status` | string | `ok` \| `missing` \| `signed_out` \| `error` \| `disabled` |
| `ok` | boolean | Convenience |
| `error` | string\|null | Fixed Traditional Chinese (never paths/usernames) |
| `error_code` | string\|null | Stable enum — see below |
| `collected_at` | string\|null | Last attempt |
| `last_success_at` | string\|null | Last successful limits parse |
| `limits` | array | On failure: **keep last successful limits** |
| `today` | null | Reserved; MVP always `null` |
| `last30` | null | Reserved; MVP always `null` |
| `meta` | object | Whitelist only (e.g. `membership_type`) |

### `error_code` enum

`missing_cli` | `signed_out` | `api_error` | `parse_error` | `timeout` | `disabled` | `unknown`

### Limit row

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable, e.g. `cursor:plan`, `antigravity:gemini-weekly` |
| `label` | string | 繁中 |
| `percent` | int\|null | **Used** 0–100 |
| `used` / `limit` | number\|null | Optional absolute |
| `unit` | string | `percent` \| `usd` \| … |
| `unit_raw` | string\|null | |
| `window` | string | `billing_cycle` \| `weekly` \| `5h` |
| `quality` | string | `exact` \| `estimated` \| `unknown` |
| `resets` | string\|null | RFC 3339; epoch-1970 → `null` |
| `group` | string\|null | e.g. `Gemini Models` |
| `source` | string | `api` \| `cli` |
| `at` | string | Same as collection time for that limit |

## Task row (best-effort)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | |
| `provider` | string | |
| `title` | string | ≤80 chars; no raw prompts |
| `state` | string | `running` \| `failed` \| `waiting_user` \| `waiting_approval` |
| `since` / `updated_at` | string | |

## Sample

See `tools/preview/agent-status-sample.json`.
