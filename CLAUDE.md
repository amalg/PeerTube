# PeerTube fork (amalg/PeerTube) - project notes

General project instructions are in `AGENTS.md`. This file records knowledge specific to this fork and to
peertube.dngr.us.

## Fork and deployment

- `develop` here is Amal's fork: upstream v8.2.2 plus fork commits (extended search, search method setting, player loop
  controls, Docker changes, channel ranking). Remotes: `origin` = github.com/amalg/PeerTube, `upstream` =
  Chocobozzz/PeerTube. Migration level 1040 (as v8.2.2).
- peertube.dngr.us is built from `origin/develop` on Beefcake: Docker Compose in `/home/amal/Docker/peertube`, service
  `peertube` built from `./src`, image `peertube-custom:latest`. The PFSENSE session operates Beefcake and deploys.
  Deploy: tag the running image for rollback (`peertube-custom:<name>`), `./backup.sh`, pull `./src`, `docker compose build
  peertube`, `docker compose up -d peertube`, then check that the web UI answers 200. Every deploy is a production change
  and needs Amal's approval. The image has no commit label, so `/api/v1/config` reports an empty `serverCommit`.
- 2026-11-13: deployed `565ed61c8` (channel ranking). Rollback image: `peertube-custom:8.2.2-pre-ranking`.

## Fork constraints

- Do not add INCLUDE (covering) indexes on this fork. Its sequelize 6.37.8 has no `pnpm-patches/sequelize.patch` (develop
  has one), and the startup model sync's `showIndex` crashes on any INCLUDE index of a table ("Cannot read properties of
  undefined (reading 'match')", postgres/query.js), whether the model declares it or it was created by hand. It works
  again after the move to upstream 9.0.

## Channel ranking (recent views)

- API: sort `recentViews` / `-recentViews`, `recentViewsDays` (1-3650, default 365), `hasVideos=true`, plus `nsfw`,
  `nsfwFlagsIncluded`, `nsfwFlagsExcluded` (and `aiUsageOneOf` upstream) on `GET /api/v1/video-channels` and
  `GET /api/v1/search/video-channels`. Visibility = what the channel's own video list shows the same requester.
  A channel search sent to the search index answers 400 for the sort and `hasVideos`.
- Used by the DangerTube app's Platform tab (peertube-mobile repo, `docs/design/2026-11-12-channel-ranking.md`).
- Upstream: issue #7864 + PR #7866 (displayName sort 500 fix, branch `fix/channel-search-display-name-sort`); issue #7865
  (feature, cost question to maintainers). Feature branch `feat/channel-recent-views-sort` (on upstream develop, includes
  migration 1205: covering index `video_stat_video_id_start_date` INCLUDE ("views")). Amal chose to open the feature PR only
  after maintainers answer #7865.
- Measured (synthetic, PostgreSQL 14 defaults): with the covering index, 3M stat rows/year ~1.7 s (JIT off) / ~4 s (JIT
  on); 200k rows ~0.2 s; at peertube.dngr.us size (12,870 stat rows) 65-140 ms without the index. Cost is linear in the
  period's stat rows.
- Follow-ups from the final review, for the feature PR: a search+ranking test that tells ranking from A-Z order; require
  `videoFilters` instead of the anonymous fallback; `.not().isArray()` on `recentViewsDays` (a repeated param gives 500);
  plugin hook params carry raw nsfw/aiUsage fields next to `videoFilters`; openapi sort enums list only some directions;
  replacement-prefix regex in the channel query builder would be sturdier as a builder option; migration 1205 rebuilds
  the index non-concurrently at startup (renumber if upstream takes 1205); untested rules (account muting, ascending
  recentViews, total without hasVideos, user NSFW policy without `nsfw`). Possibly the same displayName 500 on the
  playlist search (unverified).

## Testing

- This Windows PC can't run Docker (see memory). Server tests ran in a throwaway Compose project on Beefcake operated by
  the PFSENSE session (postgres:14 + redis:7 + node:22.22.3 dev container, no project network because Beefcake has no free
  address pools). Removed after use.
- The checkout uses `core.autocrlf=true`: files on disk are CRLF, so shell scripts copied to Linux must be normalized. A
  snapshot of the working tree for a Linux box: temporary `GIT_INDEX_FILE` + `git add -A` + `commit-tree` + `git bundle`.
- Test upload helper (`server.videos.upload`) defaults to `nsfw: true`; pass `nsfw: false` when a test filters NSFW.
- Without whisper installed, `check-params/video-transcription` "Should fail to run transcription twice" (409 vs 204)
  and `notifications/caption-notifications` "transcription is enabled" fail; that's the environment, not the code.
- Fork CI suite names are 8.2.2's (`api-1` ... `api-5`); develop uses `api-check-params-search` etc.
