# Loop Controls in Gear Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Loop video" (single-video repeat) and "Loop playlist" toggles to the video player's gear/settings menu for mobile accessibility, with bidirectional state sync between all loop indicators.

**Architecture:** Two new video.js MenuButton components added to the settings menu entries. "Loop video" uses the native HTML5 `player.loop()` API directly. "Loop playlist" uses a controller object passed from the Angular `VideoWatchPlaylistComponent` to bridge Angular state (session storage) with the video.js player. Both toggles fire/subscribe to change events so the existing context-menu and playlist widget indicators stay in sync.

**Tech Stack:** TypeScript, Angular 19, video.js 8.x, RxJS

---

## File Map

### New files
- `client/src/standalone/player/src/shared/settings/loop-video-menu-button.ts` - settings menu entry for single-video loop
- `client/src/standalone/player/src/shared/settings/loop-playlist-menu-button.ts` - settings menu entry for playlist loop (only shown in playlist context)

### Modified
- `client/src/standalone/player/src/peertube-player.ts` - import/register new components; fix context menu to use correct API and emit sync event
- `client/src/standalone/player/src/shared/player-options-builder/control-bar-options-builder.ts` - add menu entries to settings; accept playlistLoopController in constructor options
- `client/src/standalone/player/src/types/peertube-videojs-typings.ts` - add `PlaylistLoopController` type
- `client/src/standalone/player/src/types/peertube-player-options.ts` - add `playlistLoopController` to `PeerTubePlayerLoadOptions`
- `client/src/app/+video-watch/shared/player-widgets/video-watch-playlist.component.ts` - expose change observable and getter
- `client/src/app/+video-watch/video-watch.component.ts` - construct and pass playlist loop controller in load options

---

## Task 1: Add PlaylistLoopController Type

**Files:**
- Modify: `client/src/standalone/player/src/types/peertube-videojs-typings.ts` (after `PlaylistPluginOptions` type, around line 161)
- Modify: `client/src/standalone/player/src/types/peertube-player-options.ts` (in `PeerTubePlayerLoadOptions`, around line 118)

- [ ] **Step 1: Add `PlaylistLoopController` type**

In `client/src/standalone/player/src/types/peertube-videojs-typings.ts`, add after the `PlaylistPluginOptions` type (around line 161):

```typescript
export type PlaylistLoopController = {
  isEnabled: () => boolean
  toggle: () => void
  onChange: (listener: (enabled: boolean) => void) => () => void // returns unsubscribe
}
```

- [ ] **Step 2: Add to `PeerTubePlayerLoadOptions`**

In `client/src/standalone/player/src/types/peertube-player-options.ts`:

Update the import on line 4:
```typescript
import { PlaylistLoopController, PlaylistPluginOptions, VideoJSCaption, VideojsPlayer, VideoJSStoryboard } from './peertube-videojs-typings'
```

Add `playlistLoopController` to `PeerTubePlayerLoadOptions` after the `playlist?` field (around line 118):

```typescript
  playlist?: PlaylistPluginOptions

  playlistLoopController?: PlaylistLoopController

  p2pEnabled: boolean
```

- [ ] **Step 3: Commit**

```bash
git add client/src/standalone/player/src/types/peertube-videojs-typings.ts client/src/standalone/player/src/types/peertube-player-options.ts
git commit -m "Add PlaylistLoopController type to player options"
```

---

## Task 2: Create LoopVideoMenuButton Component

**Files:**
- Create: `client/src/standalone/player/src/shared/settings/loop-video-menu-button.ts`

- [ ] **Step 1: Create the component file**

Create `client/src/standalone/player/src/shared/settings/loop-video-menu-button.ts`:

