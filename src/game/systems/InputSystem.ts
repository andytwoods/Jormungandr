import Phaser from 'phaser'
import type { InputState } from '../types'

export class InputSystem {
  private touchHeld = false
  private restartPressed = false

  private keys!: {
    space: Phaser.Input.Keyboard.Key
    r: Phaser.Input.Keyboard.Key
  }

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!

    this.keys = {
      space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      r:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    }

    scene.input.on('pointerdown',    () => { this.touchHeld = true })
    scene.input.on('pointerup',      () => { this.touchHeld = false })
    scene.input.on('pointerupoutside', () => { this.touchHeld = false })
  }

  update(): void {
    this.restartPressed = Phaser.Input.Keyboard.JustDown(this.keys.r) ||
                          Phaser.Input.Keyboard.JustDown(this.keys.space)
  }

  get upHeld(): boolean {
    return this.touchHeld || this.keys.space.isDown
  }

  getState(): InputState {
    return { upHeld: this.upHeld }
  }

  isRestartPressed(): boolean { return this.restartPressed }

  destroy(): void {}
}
