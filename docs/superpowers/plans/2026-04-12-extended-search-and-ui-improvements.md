# Extended Search and UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-toggleable extended search that includes video/playlist descriptions, increase playlist prominence in search results, show federated subscribers separately for channel owners, and provide a custom Docker build target.

**Architecture:** A new `search.extended_search.enabled` config key threads through PeerTube's config system (YAML -> CONFIG singleton -> ServerConfigManager -> CustomConfig API -> Admin UI). The backend SQL query builders conditionally expand their WHERE clauses to include description matching when the flag is true. Frontend changes are purely presentational: playlist search results get a channel-style layout with more results, and the followers page splits into local/remote sections.

**Tech Stack:** TypeScript, Angular 19, PostgreSQL (pg_trgm), Node.js/Express, Sequelize, Docker

---

## File Map

### Config Layer (Feature 1)
- Modify: `config/default.yaml` - add `search.extended_search.enabled: false`
- Modify: `config/production.yaml.example` - add `search.extended_search` section
- Modify: `packages/models/src/server/custom-config.model.ts` - add `extendedSearch` to search type
- Modify: `packages/models/src/server/server-config.model.ts` - add `extendedSearch` to search type
- Modify: `server/core/initializers/config.ts` - add `CONFIG.SEARCH.EXTENDED_SEARCH`
- Modify: `server/core/initializers/checker-before-init.ts` - add required key
- Modify: `server/core/lib/server-config-manager.ts` - expose in `getHTMLServerConfig()`
- Modify: `server/core/controllers/api/config.ts` - expose in `customConfig()`
- Modify: `server/core/middlewares/validators/config.ts` - add validation
- Modify: `support/docker/production/config/custom-environment-variables.yaml` - add env var mapping

### Backend Query (Feature 1)
- Modify: `server/core/models/video/sql/video/videos-id-list-query-builder.ts` - extend `whereSearch()` and `BuildVideosListQueryOptions`
- Modify: `server/core/models/video/sql/playlist/video-playlist-list-query-builder.ts` - extend search block and `ListVideoPlaylistsOptions`

### Admin UI (Feature 1)
- Modify: `client/src/app/+admin/config/pages/admin-config-general.component.ts` - add form control
- Modify: `client/src/app/+admin/config/pages/admin-config-general.component.html` - add checkbox

### Search Results UI (Feature 2)
- Modify: `client/src/app/+search/search.component.ts` - update `buildPlaylistsPerPage()`, add `getPlaylistUrl()`
- Modify: `client/src/app/+search/search.component.html` - restyle playlist entries

### Followers UI (Feature 3)
- Modify: `client/src/app/+my-library/my-follows/my-followers.component.ts` - add local/remote split
- Modify: `client/src/app/+my-library/my-follows/my-followers.component.html` - two-section layout
- Modify: `client/src/app/+my-library/my-follows/my-followers.component.scss` - section title styling

### Docker (Feature 4)
- Create: `support/docker/production/docker-compose.custom.yml`

### Tests
- Modify: `packages/tests/src/api/search/search-videos.ts` - extended search tests
- Modify: `packages/tests/src/api/search/search-playlists.ts` - extended search tests
- Modify: `packages/tests/src/api/server/config.ts` - config test updates

---

## Task 1: Config Layer - Types and Defaults

**Files:**
- Modify: `config/default.yaml:1105-1129`
- Modify: `config/production.yaml.example` (search section)
- Modify: `packages/models/src/server/custom-config.model.ts:323-335`
- Modify: `packages/models/src/server/server-config.model.ts:169-181`

- [ ] **Step 1: Add default config key to `config/default.yaml`**

Find the search section (line 1105) and add `extended_search` after the `search_index` block:

```yaml
search:
  # ...existing remote_uri and search_index blocks...

  # Enable extended search to include video and playlist descriptions in search results
  # When disabled, search only matches against titles/names
  extended_search:
    enabled: false
```

Insert this between the `is_default_search: false` line (1129) and the blank line before `client:` (1131).

- [ ] **Step 2: Add to `config/production.yaml.example`**

Add the same block in the production example config, in the search section after the `search_index` block:

```yaml
  # Enable extended search to include video and playlist descriptions in search results
  # When disabled, search only matches against titles/names
  extended_search:
    enabled: false
```

- [ ] **Step 3: Extend `CustomConfig` interface in `packages/models/src/server/custom-config.model.ts`**

