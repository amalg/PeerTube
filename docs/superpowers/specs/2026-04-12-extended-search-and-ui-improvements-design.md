# Extended Search and UI Improvements - Design Spec

## Overview

Three features to improve PeerTube's search experience and channel management, plus a custom Docker build target for deploying the fork.

1. **Extended Search** - Admin toggle to include video descriptions and playlist descriptions in search results
2. **Playlist Prominence** - Increase playlist visibility in main search results with channel-style display
3. **Federated Subscribers Section** - Show remote/federated followers in a separate section for channel owners
4. **Custom Docker Build** - docker-compose override for building from this fork

## Feature 1: Extended Search (Admin Toggle)

### Admin Setting

New config key: `search.extended_search.enabled` (boolean, default: `false`)

When enabled, the video and playlist search queries include description matching alongside the existing title/name matching.

### Config Layer Changes

Each file follows the existing pattern for `search.remoteUri` / `search.searchIndex`:

**`config/default.yaml`** - Add under `search:`:
```yaml
search:
  # ...existing keys...
  extended_search:
    enabled: false
```

**`packages/models/src/server/custom-config.model.ts`** - Extend `CustomConfig.search`:
```typescript
search: {
  // ...existing...
  extendedSearch: {
    enabled: boolean
  }
}
```

**`packages/models/src/server/server-config.model.ts`** - Extend `HTMLServerConfig.search`:
```typescript
search: {
  // ...existing...
  extendedSearch: {
    enabled: boolean
  }
}
```

**`server/core/initializers/config.ts`** - Add getter under `CONFIG.SEARCH`:
```typescript
EXTENDED_SEARCH: {
  get ENABLED () {
    return config.get<boolean>('search.extended_search.enabled')
  }
}
```

**`server/core/lib/server-config-manager.ts`** - Add to `search` block in `getHTMLServerConfig()`:
```typescript
extendedSearch: {
  enabled: CONFIG.SEARCH.EXTENDED_SEARCH.ENABLED
}
```

**`server/core/controllers/api/config.ts`** - Add to `customConfig()` and handled by `convertCustomConfigBody()`:
```typescript
extendedSearch: {
  enabled: CONFIG.SEARCH.EXTENDED_SEARCH.ENABLED
}
```

### Admin UI

**`client/src/app/+admin/config/pages/admin-config-general.component.ts`** - Add form control:
```typescript
search: FormGroup<{
  // ...existing...
  extendedSearch: FormGroup<{
    enabled: FormControl<boolean>
  }>
}>
```

**`client/src/app/+admin/config/pages/admin-config-general.component.html`** - Add checkbox in the search section (after the remote URI toggles, before search index):
```html
<my-peertube-checkbox
  formControlName="enabled"
  i18n-labelText labelText="Enable extended search (include video and playlist descriptions in search results)"
>
  <ng-container ngProjectAs="description">
    <span i18n>When enabled, searches will also match against video descriptions and playlist descriptions, not just titles.</span>
  </ng-container>
</my-peertube-checkbox>
```

### Backend Query Changes

#### Video Search: `server/core/models/video/sql/video/videos-id-list-query-builder.ts`

The `whereSearch()` method (line 784) currently builds a CTE that only matches against `video.name`. When extended search is enabled, it will also match against `video.description`.

The method signature changes to accept the extended search flag:
```typescript
private whereSearch (options: {
  isCount?: boolean
  search?: string
  extendedSearch?: boolean
})
```

When `extendedSearch` is true, the CTE expands to:
```sql
"trigramSearch" AS (
  SELECT "video"."id",
    GREATEST(
      word_similarity(lower(immutable_unaccent(:search)), lower(immutable_unaccent("video"."name"))),
      word_similarity(lower(immutable_unaccent(:search)), lower(immutable_unaccent("video"."description"))) * 0.5
    ) as similarity
  FROM "video"
  WHERE lower(immutable_unaccent(:search)) <% lower(immutable_unaccent("video"."name"))
    OR lower(immutable_unaccent("video"."name")) LIKE lower(immutable_unaccent(:likeSearch))
    OR lower(immutable_unaccent(:search)) <% lower(immutable_unaccent("video"."description"))
    OR lower(immutable_unaccent("video"."description")) LIKE lower(immutable_unaccent(:likeSearch))
)
```

