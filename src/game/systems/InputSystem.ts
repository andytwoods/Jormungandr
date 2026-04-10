import Phaser from 'phaser'
import type { InputState } from '../types'

export class InputSystem {
  private leftHeld = false
  private rightHeld = false
  private restartPressed = false

  private keys!: {
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
    a: Phaser.Input.Keyboard.Key
    d: Phaser.Input.Keyboard.Key
    r: Phaser.Input.Keyboard.Key
  }

  // Touch tracking: pointer id → which side
  private touchSides = new Map<number, 'left' | 'right'>()

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!

    this.keys = {
      left:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      a:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      r:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    }

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Use raw screen X vs half screen width
      const side = p.x < scene.scale.width / 2 ? 'left' : 'right'
      this.touchSides.set(p.id, side)
    })

    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.touchSides.delete(p.id)
    })

    // Also cancel touches that move off screen
    scene.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => {
      this.touchSides.delete(p.id)
    })
  }

  update(): void {
    const kbLeft  = this.keys.left.isDown  || this.keys.a.isDown
    const kbRight = this.keys.right.isDown || this.keys.d.isDown

    let touchLeft = false
    let touchRight = false
    for (const side of this.touchSides.values()) {
      if (side === 'left')  touchLeft = true
      if (side === 'right') touchRight = true
    }

    this.leftHeld  = kbLeft  || touchLeft
    this.rightHeld = kbRight || touchRight
    this.restartPressed = Phaser.Input.Keyboard.JustDown(this.keys.r)
  }

  getState(): InputState {
    return { leftHeld: this.leftHeld, rightHeld: this.rightHeld }
  }

  isRestartPressed(): boolean { return this.restartPressed }

  destroy(): void {
    // Keys are cleaned up by Phaser when scene shuts down
  }
}