At line 323, the `search` property currently ends at line 335. Add `extendedSearch` after `searchIndex`:

```typescript
  search: {
    remoteUri: {
      users: boolean
      anonymous: boolean
    }

    searchIndex: {
      enabled: boolean
      url: string
      disableLocalSearch: boolean
      isDefaultSearch: boolean
    }

    extendedSearch: {
      enabled: boolean
    }
  }
```

- [ ] **Step 4: Extend `HTMLServerConfig` in `packages/models/src/server/server-config.model.ts`**

Find the `search` block (around line 169-181) and add:

```typescript
  search: {
    remoteUri: {
      users: boolean
      anonymous: boolean
    }

    searchIndex: {
      enabled: boolean
      url: string
      disableLocalSearch: boolean
      isDefaultSearch: boolean
    }

    extendedSearch: {
      enabled: boolean
    }
  }
```

- [ ] **Step 5: Commit**

```bash
git add config/default.yaml config/production.yaml.example packages/models/src/server/custom-config.model.ts packages/models/src/server/server-config.model.ts
git commit -m "Add extended search config types and defaults"
```

---

## Task 2: Config Layer - Server Initialization and Validation

**Files:**
- Modify: `server/core/initializers/config.ts:1157-1179`
- Modify: `server/core/initializers/checker-before-init.ts:226-231`
- Modify: `server/core/lib/server-config-manager.ts:168-179`
- Modify: `server/core/controllers/api/config.ts:564-575`
- Modify: `server/core/middlewares/validators/config.ts:138-143`
- Modify: `support/docker/production/config/custom-environment-variables.yaml:940-958`

- [ ] **Step 1: Add CONFIG getter in `server/core/initializers/config.ts`**

After the `SEARCH_INDEX` block (line 1179), add:

```typescript
    EXTENDED_SEARCH: {
      get ENABLED () {
        return config.get<boolean>('search.extended_search.enabled')
      }
    }
```

The full SEARCH block becomes:

```typescript
  SEARCH: {
    REMOTE_URI: {
      get USERS () {
        return config.get<boolean>('search.remote_uri.users')
      },
      get ANONYMOUS () {
        return config.get<boolean>('search.remote_uri.anonymous')
      }
    },
    SEARCH_INDEX: {
      get ENABLED () {
        return config.get<boolean>('search.search_index.enabled')
      },
      get URL () {
        return config.get<string>('search.search_index.url')
      },
      get DISABLE_LOCAL_SEARCH () {
        return config.get<boolean>('search.search_index.disable_local_search')
      },
      get IS_DEFAULT_SEARCH () {
        return config.get<boolean>('search.search_index.is_default_search')
      }
    },
    EXTENDED_SEARCH: {
      get ENABLED () {
        return config.get<boolean>('search.extended_search.enabled')
      }
    }
  },
```

- [ ] **Step 2: Add required key check in `server/core/initializers/checker-before-init.ts`**

After line 231 (`'search.search_index.is_default_search'`), add:

```typescript
    'search.extended_search.enabled',
```

- [ ] **Step 3: Expose in `server/core/lib/server-config-manager.ts`**

In the `getHTMLServerConfig()` method, after the `searchIndex` block (line 178), add:

```typescript
      search: {
        remoteUri: {
          users: CONFIG.SEARCH.REMOTE_URI.USERS,
          anonymous: CONFIG.SEARCH.REMOTE_URI.ANONYMOUS
        },
        searchIndex: {
          enabled: CONFIG.SEARCH.SEARCH_INDEX.ENABLED,
          url: CONFIG.SEARCH.SEARCH_INDEX.URL,
          disableLocalSearch: CONFIG.SEARCH.SEARCH_INDEX.DISABLE_LOCAL_SEARCH,
          isDefaultSearch: CONFIG.SEARCH.SEARCH_INDEX.IS_DEFAULT_SEARCH
        },
        extendedSearch: {
          enabled: CONFIG.SEARCH.EXTENDED_SEARCH.ENABLED
        }
      },
```

- [ ] **Step 4: Expose in `server/core/controllers/api/config.ts` `customConfig()` function**

In the `customConfig()` function (around line 564-575), update the search block:

```typescript
    search: {
      remoteUri: {
        users: CONFIG.SEARCH.REMOTE_URI.USERS,
        anonymous: CONFIG.SEARCH.REMOTE_URI.ANONYMOUS
      },
      searchIndex: {
        enabled: CONFIG.SEARCH.SEARCH_INDEX.ENABLED,
        url: CONFIG.SEARCH.SEARCH_INDEX.URL,
        disableLocalSearch: CONFIG.SEARCH.SEARCH_INDEX.DISABLE_LOCAL_SEARCH,
        isDefaultSearch: CONFIG.SEARCH.SEARCH_INDEX.IS_DEFAULT_SEARCH
      },
      extendedSearch: {
        enabled: CONFIG.SEARCH.EXTENDED_SEARCH.ENABLED
      }
    },
```

- [ ] **Step 5: Add validation in `server/core/middlewares/validators/config.ts`**

After line 143 (`body('search.searchIndex.isDefaultSearch').isBoolean(),`), add:

```typescript
  body('search.extendedSearch.enabled').isBoolean(),
```

- [ ] **Step 6: Add env var mapping in `support/docker/production/config/custom-environment-variables.yaml`**

After the `search_index` block (line 958), add:

```yaml
  extended_search:
    enabled:
      __name: PEERTUBE_SEARCH_EXTENDED_SEARCH_ENABLED
      __format: json
```

- [ ] **Step 7: Commit**

```bash
git add server/core/initializers/config.ts server/core/initializers/checker-before-init.ts server/core/lib/server-config-manager.ts server/core/controllers/api/config.ts server/core/middlewares/validators/config.ts support/docker/production/config/custom-environment-variables.yaml
git commit -m "Wire up extended search config through server initialization and validation"
```

---

## Task 3: Config Test Updates

**Files:**
- Modify: `packages/tests/src/api/server/config.ts:425-436`

- [ ] **Step 1: Update `buildNewCustomConfig` in config test**

In `packages/tests/src/api/server/config.ts`, find the search section in `buildNewCustomConfig` (around line 425-436) and add the `extendedSearch` key:

```typescript
    search: {
      remoteUri: {
        anonymous: true,
        users: true
      },
      searchIndex: {
        enabled: true,
        url: 'https://search.joinpeertube.org',
        disableLocalSearch: true,
        isDefaultSearch: true
      },
      extendedSearch: {
        enabled: true
      }
    },
```

- [ ] **Step 2: Update `checkInitialConfig` in config test**

Find the section after `expect(data.broadcastMessage.dismissable).to.be.false` (around line 145) and add before the storyboards check:

```typescript
  expect(data.search.remoteUri.users).to.be.true
  expect(data.search.remoteUri.anonymous).to.be.false
  expect(data.search.searchIndex.enabled).to.be.false
  expect(data.search.extendedSearch.enabled).to.be.false
```

Note: if these search checks don't already exist, add them. If they do exist, just add the `extendedSearch` line alongside them.

- [ ] **Step 3: Commit**

```bash
git add packages/tests/src/api/server/config.ts
git commit -m "Update config tests for extended search setting"
```

---

## Task 4: Backend - Extended Video Search

**Files:**
- Modify: `server/core/models/video/sql/video/videos-id-list-query-builder.ts:30-105,369,784-836`

- [ ] **Step 1: Add `extendedSearch` to `BuildVideosListQueryOptions`**

In `server/core/models/video/sql/video/videos-id-list-query-builder.ts`, add a new field after `search?: string` (line 97):

```typescript
  search?: string
  extendedSearch?: boolean

  isCount?: boolean
```

- [ ] **Step 2: Modify `whereSearch()` method to accept and use `extendedSearch`**

Replace the entire `whereSearch` method (lines 784-836) with:

```typescript
  private whereSearch (options: {
    isCount?: boolean
    search?: string
    extendedSearch?: boolean
  }) {
    const { search, isCount, extendedSearch } = options

    if (!search) {
      if (!isCount) this.attributes.push('0 as similarity')

      return
    }

    const escapedSearch = this.sequelize.escape(search)
    const escapedLikeSearch = this.sequelize.escape('%' + search + '%')

    this.queryConfig = 'SET pg_trgm.word_similarity_threshold = 0.40;'

    if (extendedSearch) {
      this.cte.push(
        '"trigramSearch" AS (' +
          '  SELECT "video"."id", ' +
          `  GREATEST(` +
          `    word_similarity(lower(immutable_unaccent(${escapedSearch})), lower(immutable_unaccent("video"."name"))),` +
          `    word_similarity(lower(immutable_unaccent(${escapedSearch})), lower(immutable_unaccent(COALESCE("video"."description", '')))) * 0.5` +
          `  ) as similarity ` +
          '  FROM "video" ' +
          '  WHERE lower(immutable_unaccent(' + escapedSearch + ')) <% lower(immutable_unaccent("video"."name")) OR ' +
          '        lower(immutable_unaccent("video"."name")) LIKE lower(immutable_unaccent(' + escapedLikeSearch + ')) OR ' +
          '        lower(immutable_unaccent(' + escapedSearch + ')) <% lower(immutable_unaccent(COALESCE("video"."description", \'\'))) OR ' +
          '        lower(immutable_unaccent(COALESCE("video"."description", \'\'))) LIKE lower(immutable_unaccent(' + escapedLikeSearch + '))' +
          ')'
      )
    } else {
      this.cte.push(
        '"trigramSearch" AS (' +
          '  SELECT "video"."id", ' +
          `  word_similarity(lower(immutable_unaccent(${escapedSearch})), lower(immutable_unaccent("video"."name"))) as similarity ` +
          '  FROM "video" ' +
          '  WHERE lower(immutable_unaccent(' + escapedSearch + ')) <% lower(immutable_unaccent("video"."name")) OR ' +
          '        lower(immutable_unaccent("video"."name")) LIKE lower(immutable_unaccent(' + escapedLikeSearch + '))' +
          ')'
      )
    }

    this.joins.push('LEFT JOIN "trigramSearch" ON "video"."id" = "trigramSearch"."id"')

    let base = '(' +
      '  "trigramSearch"."id" IS NOT NULL OR ' +
      '  EXISTS (' +
      '    SELECT 1 FROM "videoTag" ' +
      '    INNER JOIN "tag" ON "tag"."id" = "videoTag"."tagId" ' +
      `    WHERE lower("tag"."name") = lower(${escapedSearch}) ` +
      '    AND "video"."id" = "videoTag"."videoId"' +
      '  )'

    if (validator.default.isUUID(search)) {
      base += ` OR "video"."uuid" = ${escapedSearch}`
    }

    base += ')'

    this.and.push(base)

    let attribute = `COALESCE("trigramSearch"."similarity", 0)`
    if (this.group) attribute = `AVG(${attribute})`

    if (!isCount) {
      this.attributes.push(`${attribute} as similarity`)
    }
  }
```

- [ ] **Step 3: Verify `whereSearch` is called with full `options`**

At line 369, confirm the call is `this.whereSearch(options)`. Since `options` is the full `BuildVideosListQueryOptions` object and now includes `extendedSearch`, this threading works automatically.

- [ ] **Step 4: Thread `extendedSearch` from controllers**

In `server/core/controllers/api/search/search-videos.ts`, find the `searchVideosDB` function. The function spreads `...query` into `apiOptions`. Add `extendedSearch: CONFIG.SEARCH.EXTENDED_SEARCH.ENABLED` to the apiOptions object.

Find the line that builds `apiOptions` (around line 108-110) and add:

```typescript
    const apiOptions = {
      ...query,

      extendedSearch: CONFIG.SEARCH.EXTENDED_SEARCH.ENABLED,

      nsfw: buildNSFWFilter(res, query.nsfw),
```

Add the CONFIG import at the top of the file:

```typescript
import { CONFIG } from '@server/initializers/config.js'
```

- [ ] **Step 5: Thread `extendedSearch` for my-videos endpoint**

In `server/core/controllers/api/users/me.ts`, find the `listMyVideos` function (around line 144). The function builds `apiOptions` by spreading `...query`. Add `extendedSearch`:

```typescript
    const apiOptions = {
      ...query,

      extendedSearch: CONFIG.SEARCH.EXTENDED_SEARCH.ENABLED,

      privacyOneOf: getAllPrivacies(),
```

If `CONFIG` is not already imported, add:

```typescript
import { CONFIG } from '@server/initializers/config.js'
```

- [ ] **Step 6: Commit**

```bash
git add server/core/models/video/sql/video/videos-id-list-query-builder.ts server/core/controllers/api/search/search-videos.ts server/core/controllers/api/users/me.ts
git commit -m "Add extended search support for video descriptions in query builder"
```

---

## Task 5: Backend - Extended Playlist Search

**Files:**
- Modify: `server/core/models/video/sql/playlist/video-playlist-list-query-builder.ts:8-22,138-154`
- Modify: `server/core/controllers/api/search/search-video-playlists.ts`

- [ ] **Step 1: Add `extendedSearch` to `ListVideoPlaylistsOptions`**