Key design decisions:
- Description similarity is multiplied by 0.5 so title matches rank higher
- `GREATEST()` picks the best match score between title and description
- The existing tag exact-match and UUID check remain unchanged

The `extendedSearch` flag is threaded from `CONFIG.SEARCH.EXTENDED_SEARCH.ENABLED` through `BuildVideosListQueryOptions` down to `whereSearch()`. The same query builder is used by both `/api/v1/search/videos` and `/api/v1/users/me/videos`, so both the main search and my-library search benefit automatically.

#### Playlist Search: `server/core/models/video/sql/playlist/video-playlist-list-query-builder.ts`

Same pattern. The playlist query builder's search block (line 138) currently matches only `VideoPlaylistModel.name`. When extended search is enabled:

```sql
word_similarity(lower(immutable_unaccent(:search)), lower(immutable_unaccent("VideoPlaylistModel"."name"))) as similarity
```

Becomes:

```sql
GREATEST(
  word_similarity(lower(immutable_unaccent(:search)), lower(immutable_unaccent("VideoPlaylistModel"."name"))),
  word_similarity(lower(immutable_unaccent(:search)), lower(immutable_unaccent(COALESCE("VideoPlaylistModel"."description", '')))) * 0.5
) as similarity
```

And the WHERE clause adds description matching (same OR pattern as videos). `COALESCE` handles null descriptions.

### Data Flow

```
Admin toggles setting -> custom config JSON saved -> CONFIG.SEARCH.EXTENDED_SEARCH.ENABLED reloads
-> query builders read flag at query time -> SQL includes/excludes description matching
-> client receives ServerConfig with extendedSearch.enabled (informational only, no client-side logic needed)
```

## Feature 2: Playlist Prominence in Search Results

### Pagination Change

**`client/src/app/+search/search.component.ts`** - `buildPlaylistsPerPage()` (line 375):
```typescript
private buildPlaylistsPerPage () {
  if (this.advancedSearch.resultType === 'playlists') return 10
  return 10  // was 2
}
```

Both filtered and unfiltered playlist counts become 10, matching videos.

### Display Change

**`client/src/app/+search/search.component.html`** - Replace the playlist miniature block (lines 90-97) with a channel-style layout:

```html
@if (isPlaylist(result)) {
  <div class="entry video-playlist">
    <my-actor-avatar
      [actor]="result.videoChannel" actorType="channel" responseSize="true"
      [internalHref]="getPlaylistUrl(result)" size="120"
    ></my-actor-avatar>

    <div class="video-channel-info">
      <a [routerLink]="getPlaylistUrl(result)" class="video-channel-names">
        <div class="video-channel-display-name me-2">{{ result.displayName }}</div>
        <div class="video-channel-name">{{ result.videoChannel?.displayName }}</div>
      </a>

      <div class="small muted">{{ result.videosLength }} videos</div>
    </div>

    <a [routerLink]="getPlaylistUrl(result)" class="peertube-button primary-button">
      <ng-container i18n>Play Videos</ng-container>
    </a>
  </div>
}
```

This mirrors the channel entry pattern: avatar on left, name/metadata in middle, action button on right. The "Play Videos" button links to the playlist watch page.

A helper method `getPlaylistUrl(playlist)` returns the route to watch the playlist (e.g., `/w/p/:uuid`).

### Result Ordering

The `forkJoin` array is already `[channels, playlists, videos]` and results are concatenated in that order, so the display order is already: channels first, playlists second, videos third. No change needed.

## Feature 3: Federated Subscribers Section