```typescript
import videojs from 'video.js'
import { VideojsMenu, VideojsMenuButton, VideojsMenuButtonOptions, VideojsMenuItem, VideojsMenuItemOptions, VideojsPlayer } from '../../types'

const Menu = videojs.getComponent('Menu') as typeof VideojsMenu
const MenuButton = videojs.getComponent('MenuButton') as typeof VideojsMenuButton
const MenuItem = videojs.getComponent('MenuItem') as typeof VideojsMenuItem

interface LoopVideoMenuItemOptions extends VideojsMenuItemOptions {
  value: boolean
}

class LoopVideoMenuItem extends MenuItem {
  declare private readonly value: boolean
  declare private readonly updateSelectionHandler: () => void

  constructor (player: VideojsPlayer, options?: LoopVideoMenuItemOptions) {
    super(player, { ...options, selectable: true })

    this.value = options.value

    this.updateSelectionHandler = () => this.updateSelection()
    player.on('loopchange', this.updateSelectionHandler)

    this.updateSelection()
  }

  dispose () {
    this.player().off('loopchange', this.updateSelectionHandler)
    super.dispose()
  }

  handleClick (event: any) {
    super.handleClick(event)

    this.player().loop(this.value)
    this.player().trigger('loopchange')
  }

  updateSelection () {
    this.selected(this.player().loop() === this.value)
  }
}

class LoopVideoMenuButton extends MenuButton {
  declare labelEl_: HTMLElement

  declare private readonly labelUpdateHandler: () => void

  constructor (player: VideojsPlayer, options?: VideojsMenuButtonOptions) {
    super(player, options)

    this.controlText('Loop video')

    this.labelUpdateHandler = () => this.updateLabel()
    player.on('loopchange', this.labelUpdateHandler)
  }

  dispose () {
    this.player().off('loopchange', this.labelUpdateHandler)
    super.dispose()
  }

  createEl () {
    const el = super.createEl()

    this.labelEl_ = videojs.dom.createEl('div', {
      className: 'vjs-resolution-value'
    }) as HTMLElement

    el.appendChild(this.labelEl_)

    return el
  }

  createMenu () {
    const menu = new Menu(this.player_, { menuButton: this })

    menu.addItem(new LoopVideoMenuItem(this.player_, {
      id: 'loop-video-off',
      label: this.player_.localize('Off'),
      value: false
    }))

    menu.addItem(new LoopVideoMenuItem(this.player_, {
      id: 'loop-video-on',
      label: this.player_.localize('On'),
      value: true
    }))

    return menu
  }

  buildCSSClass () {
    return 'vjs-loop-video-button ' + super.buildCSSClass()
  }

  buildWrapperCSSClass () {
    return 'vjs-loop-video-control ' + super.buildWrapperCSSClass()
  }

  update () {
    super.update()
    this.updateLabel()
  }

  private updateLabel () {
    if (!this.labelEl_) return

    this.labelEl_.textContent = this.player_.loop()
      ? this.player_.localize('On')
      : this.player_.localize('Off')

    this.trigger('label-updated')
  }
}

videojs.registerComponent('LoopVideoMenuButton', LoopVideoMenuButton)

export { LoopVideoMenuButton }
```

- [ ] **Step 2: Commit**

```bash
git add client/src/standalone/player/src/shared/settings/loop-video-menu-button.ts
git commit -m "Add LoopVideoMenuButton component for single-video loop toggle"
```

---

## Task 3: Create LoopPlaylistMenuButton Component

**Files:**
- Create: `client/src/standalone/player/src/shared/settings/loop-playlist-menu-button.ts`

- [ ] **Step 1: Create the component file**

Create `client/src/standalone/player/src/shared/settings/loop-playlist-menu-button.ts`:

```typescript
import videojs from 'video.js'
import {
  PlaylistLoopController,
  VideojsMenu,
  VideojsMenuButton,
  VideojsMenuButtonOptions,
  VideojsMenuItem,
  VideojsMenuItemOptions,
  VideojsPlayer
} from '../../types'

const Menu = videojs.getComponent('Menu') as typeof VideojsMenu
const MenuButton = videojs.getComponent('MenuButton') as typeof VideojsMenuButton
const MenuItem = videojs.getComponent('MenuItem') as typeof VideojsMenuItem

interface LoopPlaylistMenuButtonOptions extends VideojsMenuButtonOptions {
  controller?: PlaylistLoopController
}

interface LoopPlaylistMenuItemOptions extends VideojsMenuItemOptions {
  value: boolean
  controller: PlaylistLoopController
}

class LoopPlaylistMenuItem extends MenuItem {
  declare private readonly value: boolean
  declare private readonly controller: PlaylistLoopController
  declare private unsubscribe: () => void

  constructor (player: VideojsPlayer, options?: LoopPlaylistMenuItemOptions) {
    super(player, { ...options, selectable: true })

    this.value = options.value
    this.controller = options.controller

    this.unsubscribe = this.controller.onChange(() => this.updateSelection())

    this.updateSelection()
  }

  dispose () {
    if (this.unsubscribe) this.unsubscribe()
    super.dispose()
  }

  handleClick (event: any) {
    super.handleClick(event)

    if (this.controller.isEnabled() !== this.value) {
      this.controller.toggle()
    }
  }

  updateSelection () {
    this.selected(this.controller.isEnabled() === this.value)
  }
}

class LoopPlaylistMenuButton extends MenuButton {
  declare labelEl_: HTMLElement
  declare private readonly controller: PlaylistLoopController
  declare private unsubscribe: () => void

  constructor (player: VideojsPlayer, options?: LoopPlaylistMenuButtonOptions) {
    super(player, options)

    this.controller = options.controller

    this.controlText('Loop playlist')

    this.unsubscribe = this.controller.onChange(() => this.updateLabel())
  }

  dispose () {
    if (this.unsubscribe) this.unsubscribe()
    super.dispose()
  }

  createEl () {
    const el = super.createEl()

    this.labelEl_ = videojs.dom.createEl('div', {
      className: 'vjs-resolution-value'
    }) as HTMLElement

    el.appendChild(this.labelEl_)

    return el
  }

  createMenu () {
    const menu = new Menu(this.player_, { menuButton: this })

    menu.addItem(new LoopPlaylistMenuItem(this.player_, {
      id: 'loop-playlist-off',
      label: this.player_.localize('Off'),
      value: false,
      controller: this.controller
    }))

    menu.addItem(new LoopPlaylistMenuItem(this.player_, {
      id: 'loop-playlist-on',
      label: this.player_.localize('On'),
      value: true,
      controller: this.controller
    }))

    return menu
  }

  buildCSSClass () {
    return 'vjs-loop-playlist-button ' + super.buildCSSClass()
  }

  buildWrapperCSSClass () {
    return 'vjs-loop-playlist-control ' + super.buildWrapperCSSClass()
  }

  update () {
    super.update()
    this.updateLabel()
  }

  private updateLabel () {
    if (!this.labelEl_) return

    this.labelEl_.textContent = this.controller.isEnabled()
      ? this.player_.localize('On')
      : this.player_.localize('Off')

    this.trigger('label-updated')
  }
}

videojs.registerComponent('LoopPlaylistMenuButton', LoopPlaylistMenuButton)

export { LoopPlaylistMenuButton }
```

- [ ] **Step 2: Commit**

```bash
git add client/src/standalone/player/src/shared/settings/loop-playlist-menu-button.ts
git commit -m "Add LoopPlaylistMenuButton component for playlist loop toggle"
```

---

## Task 4: Register Components and Fix Context Menu

**Files:**
- Modify: `client/src/standalone/player/src/peertube-player.ts` - add imports and fix context menu

- [ ] **Step 1: Add imports for new components**

In `client/src/standalone/player/src/peertube-player.ts`, add after the existing settings imports (after line 41 `import './shared/settings/settings-menu-item'`):

```typescript
import './shared/settings/loop-video-menu-button'
import './shared/settings/loop-playlist-menu-button'
```

Place these alongside the other `./shared/settings/*` imports, maintaining alphabetical order within that group.

- [ ] **Step 2: Fix context menu to use correct video.js API and emit sync event**

In `client/src/standalone/player/src/peertube-player.ts`, find the context menu options (around lines 537-547):

```typescript
      const shortUUID = self.currentLoadOptions.videoShortUUID
      const isLoopEnabled = player.options_.loop

      const items = [
        {
          icon: 'repeat',
          label: player.localize('Play in loop') + (isLoopEnabled ? '<span class="vjs-icon-tick-white"></span>' : ''),
          listener: function () {
            player.options_.loop = !isLoopEnabled
          }
        },
```

Replace with:

```typescript
      const shortUUID = self.currentLoadOptions.videoShortUUID
      const isLoopEnabled = player.loop()

      const items = [
        {
          icon: 'repeat',
          label: player.localize('Play in loop') + (isLoopEnabled ? '<span class="vjs-icon-tick-white"></span>' : ''),
          listener: function () {
            player.loop(!player.loop())
            player.trigger('loopchange')
          }
        },
```

- [ ] **Step 3: Commit**

```bash
git add client/src/standalone/player/src/peertube-player.ts
git commit -m "Register loop menu components and fix context menu loop toggle API"
```

---

## Task 5: Wire Menu Entries Into Settings

**Files:**
- Modify: `client/src/standalone/player/src/shared/player-options-builder/control-bar-options-builder.ts`

- [ ] **Step 1: Accept playlistLoopController in constructor options**

In `client/src/standalone/player/src/shared/player-options-builder/control-bar-options-builder.ts`, update the import on line 1-7 to include the new type:

```typescript
import {
  NextPreviousVideoButtonOptions,
  PeerTubeLinkButtonOptions,
  PeerTubePlayerConstructorOptions,
  PeerTubePlayerLoadOptions,
  PlaylistLoopController,
  TheaterButtonOptions
} from '../../types'
```