In `server/core/models/video/sql/playlist/video-playlist-list-query-builder.ts`, add after `search?: string` (line 17):

```typescript
  search?: string
  extendedSearch?: boolean
  host?: string
```

- [ ] **Step 2: Modify the search block in `buildSubQueryWhere()`**

Replace the search block (lines 138-154) with:

```typescript
    if (this.options.search) {
      const escapedSearch = this.sequelize.escape(this.options.search)
      const escapedLikeSearch = this.sequelize.escape('%' + this.options.search + '%')

      if (this.options.extendedSearch) {
        this.subQueryAttributes.push(
          `GREATEST(` +
          `word_similarity(lower(immutable_unaccent(${escapedSearch})), lower(immutable_unaccent("VideoPlaylistModel"."name"))),` +
          `word_similarity(lower(immutable_unaccent(${escapedSearch})), lower(immutable_unaccent(COALESCE("VideoPlaylistModel"."description", '')))) * 0.5` +
          `) as similarity`
        )

        where.push(
          `(` +
            `lower(immutable_unaccent(${escapedSearch})) <% lower(immutable_unaccent("VideoPlaylistModel"."name")) OR ` +
            `lower(immutable_unaccent("VideoPlaylistModel"."name")) LIKE lower(immutable_unaccent(${escapedLikeSearch})) OR ` +
            `lower(immutable_unaccent(${escapedSearch})) <% lower(immutable_unaccent(COALESCE("VideoPlaylistModel"."description", ''))) OR ` +
            `lower(immutable_unaccent(COALESCE("VideoPlaylistModel"."description", ''))) LIKE lower(immutable_unaccent(${escapedLikeSearch}))` +
            `)`
        )
      } else {
        this.subQueryAttributes.push(
          `word_similarity(lower(immutable_unaccent(${escapedSearch})), lower(immutable_unaccent("VideoPlaylistModel"."name"))) as similarity`
        )

        where.push(
          `(` +
            `lower(immutable_unaccent(${escapedSearch})) <% lower(immutable_unaccent("VideoPlaylistModel"."name")) OR ` +
            `lower(immutable_unaccent("VideoPlaylistModel"."name")) LIKE lower(immutable_unaccent(${escapedLikeSearch}))` +
            `)`
        )
      }
    } else {
      this.subQueryAttributes.push('0 as similarity')
    }
```

- [ ] **Step 3: Thread `extendedSearch` from playlist search controller**

In `server/core/controllers/api/search/search-video-playlists.ts`, find the `searchVideoPlaylistsDB` function. Add `extendedSearch: CONFIG.SEARCH.EXTENDED_SEARCH.ENABLED` to the apiOptions:

```typescript
    const apiOptions = {
      ...query,

      extendedSearch: CONFIG.SEARCH.EXTENDED_SEARCH.ENABLED,

      followerActorId: await getServerActor().then(a => a.id),
```

Add the CONFIG import at the top:

```typescript
import { CONFIG } from '@server/initializers/config.js'
```

- [ ] **Step 4: Commit**

```bash
git add server/core/models/video/sql/playlist/video-playlist-list-query-builder.ts server/core/controllers/api/search/search-video-playlists.ts
git commit -m "Add extended search support for playlist descriptions in query builder"
```

---

## Task 6: Admin UI - Extended Search Toggle

**Files:**
- Modify: `client/src/app/+admin/config/pages/admin-config-general.component.ts:174-185,426-437`
- Modify: `client/src/app/+admin/config/pages/admin-config-general.component.html:741-833`

- [ ] **Step 1: Add form type in `admin-config-general.component.ts`**

Find the search form type definition (around line 174-185) and add `extendedSearch`:

```typescript
  search: FormGroup<{
    remoteUri: FormGroup<{
      users: FormControl<boolean>
      anonymous: FormControl<boolean>
    }>
    searchIndex: FormGroup<{
      enabled: FormControl<boolean>
      url: FormControl<string>
      disableLocalSearch: FormControl<boolean>
      isDefaultSearch: FormControl<boolean>
    }>
    extendedSearch: FormGroup<{
      enabled: FormControl<boolean>
    }>
  }>
```

- [ ] **Step 2: Add form build config**

Find the search section in `buildForm()` (around line 426-437) and add `extendedSearch`:

```typescript
  search: {
    remoteUri: {
      users: null,
      anonymous: null
    },
    searchIndex: {
      enabled: null,
      url: URL_VALIDATOR,
      disableLocalSearch: null,
      isDefaultSearch: null
    },
    extendedSearch: {
      enabled: null
    }
  }
```

- [ ] **Step 3: Add HTML checkbox in `admin-config-general.component.html`**

In the search section, after the `</ng-container>` that closes the `remoteUri` formGroupName (around line 775) and before the `<ng-container formGroupName="searchIndex">` (around line 776), add:

```html
      <ng-container formGroupName="extendedSearch">
        <div class="form-group">
          <my-peertube-checkbox
            inputName="searchExtendedSearchEnabled"
            formControlName="enabled"
            i18n-labelText
            labelText="Enable extended search"
            >
            <ng-container ngProjectAs="description">
              <span i18n>When enabled, searches will also match against video descriptions and playlist descriptions, not just titles. This applies to both public search and user library search.</span>
            </ng-container>
          </my-peertube-checkbox>
        </div>
      </ng-container>
```

- [ ] **Step 4: Commit**

```bash
git add client/src/app/+admin/config/pages/admin-config-general.component.ts client/src/app/+admin/config/pages/admin-config-general.component.html
git commit -m "Add extended search toggle to admin configuration UI"
```

---

## Task 7: Search Tests - Extended Video Search

**Files:**
- Modify: `packages/tests/src/api/search/search-videos.ts`

- [ ] **Step 1: Add extended search test cases**

At the end of the describe block in `packages/tests/src/api/search/search-videos.ts`, before the `after` hook, add a new describe block:

```typescript
  describe('Extended search', function () {

    before(async function () {
      this.timeout(60000)

      await server.videos.upload({
        attributes: {
          name: 'description test video',
          description: 'This video is about cyberpunk dystopian futures'
        }
      })

      await server.videos.upload({
        attributes: {
          name: 'another ordinary video',
          description: 'Nothing special in this description'
        }
      })
    })

    it('Should not find video by description when extended search is disabled', async function () {
      await server.config.updateExistingConfig({
        newConfig: {
          search: {
            extendedSearch: {
              enabled: false
            }
          }
        }
      })

      const body = await command.searchVideos({ search: 'cyberpunk dystopian' })
      expect(body.total).to.equal(0)
    })

    it('Should find video by description when extended search is enabled', async function () {
      await server.config.updateExistingConfig({
        newConfig: {
          search: {
            extendedSearch: {
              enabled: true
            }
          }
        }
      })

      const body = await command.searchVideos({ search: 'cyberpunk dystopian' })
      expect(body.total).to.be.greaterThan(0)
      expect(body.data[0].name).to.equal('description test video')
    })

    it('Should still rank title matches higher than description matches', async function () {
      await server.videos.upload({
        attributes: {
          name: 'cyberpunk title match',
          description: 'unrelated description content'
        }
      })

      const body = await command.searchVideos({ search: 'cyberpunk' })
      expect(body.data.length).to.be.greaterThan(1)
      // Title match should rank first
      expect(body.data[0].name).to.equal('cyberpunk title match')
    })

    after(async function () {
      // Reset config
      await server.config.updateExistingConfig({
        newConfig: {
          search: {
            extendedSearch: {
              enabled: false
            }
          }
        }
      })
    })
  })
```

- [ ] **Step 2: Commit**

```bash
git add packages/tests/src/api/search/search-videos.ts
git commit -m "Add tests for extended video search by description"
```

---

## Task 8: Search Tests - Extended Playlist Search

**Files:**
- Modify: `packages/tests/src/api/search/search-playlists.ts`

- [ ] **Step 1: Add extended search test cases for playlists**

At the end of the describe block in `packages/tests/src/api/search/search-playlists.ts`, before the `after` hook, add:

```typescript
  describe('Extended search', function () {

    before(async function () {
      this.timeout(60000)

      const videoId = (await server.videos.upload()).uuid

      const created = await server.playlists.create({
        attributes: {
          displayName: 'My Cool Playlist',
          description: 'A curated collection of retro gaming speedruns',
          privacy: VideoPlaylistPrivacy.PUBLIC,
          videoChannelId: server.store.channel.id
        }
      })
      await server.playlists.addElement({ playlistId: created.id, attributes: { videoId } })
    })

    it('Should not find playlist by description when extended search is disabled', async function () {
      await server.config.updateExistingConfig({
        newConfig: {
          search: {
            extendedSearch: {
              enabled: false
            }
          }
        }
      })

      const body = await command.searchPlaylists({ search: 'retro gaming speedruns' })
      expect(body.total).to.equal(0)
    })

    it('Should find playlist by description when extended search is enabled', async function () {
      await server.config.updateExistingConfig({
        newConfig: {
          search: {
            extendedSearch: {
              enabled: true
            }
          }
        }
      })

      const body = await command.searchPlaylists({ search: 'retro gaming speedruns' })
      expect(body.total).to.be.greaterThan(0)
      expect(body.data[0].displayName).to.equal('My Cool Playlist')
    })

    after(async function () {
      await server.config.updateExistingConfig({
        newConfig: {
          search: {
            extendedSearch: {
              enabled: false
            }
          }
        }
      })
    })
  })
```

- [ ] **Step 2: Commit**

```bash
git add packages/tests/src/api/search/search-playlists.ts
git commit -m "Add tests for extended playlist search by description"
```

---

## Task 9: Playlist Prominence in Search Results

**Files:**
- Modify: `client/src/app/+search/search.component.ts:375-379`
- Modify: `client/src/app/+search/search.component.html:90-97`

- [ ] **Step 1: Increase playlist results per page in `search.component.ts`**

Replace `buildPlaylistsPerPage()` (lines 375-379):

```typescript
  private buildPlaylistsPerPage () {
    if (this.advancedSearch.resultType === 'playlists') return 10

    return 10
  }
```

- [ ] **Step 2: Add `getPlaylistUrl` helper method**

Add a new method to the `SearchComponent` class (after the existing `getExternalChannelUrl` method):

```typescript
  getPlaylistUrl (playlist: VideoPlaylist) {
    return VideoPlaylist.buildWatchUrl(playlist)
  }
```

Add the `VideoPlaylist` import at the top of the file:

```typescript
import { VideoPlaylist } from '@app/shared/shared-video-playlist/video-playlist.model'
```

- [ ] **Step 3: Restyle playlist entries in `search.component.html`**

Replace the playlist block (lines 90-97):

```html
    @if (isPlaylist(result)) {
      <div class="entry video-playlist">
        <a [routerLink]="getPlaylistUrl(result)">
          <img
            [src]="result.getThumbnailUrl(120)"
            [alt]="result.displayName"
            class="playlist-thumbnail"
          />
        </a>

        <div class="video-channel-info">
          <a [routerLink]="getPlaylistUrl(result)" class="video-channel-names">
            <div class="video-channel-display-name me-2">{{ result.displayName }}</div>
            @if (result.videoChannelBy) {
              <div class="video-channel-name">{{ result.videoChannelBy }}</div>
            }
          </a>

          <div class="small muted" i18n>{{ result.videosLength }} videos</div>
        </div>

        @if (!hideActions()) {
          <a [routerLink]="getPlaylistUrl(result)" class="peertube-button primary-button">
            <ng-container i18n>Play Videos</ng-container>
          </a>
        }
      </div>
    }
```

- [ ] **Step 4: Commit**

```bash
git add client/src/app/+search/search.component.ts client/src/app/+search/search.component.html
git commit -m "Increase playlist prominence in search with channel-style layout"
```

---

## Task 10: Federated Subscribers Section

**Files:**
- Modify: `client/src/app/+my-library/my-follows/my-followers.component.ts:19-120`
- Modify: `client/src/app/+my-library/my-follows/my-followers.component.html:1-38`
- Modify: `client/src/app/+my-library/my-follows/my-followers.component.scss`

- [ ] **Step 1: Add local/remote split logic in `my-followers.component.ts`**

Add a property for the instance host and computed getters. After the `inputFilters` declaration (line 37), add:

```typescript
  private instanceHost = window.location.hostname

  get localFollowers (): ActorFollow[] {
    return this.follows.filter(f => f.follower.host === this.instanceHost)
  }

  get remoteFollowers (): ActorFollow[] {
    return this.follows.filter(f => f.follower.host !== this.instanceHost)
  }
```

- [ ] **Step 2: Update the template in `my-followers.component.html`**

Replace the entire `<div class="actors" ...>` block (lines 17-38) with:

```html
<div class="actors" myInfiniteScroller (nearOfBottom)="onNearOfBottom()" [dataObservable]="onDataSubject.asObservable()">

  @if (localFollowers.length > 0) {
    <h3 class="section-title" i18n>Local Subscribers</h3>
    @for (follow of localFollowers; track follow) {
      <div class="actor">
        <my-actor-avatar [actor]="follow.follower" actorType="account" [href]="follow.follower.url" size="40"></my-actor-avatar>

        <div class="actor-info">
          <a [href]="follow.follower.url" class="actor-names" rel="noopener noreferrer" target="_blank" i18n-title title="Follower page">
            <div class="actor-display-name">{{ follow.follower.name + '@' + follow.follower.host }}</div>
            <my-global-icon iconName="external-link"></my-global-icon>
          </a>

          <div class="small muted">
            @if (isFollowingAccount(follow)) {
              <ng-container i18n>Is following all your channels</ng-container>
            } @else {
              <ng-container i18n>Is following your channel {{ follow.following.name }}</ng-container>
            }
          </div>
        </div>
      </div>
    }
  }

  @if (remoteFollowers.length > 0) {
    <h3 class="section-title" i18n>Federated Subscribers</h3>
    @for (follow of remoteFollowers; track follow) {
      <div class="actor">
        <my-actor-avatar [actor]="follow.follower" actorType="account" [href]="follow.follower.url" size="40"></my-actor-avatar>

        <div class="actor-info">
          <a [href]="follow.follower.url" class="actor-names" rel="noopener noreferrer" target="_blank" i18n-title title="Follower page">
            <div class="actor-display-name">{{ follow.follower.name + '@' + follow.follower.host }}</div>
            <my-global-icon iconName="external-link"></my-global-icon>
          </a>

          <div class="small muted">
            @if (isFollowingAccount(follow)) {
              <ng-container i18n>Is following all your channels</ng-container>
            } @else {
              <ng-container i18n>Is following your channel {{ follow.following.name }}</ng-container>
            }
          </div>
        </div>
      </div>
    }
  }

</div>
```

- [ ] **Step 3: Add section title styling in `my-followers.component.scss`**

Read the existing SCSS file. Add:

```scss
.section-title {
  font-size: 1.1em;
  font-weight: $font-semibold;
  margin-top: 20px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid pvar(--greyForegroundColor);

  &:first-child {
    margin-top: 0;
  }
}
```

If the file uses PeerTube's CSS variable patterns (`pvar()`, `$font-semibold`), follow those conventions. If it imports from a variables file, keep that import.

- [ ] **Step 4: Commit**

```bash
git add client/src/app/+my-library/my-follows/my-followers.component.ts client/src/app/+my-library/my-follows/my-followers.component.html client/src/app/+my-library/my-follows/my-followers.component.scss
git commit -m "Split followers page into local and federated subscriber sections"
```

---

## Task 11: Custom Docker Build Target

**Files:**
- Create: `support/docker/production/docker-compose.custom.yml`

- [ ] **Step 1: Create the docker-compose override file**

Create `support/docker/production/docker-compose.custom.yml`:

```yaml
# Docker Compose override to build PeerTube from local source instead of pulling the official image.
#
# Usage:
#   docker compose -f docker-compose.yml -f docker-compose.custom.yml up -d --build
#
# To rebuild after pulling new changes:
#   git pull
#   docker compose -f docker-compose.yml -f docker-compose.custom.yml up -d --build

services:
  peertube:
    build:
      context: ../../../
      dockerfile: support/docker/production/Dockerfile
    image: peertube-custom:latest
```

- [ ] **Step 2: Commit**

```bash
git add support/docker/production/docker-compose.custom.yml
git commit -m "Add docker-compose override for building from local source"
```

---

## Task 12: Final Verification

- [ ] **Step 1: TypeScript compilation check**

Run the TypeScript compiler to verify no type errors:

```bash
npx tsc --noEmit -p server/tsconfig.json
npx tsc --noEmit -p packages/models/tsconfig.json
```

- [ ] **Step 2: Fix any type errors found**

Address any compilation errors and commit fixes.

- [ ] **Step 3: Client build check**

```bash
npm run build:client
```

- [ ] **Step 4: Fix any client build errors and commit**

- [ ] **Step 5: Run search tests**

```bash
npx mocha packages/tests/src/api/search/search-videos.ts
npx mocha packages/tests/src/api/search/search-playlists.ts
```

- [ ] **Step 6: Run config tests**

```bash
npx mocha packages/tests/src/api/server/config.ts
```

- [ ] **Step 7: Fix any test failures and commit**

- [ ] **Step 8: Final commit with all fixes**

```bash
git add -A
git commit -m "Fix any remaining issues from verification"
```
