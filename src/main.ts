import Phaser from 'phaser'
import { BootScene } from './game/scenes/BootScene'
import { GameScene } from './game/scenes/GameScene'
import { TARGET_FPS } from './game/config'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#000000',
  pixelArt: false,   // native resolution — no pixel scaling
  antialias: true,
  roundPixels: false,
  fps: { target: TARGET_FPS, forceSetTimeOut: false },
  scale: {
    mode: Phaser.Scale.RESIZE,   // canvas fills the window; game world zoom handles scale
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, GameScene],
}

new Phaser.Game(config)
