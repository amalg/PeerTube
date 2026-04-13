# Loop Controls in Gear Menu - Design Spec

## Overview

Add two loop-control toggles to the video player's settings (gear) menu so that mobile users have easy access to loop features currently buried in the right-click context menu (single video loop) and the playlist sidebar widget (playlist loop).

## Goals

1. **Mobile accessibility** - both loop features should be reachable without right-click or sidebar access.
2. **State synchronization** - every indicator/control for each loop mode reflects the same state. Toggling one updates all.
3. **Minimal disruption** - existing controls (right-click context menu, playlist widget checkbox) are preserved; the gear menu simply provides an additional access point.

## Features

### 1. "Loop video" (repeat-1) - new

- **Location in gear menu**: always present, regardless of playlist context.
- **Behavior**: when on, the native HTML5 `<video loop>` attribute is set. The video repeats indefinitely. Because `ended` never fires, auto-play-next is naturally suppressed.
- **State persistence**: in-memory on the player instance only. Resets when the player is disposed (i.e., when the user navigates to a different video).
- **Sync targets**: right-click context menu "Play in loop" item.

### 2. "Loop playlist" (repeat-all) - new access point, existing feature

- **Location in gear menu**: only present when viewing a video inside a playlist.
- **Behavior**: toggles the existing `loopPlaylist` state on the `VideoWatchPlaylistComponent`. Existing behavior retained - loop state persists in session storage; navigation wraps around the playlist end.
- **Sync targets**: existing playlist widget sidebar toggle.

## Non-Goals

