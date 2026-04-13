import Phaser from 'phaser'
import { BootScene } from './game/scenes/BootScene'
import { GameScene } from './game/scenes/GameScene'
import { TARGET_FPS } from './game/config'

const config: Phaser.Types.Core.GameConfig & { resolution?: number } = {
  type: Phaser.AUTO,
  backgroundColor: '#000000',
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  resolution: window.devicePixelRatio as number,
  fps: { target: TARGET_FPS, forceSetTimeOut: false },
  input: {
    activePointers: 3,
    touch: { capture: true },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,   // canvas fills the window; game world zoom handles scale
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, GameScene],
}

const game = new Phaser.Game(config)

game.events.once(Phaser.Core.Events.READY, () => {
  const loader = document.getElementById('loader')
  if (loader) {
    loader.classList.add('fade-out')
    loader.addEventListener('transitionend', () => loader.remove(), { once: true })
  }
})