Update `ControlBarOptionsBuilderConstructorOptions` (lines 9-17) to add a `playlistLoopController` field:

```typescript
type ControlBarOptionsBuilderConstructorOptions =
  & Pick<PeerTubePlayerConstructorOptions, 'peertubeLink' | 'instanceName' | 'theaterButton'>
  & {
    videoShortUUID: () => string
    p2pEnabled: () => boolean

    previousVideo: () => PeerTubePlayerLoadOptions['previousVideo']
    nextVideo: () => PeerTubePlayerLoadOptions['nextVideo']

    playlistLoopController: () => PlaylistLoopController | undefined
  }
```

- [ ] **Step 2: Add menu entries in `getSettingsButton()`**

Replace the `getSettingsButton()` method (lines 55-70) with:

```typescript
  private getSettingsButton () {
    const settingEntries: string[] = []

    settingEntries.push('playbackRateMenuButton')
    settingEntries.push('captionsButton')
    settingEntries.push('resolutionMenuButton')
    settingEntries.push('loopVideoMenuButton')

    const playlistLoopController = this.options.playlistLoopController()
    if (playlistLoopController) {
      settingEntries.push('loopPlaylistMenuButton')
    }

    return {
      settingsButton: {
        setup: {
          maxHeightOffset: 60
        },
        entries: settingEntries,
        controller: playlistLoopController
      }
    }
  }
```

Note: The `controller` field gets attached to the settings button options, which are then passed to every submenu component constructor (via `addMenuItem()` in `settings-menu-button.ts:237`). Only `LoopPlaylistMenuButton` reads it; other submenus ignore it.

- [ ] **Step 3: Commit**

```bash
git add client/src/standalone/player/src/shared/player-options-builder/control-bar-options-builder.ts
git commit -m "Wire loop menu entries into settings button"
```

---

## Task 6: Pass playlistLoopController From PeerTubePlayer to ControlBarOptionsBuilder

**Files:**
- Modify: `client/src/standalone/player/src/peertube-player.ts` - find where `ControlBarOptionsBuilder` is instantiated and add the controller option

- [ ] **Step 1: Locate ControlBarOptionsBuilder instantiation**

Search for `new ControlBarOptionsBuilder` in `client/src/standalone/player/src/peertube-player.ts`. There's typically one call site where the constructor options are built.

Read the file to locate the exact call (it passes options including `previousVideo` and `nextVideo` getters).

- [ ] **Step 2: Add playlistLoopController to the options passed**

Add this to the options object passed to `new ControlBarOptionsBuilder(...)`:

```typescript
playlistLoopController: () => this.currentLoadOptions.playlistLoopController
```

The object should now include `playlistLoopController` alongside the existing `videoShortUUID`, `p2pEnabled`, `previousVideo`, and `nextVideo` getters.

- [ ] **Step 3: Commit**

```bash
git add client/src/standalone/player/src/peertube-player.ts
git commit -m "Pass playlistLoopController from load options to control bar builder"
```

---

## Task 7: Expose Change Observable in VideoWatchPlaylistComponent

**Files:**
- Modify: `client/src/app/+video-watch/shared/player-widgets/video-watch-playlist.component.ts`

- [ ] **Step 1: Import Subject and Observable**

In `client/src/app/+video-watch/shared/player-widgets/video-watch-playlist.component.ts`, ensure RxJS `Subject` and `Observable` are imported. Check existing imports at the top of the file - if RxJS imports aren't present yet, add:

```typescript
import { Observable, Subject } from 'rxjs'
```

- [ ] **Step 2: Add change observable and getter**

Add a private Subject and public Observable to the `VideoWatchPlaylistComponent` class near the other member declarations (after the existing `loopPlaylistSwitchText` line, around line 58):

```typescript
  loopPlaylist: boolean
  loopPlaylistSwitchText = ''

  private readonly loopPlaylistChangeSubject = new Subject<boolean>()
  readonly loopPlaylistChange$: Observable<boolean> = this.loopPlaylistChangeSubject.asObservable()
```

- [ ] **Step 3: Emit change event in `switchLoopPlaylist()`**

Find the `switchLoopPlaylist()` method (around lines 263-271) and update it:

```typescript
  switchLoopPlaylist () {
    this.loopPlaylist = !this.loopPlaylist
    this.setLoopPlaylistSwitchText()

    peertubeSessionStorage.setItem(
      VideoWatchPlaylistComponent.SESSION_STORAGE_LOOP_PLAYLIST,
      this.loopPlaylist.toString()
    )

    this.loopPlaylistChangeSubject.next(this.loopPlaylist)
  }
```

