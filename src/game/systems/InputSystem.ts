import Phaser from 'phaser'
import type { InputState } from '../types'

export class InputSystem {
  private upHeld = false
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

    scene.input.on('pointerdown', () => { this.upHeld = true })
    scene.input.on('pointerup',   () => { this.upHeld = false })
    scene.input.on('pointerupoutside', () => { this.upHeld = false })
  }

  update(): void {
    this.upHeld = this.keys.space.isDown
    this.restartPressed = Phaser.Input.Keyboard.JustDown(this.keys.r) ||
                          Phaser.Input.Keyboard.JustDown(this.keys.space)
  }

  getState(): InputState {
    return { upHeld: this.upHeld }
  }

  isRestartPressed(): boolean { return this.restartPressed }

  destroy(): void {}
}
