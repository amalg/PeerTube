# Hard Split Search Method - Implementation Plan

Design: `../specs/2026-07-13-hard-split-search-design.md`

Mirrors the extended-search wiring (see the 2026-04-12 extended search plan).

## 1. Config types and defaults

- `config/default.yaml`, `config/production.yaml.example`: add
  `search.search_method: 'default'` with comments.
- `packages/models/src/server/custom-config.model.ts`,
  `server-config.model.ts`: add `searchMethod: 'default' | 'hard-split'` to
  the `search` block.

## 2. Server wiring and validation

- `server/core/initializers/config.ts`: `CONFIG.SEARCH.SEARCH_METHOD` getter.
- `server/core/initializers/checker-before-init.ts`: require
  `search.search_method`.
- `server/core/controllers/api/config.ts` and
  `server/core/lib/server-config-manager.ts`: expose `searchMethod`.
- `server/core/middlewares/validators/config.ts`:
  `body('search.searchMethod').isIn([ 'default', 'hard-split' ])`.
- `support/docker/production/config/custom-environment-variables.yaml`:
  `PEERTUBE_SEARCH_SEARCH_METHOD`.

## 3. Video query builder

- `videos-id-list-query-builder.ts`: `searchMethod` option; in `whereSearch`,
  when hard-split and the query contains words, build the `trigramSearch` CTE
  with per-term `(name LIKE %term% OR description LIKE %term%)` conditions
  joined with AND; similarity attribute stays trigram-based for ranking.
- `video.ts`: thread `searchMethod` through both option types and pick lists.
- Controllers `search-videos.ts` and `users/me.ts`: pass
  `searchMethod: CONFIG.SEARCH.SEARCH_METHOD`.

## 4. Playlist query builder

- `video-playlist-list-query-builder.ts`: same hard-split branch on
  `VideoPlaylistModel` name/description.
- `video-playlist.ts`: add `searchMethod` to the `searchForApi` pick.
- Controller `search-video-playlists.ts`: pass the config value.

## 5. Admin UI

- `admin-config-general.component.html`: "Local search method" select in the
  Search section (`default` / `hard-split`).
- `admin-config-general.component.ts`: `searchMethod: FormControl<string>` in
  the search form group, default control `null`.

## 6. Tests

- `packages/tests/src/api/server/config.ts`: initial value assertion +
  round-trip via `buildNewCustomConfig`.
- `packages/tests/src/api/search/search-videos.ts`: hard-split describe block
  (partial match returned in default mode; AND semantics, missing-term
  exclusion, case insensitivity in hard-split mode).
- `packages/tests/src/api/search/search-playlists.ts`: hard-split describe
  block (cross-field AND match, missing-term exclusion).
