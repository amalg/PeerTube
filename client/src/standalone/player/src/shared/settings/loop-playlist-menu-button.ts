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
  controller: PlaylistLoopController
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