- [ ] **Step 4: Add getter for current state**

Add a getter method after `switchLoopPlaylist()` (before the private `setAutoPlayNextVideoPlaylistSwitchText()`):

```typescript
  getLoopPlaylist () {
    return this.loopPlaylist
  }
```

- [ ] **Step 5: Commit**

```bash
git add client/src/app/+video-watch/shared/player-widgets/video-watch-playlist.component.ts
git commit -m "Expose loopPlaylist change observable and getter"
```

---

## Task 8: Construct and Pass Playlist Loop Controller

**Files:**
- Modify: `client/src/app/+video-watch/video-watch.component.ts`

- [ ] **Step 1: Add playlistLoopController to load options**

In `client/src/app/+video-watch/video-watch.component.ts`, find `buildPeerTubePlayerLoadOptions()` (starts around line 750). Look for the return object (around line 846).

Add the controller within the returned object. A good spot is right before the `upnext:` property (around line 912). Insert:

```typescript
      playlistLoopController: this.playlist
        ? {
          isEnabled: () => this.videoWatchPlaylist().getLoopPlaylist(),
          toggle: () => this.zone.run(() => this.videoWatchPlaylist().switchLoopPlaylist()),
          onChange: (listener) => {
            const sub = this.videoWatchPlaylist().loopPlaylistChange$.subscribe(listener)
            return () => sub.unsubscribe()
          }
        }
        : undefined,

      upnext: {
```

So the block of context should look like:

```typescript
      nextVideo: {
        enabled: this.hasNextVideo(),
        handler: () => this.playNextVideoInAngularZone(),
        getVideoTitle: () => this.getNextVideoTitle(),
        displayControlBarButton: this.hasNextVideo()
      },

      playlistLoopController: this.playlist
        ? {
          isEnabled: () => this.videoWatchPlaylist().getLoopPlaylist(),
          toggle: () => this.zone.run(() => this.videoWatchPlaylist().switchLoopPlaylist()),
          onChange: (listener) => {
            const sub = this.videoWatchPlaylist().loopPlaylistChange$.subscribe(listener)
            return () => sub.unsubscribe()
          }
        }
        : undefined,

      upnext: {
        isEnabled: () => {
```

- [ ] **Step 2: Commit**

```bash
git add client/src/app/+video-watch/video-watch.component.ts
git commit -m "Construct and pass playlist loop controller to player"
```

---

## Task 9: Final Verification

- [ ] **Step 1: TypeScript compilation check**

Run the Angular TypeScript compiler to verify no type errors in our changed files:

```bash
node_modules/.bin/tsc --noEmit -p client/tsconfig.json 2>&1 | grep -E "loop-video-menu-button|loop-playlist-menu-button|video-watch-playlist|video-watch.component|control-bar-options-builder|peertube-player\.ts|peertube-videojs-typings|peertube-player-options" | head -40
```

Expected: No errors in our files. If errors appear, fix them. Note: Pre-existing module resolution errors (`Cannot find module '@peertube/peertube-models'`) are unrelated and should be ignored.

- [ ] **Step 2: Fix any type errors specific to our changes**

If the compiler reports errors in the files we modified, address them. The most likely issues:
- Missing `VideojsMenu`, `VideojsMenuItem`, or other video.js type exports
- Incorrect type imports

Check `client/src/standalone/player/src/types/index.ts` for re-exports. If `PlaylistLoopController` isn't exported there, add:

```typescript
export { PlaylistLoopController } from './peertube-videojs-typings'
```

Commit any fixes:
```bash
git add -A && git commit -m "Fix type errors from loop menu integration"
```

- [ ] **Step 3: Manual smoke test plan**

Since this is a UI feature, note the manual test scenarios for later verification (not part of automated tests):

1. **Standalone video**: Open any video. Click gear icon. Verify "Loop video" is in the list. Toggle to "On". Video should loop at end.
2. **Context menu sync**: Right-click the video. Verify "Play in loop" shows a checkmark when gear "Loop video" is On. Toggle via context menu. Verify gear menu label updates to match.
3. **Video navigation**: With "Loop video" on, navigate to a different video. Verify loop resets to Off.
4. **Playlist context**: Open a video from a playlist. Click gear icon. Verify "Loop video" AND "Loop playlist" are present.
5. **Playlist loop sync**: Toggle "Loop playlist" on via gear menu. Verify the playlist widget sidebar toggle reflects the change. Toggle via widget. Verify gear menu updates.
6. **Both on**: Turn on both "Loop video" and "Loop playlist". Verify the single video loops (native loop wins).