### Approach

Frontend-only change. The API already returns follower data with `follower.host` on each `ActorFollow`. Local followers have a host matching the instance domain; remote followers have a different host.

### Component Changes

**`client/src/app/+my-library/my-follows/my-followers.component.ts`**:

Add computed properties to split followers:
```typescript
get instanceHost(): string {
  return window.location.hostname
}

get localFollowers(): ActorFollow[] {
  return this.follows.filter(f => f.follower.host === this.instanceHost)
}

get remoteFollowers(): ActorFollow[] {
  return this.follows.filter(f => f.follower.host !== this.instanceHost)
}
```

### Template Changes

**`client/src/app/+my-library/my-follows/my-followers.component.html`**:

Replace the single flat list with two sections:

```html
<div class="actors" myInfiniteScroller (nearOfBottom)="onNearOfBottom()" [dataObservable]="onDataSubject.asObservable()">

  <!-- Local Subscribers -->
  @if (localFollowers.length > 0) {
    <h3 i18n class="section-title">Local Subscribers</h3>
    @for (follow of localFollowers; track follow) {
      <!-- existing actor template -->
    }
  }

  <!-- Federated Subscribers -->
  @if (remoteFollowers.length > 0) {
    <h3 i18n class="section-title">Federated Subscribers</h3>
    @for (follow of remoteFollowers; track follow) {
      <!-- existing actor template, same markup -->
    }
  }

</div>
```

### Access Control

This page is already behind authentication (`/my-library/followers` requires login). The existing API endpoint (`GET /:handle/followers`) already requires authentication and only returns followers for the requesting user's channels. No additional access control changes are needed.

## Feature 4: Custom Docker Build

### File: `support/docker/production/docker-compose.custom.yml`

A docker-compose override file that replaces the image reference with a local build:

```yaml
services:
  peertube:
    build:
      context: ../../../
      dockerfile: support/docker/production/Dockerfile
    image: peertube-custom:latest
```

### Usage

From the `support/docker/production/` directory:

```bash
docker compose -f docker-compose.yml -f docker-compose.custom.yml up -d --build
```

This builds from the local source tree using the existing Dockerfile, tags it as `peertube-custom:latest`, and deploys it in place of the official image.

### Rebuild Workflow

After pulling new changes from this fork:
```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.custom.yml up -d --build
```

## Files Changed (Summary)

### Config/Types (Feature 1)
- `config/default.yaml` - add `search.extended_search.enabled`
- `packages/models/src/server/custom-config.model.ts` - add `extendedSearch` to search type
- `packages/models/src/server/server-config.model.ts` - add `extendedSearch` to search type
- `server/core/initializers/config.ts` - add `CONFIG.SEARCH.EXTENDED_SEARCH`
- `server/core/lib/server-config-manager.ts` - expose in `getHTMLServerConfig()`
- `server/core/controllers/api/config.ts` - expose in `customConfig()`

### Backend Query (Feature 1)
- `server/core/models/video/sql/video/videos-id-list-query-builder.ts` - extend `whereSearch()`
- `server/core/models/video/sql/playlist/video-playlist-list-query-builder.ts` - extend search block

### Admin UI (Feature 1)
- `client/src/app/+admin/config/pages/admin-config-general.component.ts` - add form control
- `client/src/app/+admin/config/pages/admin-config-general.component.html` - add checkbox

### Search Results UI (Feature 2)
- `client/src/app/+search/search.component.ts` - update `buildPlaylistsPerPage()`, add `getPlaylistUrl()`
- `client/src/app/+search/search.component.html` - restyle playlist entries

### Followers UI (Feature 3)
- `client/src/app/+my-library/my-follows/my-followers.component.ts` - add local/remote splitting
- `client/src/app/+my-library/my-follows/my-followers.component.html` - two-section layout

### Docker (Feature 4)
- `support/docker/production/docker-compose.custom.yml` - new file, build override