- No changes to hotkeys.
- No changes to the existing playlist widget checkbox's persistence behavior.
- No single-unified "cycle" toggle. Two independent toggles.
- Standalone videos do not get a playlist loop option (there's no playlist).

## Architecture

### State locations

| State | Lives on | Persistence | Affects |
|-------|----------|-------------|---------|
| `loopVideo` | Player instance (video.js `player.loop()`) | In-memory, per player instance | Native `<video loop>` attribute |
| `loopPlaylist` | `VideoWatchPlaylistComponent.loopPlaylist` | Session storage | `findPlaylistVideo()` wrap-around logic |

### Sync mechanism for "Loop video"

The native loop attribute is the single source of truth. Both access points (gear menu + context menu) read via `player.loop()` and write via `player.loop(value)`.

To keep the visual indicators (checkmark on context menu, toggle state on gear menu) in sync, we fire a custom `loopchange` event on the player whenever loop is toggled from anywhere. Each menu item listens for this event and updates its own display.

### Sync mechanism for "Loop playlist"

The Angular `VideoWatchPlaylistComponent` owns the state. To let the gear menu (which lives inside the video.js player) read and write this state, we pass a controller object into the player options:

```typescript
type PlaylistLoopController = {
  isEnabled: () => boolean
  toggle: () => void
  onChange: (listener: (enabled: boolean) => void) => () => void  // returns unsubscribe
}
```

- `video-watch-playlist.component.ts` adds an `EventEmitter<boolean>` (or Subject) that fires when `loopPlaylist` changes.
- `video-watch.component.ts` constructs a controller wrapping the component's methods and passes it in `buildPeerTubePlayerLoadOptions()`.
- The gear menu item uses the controller to read initial state, subscribe to changes, and toggle on click.

## Player Integration Points

### New component: `LoopVideoMenuButton`

File: `client/src/standalone/player/src/shared/settings/loop-video-menu-button.ts`

Follows the pattern of existing settings entries (e.g., reviewing `resolution-menu-button.ts` in same directory for shape).

Responsibilities:
- Renders a menu entry with a label "Loop video"
- Shows current state (on/off indicator)
- On click, flips `player.loop()` and fires `loopchange` event
- Listens for `loopchange` events from other sources to update display

### New component: `LoopPlaylistMenuButton`

File: `client/src/standalone/player/src/shared/settings/loop-playlist-menu-button.ts`

Similar shape to `LoopVideoMenuButton` but:
- Only instantiated when `playlistLoopController` is present in options
- Reads state via `controller.isEnabled()`
- Writes via `controller.toggle()`
- Subscribes to `controller.onChange(...)` to update display

### Registration

In `client/src/standalone/player/src/peertube-player.ts`:
- Import both new components
- Register them with `videojs.registerComponent(...)`

In `client/src/standalone/player/src/shared/player-options-builder/control-bar-options-builder.ts`:
- Add `'loopVideoMenuButton'` to the settings entries array unconditionally
- Add `'loopPlaylistMenuButton'` conditionally when `playlistLoopController` is provided

## Context Menu Update

File: `client/src/standalone/player/src/peertube-player.ts` (existing context menu options, ~line 532-589)

The current implementation sets `player.options_.loop = !isLoopEnabled`, which modifies the player options object but may not actually toggle the `<video>` element's loop attribute on a running player. Replace with the correct API:

```typescript
{
  icon: 'repeat',
  label: player.localize('Play in loop') + (player.loop() ? '<span class="vjs-icon-tick-white"></span>' : ''),
  listener: function () {
    player.loop(!player.loop())
    player.trigger('loopchange')
  }
}
```

This fix:
1. Uses `player.loop()` (getter) and `player.loop(value)` (setter) - the correct video.js API.
2. Fires `loopchange` so the gear menu updates in sync.

Since the context menu is rebuilt each time it's opened, it will read fresh state via `player.loop()` automatically - no additional listener needed.

## Angular Integration

### `video-watch-playlist.component.ts` changes

Add an observable that fires when `loopPlaylist` changes:

```typescript
private readonly loopPlaylistChange = new Subject<boolean>()

readonly loopPlaylistChange$ = this.loopPlaylistChange.asObservable()

switchLoopPlaylist () {
  this.loopPlaylist = !this.loopPlaylist
  this.setLoopPlaylistSwitchText()

  peertubeSessionStorage.setItem(
    VideoWatchPlaylistComponent.SESSION_STORAGE_LOOP_PLAYLIST,
    this.loopPlaylist.toString()
  )

  this.loopPlaylistChange.next(this.loopPlaylist)
}
```

Expose a getter:

```typescript
getLoopPlaylist () {
  return this.loopPlaylist
}
```

### `video-watch.component.ts` changes

In `buildPeerTubePlayerLoadOptions()`, when `this.playlist` is truthy, construct and pass a controller:

```typescript
if (this.playlist) {
  const widget = this.videoWatchPlaylist()
  loadOptions.playlistLoopController = {
    isEnabled: () => widget.getLoopPlaylist(),
    toggle: () => widget.switchLoopPlaylist(),
    onChange: (listener) => {
      const sub = widget.loopPlaylistChange$.subscribe(listener)
      return () => sub.unsubscribe()
    }
  }
}
```

### `peertube-player-options.ts` changes

Add the controller to the load options type:

```typescript
export type PlaylistLoopController = {
  isEnabled: () => boolean
  toggle: () => void
  onChange: (listener: (enabled: boolean) => void) => () => void
}

// In PeerTubePlayerLoadOptions:
playlistLoopController?: PlaylistLoopController
```

## Visual Design

- Both menu items use the existing `repeat.svg` icon (already in `client/src/standalone/player/src/sass/svg/repeat.svg`).
- Menu label shows state: "Loop video: Off" / "Loop video: On" (or uses a checkmark indicator matching video.js conventions - whichever pattern the existing settings items use).
- For consistency, match the visual style of the existing `playbackRateMenuButton`, `captionsButton`, and `resolutionMenuButton` entries.

## Edge Cases

- **Both "Loop video" and "Loop playlist" on simultaneously**: native loop wins (video never ends, `ended` never fires, playlist navigation doesn't happen). When user disables "Loop video", playlist loop resumes functioning. This is intentional and matches user expectations (most specific takes precedence).
- **Player disposed while loop video is on**: state resets automatically since new player has fresh `loop()` state (default false).
- **Navigate to different video in playlist while loop video is on**: player is disposed, new one created, loop video resets - this matches the spec requirement that loop-1 resets on any video change.
- **Disable auto-play while in playlist**: has no bearing on either loop. Loop video works independently; loop playlist only affects `findPlaylistVideo()` wrap-around, which is only consulted when auto-play is enabled.

## Files Changed (Summary)

**New files:**
- `client/src/standalone/player/src/shared/settings/loop-video-menu-button.ts`
- `client/src/standalone/player/src/shared/settings/loop-playlist-menu-button.ts`

**Modified:**
- `client/src/standalone/player/src/peertube-player.ts` - register components, fix context menu
- `client/src/standalone/player/src/shared/player-options-builder/control-bar-options-builder.ts` - add menu entries
- `client/src/standalone/player/src/types/peertube-videojs-typings.ts` - add `PlaylistLoopController` type
- `client/src/standalone/player/src/peertube-player-options.ts` - add controller to load options type
- `client/src/app/+video-watch/shared/player-widgets/video-watch-playlist.component.ts` - expose change observable + getter
- `client/src/app/+video-watch/video-watch.component.ts` - construct and pass playlist loop controller
