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
