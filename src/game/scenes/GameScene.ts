import Phaser from 'phaser'
import { SerpentHead } from '../entities/SerpentHead'
import { SerpentBody } from '../entities/SerpentBody'
import { buildHazardRuntime, type HazardRuntime } from '../entities/Hazard'
import { InputSystem } from '../systems/InputSystem'
import { updateMovement, baseMovementStats, type MovementStats } from '../systems/MovementSystem'
import { GrowthSystem } from '../systems/GrowthSystem'
import { checkDeath, checkFoodCollection } from '../systems/CollisionSystem'
import { spawnFood, generateHazards, addHazard } from '../systems/SpawnSystem'
import type { FoodItem, GameState } from '../types'
import {
  radialUnit, tangentUnit, angleFromCentre,
  altitude, lerp, normalize
} from '../utils/math'
import type { BodySample } from '../types'
import {
  PLANET_RADIUS, INITIAL_FOOD_COUNT, INITIAL_HAZARD_COUNT,
  CAMERA_BASE_ZOOM, CAMERA_MAX_ZOOM_OUT, CAMERA_SMOOTHING,
  INITIAL_BODY_SAMPLES, BODY_WIDTH_HEAD, BODY_WIDTH_TAIL,
  HEAD_COLLISION_RADIUS, FOOD_RADIUS, HAZARD_ADD_INTERVAL, HAZARD_SOFT_MAX,
  PLAYABLE_ALT_MAX, MAX_SPEED, MIN_TANGENTIAL_SPEED
} from '../config'

const CENTRE = { x: 0, y: 0 }
const SPAWN_ANGLE = Math.PI / 2  // bottom of planet

// Colours
const COL_SKY_LOW    = 0x0a0a1a
const COL_PLANET     = 0x1a2a1a
const COL_PLANET_RIM = 0x2a4a2a
const COL_BODY       = 0x3a8a1a
const COL_BODY_DARK  = 0x2a5a0a
const COL_HEAD       = 0x7fff00
const COL_EYE        = 0x001a00
const COL_FOOD       = 0xffd700
const COL_FOOD_GLOW  = 0xffaa00
const COL_HAZARD     = 0x4a3018
const COL_HAZARD_TIP = 0x6a4828
const COL_PULSE      = 0xffffff
const COL_WARN_TINT  = 0x3a1800

export class GameScene extends Phaser.Scene {
  private head!: SerpentHead
  private body!: SerpentBody
  private inputSys!: InputSystem
  private growth!: GrowthSystem

  private foods: FoodItem[] = []
  private hazards: HazardRuntime[] = []

  private gameState: GameState = 'PLAYING'
  private score = 0
  private bestScore = 0
  private foodsSinceLastHazard = 0
  private movementStats: MovementStats = baseMovementStats()

  private gfx!: Phaser.GameObjects.Graphics
  private scoreText!: Phaser.GameObjects.Text
  private deathPanel!: Phaser.GameObjects.Container
  private deathScoreText!: Phaser.GameObjects.Text
  private deathBestText!: Phaser.GameObjects.Text

  // Camera follow target
  private camTarget!: Phaser.GameObjects.Container
  private currentZoom = CAMERA_BASE_ZOOM
  private baseZoom = CAMERA_BASE_ZOOM

  constructor() { super({ key: 'GameScene' }) }

  create(): void {
    this.head = new SerpentHead(CENTRE)
    this.body = new SerpentBody()
    this.inputSys = new InputSystem(this)
    this.growth = new GrowthSystem()

    // Seed body buffer with a trail extending backward from spawn position.
    // Must push tail-first so the most recent entry (writePtr-1) is the head.
    // Trail extends in the direction opposite to initial velocity (CCW at spawn bottom).
    this.seedBodyBuffer()

    // Generate hazards
    const hazardItems = generateHazards(INITIAL_HAZARD_COUNT, SPAWN_ANGLE)
    this.hazards = hazardItems.map(h => buildHazardRuntime(h, CENTRE, PLANET_RADIUS))

    // Spawn initial food
    this.foods = []
    this.spawnFoodBatch(INITIAL_FOOD_COUNT)

    // Camera — zoom computed from actual camera height so planet fills ~80% regardless of screen size
    this.baseZoom = this.computeBaseZoom()
    this.currentZoom = this.baseZoom
    this.camTarget = this.add.container(this.head.position.x, this.head.position.y)
    this.cameras.main.startFollow(this.camTarget, false, CAMERA_SMOOTHING, CAMERA_SMOOTHING)
    this.cameras.main.setZoom(this.currentZoom)

    // Graphics layer (drawn every frame)
    this.gfx = this.add.graphics()
    this.gfx.setDepth(0)

    // Score text — font size relative to camera height so it's readable at any resolution
    const fs = Math.round(this.cameras.main.height * 0.025)
    this.scoreText = this.add.text(16, 12, 'score: 0', {
      fontSize: `${fs}px`,
      color: '#ffffd0',
      fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(10)

    // Death overlay
    this.buildDeathOverlay()

    // Recompute zoom and UI on window resize
    this.scale.on('resize', () => {
      this.baseZoom = this.computeBaseZoom()
      this.currentZoom = this.baseZoom
      this.cameras.main.setZoom(this.currentZoom)
      this.repositionDeathPanel()
    })
  }

  private computeBaseZoom(): number {
    // Planet diameter fills 80% of camera height
    return (this.cameras.main.height * 0.8) / (PLANET_RADIUS * 2)
  }

  private buildDeathOverlay(): void {
    const cx = this.cameras.main.width / 2
    const cy = this.cameras.main.height / 2
    const fs = Math.round(this.cameras.main.height * 0.025)

    this.deathPanel = this.add.container(cx, cy).setScrollFactor(0).setDepth(20).setVisible(false)

    const bg = this.add.rectangle(0, 0, 320, 130, 0x000000, 0.82)
    this.deathScoreText = this.add.text(0, -32, '', {
      fontSize: `${fs + 4}px`, color: '#ffd700', fontFamily: 'monospace', align: 'center'
    }).setOrigin(0.5)
    this.deathBestText = this.add.text(0, 4, '', {
      fontSize: `${fs}px`, color: '#ffffd0', fontFamily: 'monospace', align: 'center'
    }).setOrigin(0.5)
    const hint = this.add.text(0, fs + 16, 'tap or press space to restart', {
      fontSize: `${Math.round(fs * 0.8)}px`, color: '#aaaaaa', fontFamily: 'monospace', align: 'center'
    }).setOrigin(0.5)

    this.deathPanel.add([bg, this.deathScoreText, this.deathBestText, hint])

    // Tap anywhere to restart in DEAD state
    this.input.on('pointerdown', () => {
      if (this.gameState === 'DEAD') this.resetGame()
    })
  }

  private repositionDeathPanel(): void {
    if (this.deathPanel) {
      this.deathPanel.setPosition(this.cameras.main.width / 2, this.cameras.main.height / 2)
    }
  }

  /** Re-compute movement + body stats from current score */
  private recomputeStats(): void {
    const f = this.score
    this.movementStats = {
      maxSpeed:           MAX_SPEED            + f * 30,   // +30 speed per food
      minTangentialSpeed: MIN_TANGENTIAL_SPEED + f * 12,   // +12 orbital floor per food
      playableAltMax:     PLAYABLE_ALT_MAX     + f * 10,   // +10 altitude ceiling per food
    }
  }

  /** Dynamic body widths based on score */
  private bodyHeadWidth(): number { return BODY_WIDTH_HEAD + this.score * 0.8 }
  private bodyTailWidth(): number { return BODY_WIDTH_TAIL + this.score * 0.4 }

  update(time: number, delta: number): void {
    const dtSec = delta / 1000
    const nowMs = time

    this.inputSys.update()

    if (this.gameState === 'PLAYING') {
      this.updatePlaying(nowMs, dtSec)
    } else {
      // DEAD: check for restart input
      if (this.inputSys.isRestartPressed()) this.resetGame()
    }

    this.renderFrame(nowMs)
  }

  private updatePlaying(nowMs: number, dtSec: number): void {
    const inputState = this.inputSys.getState()

    // Physics
    updateMovement(this.head, inputState, dtSec, this.movementStats)

    // Push head position into body buffer
    this.body.push(this.head.position.x, this.head.position.y)

    // Growth system
    this.growth.update(nowMs, this.body)

    // Get current body samples for collision and rendering
    const samples = this.body.getSamples(this.body.visibleSampleCount)

    // Collision checks
    const cause = checkDeath(this.head.position.x, this.head.position.y, samples, this.hazards)
    if (cause !== null) {
      this.triggerDeath(nowMs)
      return
    }

    // Food collection
    const eaten = checkFoodCollection(this.head.position.x, this.head.position.y, this.foods)
    if (eaten >= 0) {
      this.foods.splice(eaten, 1)
      this.score++
      this.foodsSinceLastHazard++
      this.growth.onFoodEaten(nowMs)
      this.recomputeStats()
      this.scoreText.setText(`score: ${this.score}`)

      // Difficulty ramp: add hazard every N foods
      if (this.foodsSinceLastHazard >= HAZARD_ADD_INTERVAL && this.hazards.length < HAZARD_SOFT_MAX) {
        this.foodsSinceLastHazard = 0
        const newHazardItem = addHazard(this.hazards, SPAWN_ANGLE)
        if (newHazardItem) {
          this.hazards.push(buildHazardRuntime(newHazardItem, CENTRE, PLANET_RADIUS))
        }
      }

      // Spawn replacement food
      const headAngle = angleFromCentre(this.head.position, CENTRE)
      const newFood = spawnFood(samples, this.foods, this.head.position.x, this.head.position.y, headAngle)
      if (newFood) this.foods.push(newFood)
    }

    // Update camera target
    this.camTarget.setPosition(this.head.position.x, this.head.position.y)

    // Dynamic zoom: zoom out up to 15% as serpent grows
    const growthFraction = Math.min(1, (this.body.visibleSampleCount - INITIAL_BODY_SAMPLES) / 80)
    const zoomOutFactor = lerp(1.0, CAMERA_MAX_ZOOM_OUT / CAMERA_BASE_ZOOM, growthFraction)
    const targetZoom = this.baseZoom * zoomOutFactor
    this.currentZoom = lerp(this.currentZoom, targetZoom, 0.02)
    this.cameras.main.setZoom(this.currentZoom)
  }

  private triggerDeath(_nowMs: number): void {
    this.gameState = 'DEAD'
    if (this.score > this.bestScore) this.bestScore = this.score
    this.deathScoreText.setText(`score: ${this.score}`)
    this.deathBestText.setText(`best: ${this.bestScore}`)
    this.deathPanel.setVisible(true)
    // Camera briefly shakes
    this.cameras.main.shake(200, 0.008)
  }

  private resetGame(): void {
    this.gameState = 'PLAYING'
    this.score = 0
    this.foodsSinceLastHazard = 0
    this.movementStats = baseMovementStats()
    this.scoreText.setText('score: 0')
    this.deathPanel.setVisible(false)
    this.growth.reset()
    this.head.reset()
    this.body.reset()
    this.seedBodyBuffer()
    // Regenerate hazards and food
    const hazardItems = generateHazards(INITIAL_HAZARD_COUNT, SPAWN_ANGLE)
    this.hazards = hazardItems.map(h => buildHazardRuntime(h, CENTRE, PLANET_RADIUS))
    this.foods = []
    this.spawnFoodBatch(INITIAL_FOOD_COUNT)
    this.currentZoom = this.baseZoom
    this.cameras.main.setZoom(this.baseZoom)
  }

  /**
   * Pre-populate the ring buffer with a trail extending behind the head.
   * Push tail-first so the most recent entry is the head (correct walking order).
   */
  private seedBodyBuffer(): void {
    const hx = this.head.position.x
    const hy = this.head.position.y
    const radial = radialUnit({ x: hx, y: hy }, CENTRE)
    const cwTang = tangentUnit(radial, true)   // direction of initial movement
    // Trail extends in opposite direction (CCW)
    const trailX = -cwTang.x
    const trailY = -cwTang.y
    const SEED_COUNT = 400  // enough path length for any starting body size
    const SEED_STEP = 3     // world units between seed points
    // Push from furthest-back to head (so writePtr-1 ends up at head position)
    for (let i = SEED_COUNT; i >= 0; i--) {
      this.body.push(hx + trailX * i * SEED_STEP, hy + trailY * i * SEED_STEP)
    }
  }

  private spawnFoodBatch(count: number): void {
    const samples = this.body.getSamples(this.body.visibleSampleCount)
    const headAngle = angleFromCentre(this.head.position, CENTRE)
    for (let i = 0; i < count; i++) {
      const f = spawnFood(samples, this.foods, this.head.position.x, this.head.position.y, headAngle)
      if (f) this.foods.push(f)
    }
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  private renderFrame(nowMs: number): void {
    const g = this.gfx
    g.clear()

    const headAlt = altitude(this.head.position, CENTRE, PLANET_RADIUS)
    const inWarningZone = headAlt > PLAYABLE_ALT_MAX * 0.82

    this.renderBackground(g, inWarningZone)
    this.renderPlanet(g)
    this.renderHazards(g)
    this.renderFood(g, nowMs)

    const samples = this.body.getSamples(this.body.visibleSampleCount)
    this.renderBody(g, samples, nowMs, this.bodyHeadWidth(), this.bodyTailWidth())
    this.renderHead(g)
  }

  private renderBackground(g: Phaser.GameObjects.Graphics, warn: boolean): void {
    // Fill a large rect in world space with sky colour
    const skyCol = warn ? COL_WARN_TINT : COL_SKY_LOW
    g.fillStyle(skyCol)
    g.fillRect(-3000, -3000, 6000, 6000)
  }

  private renderPlanet(g: Phaser.GameObjects.Graphics): void {
    // Planet body
    g.fillStyle(COL_PLANET)
    g.fillCircle(CENTRE.x, CENTRE.y, PLANET_RADIUS)

    // Rim highlight (slightly lighter ring)
    g.lineStyle(3, COL_PLANET_RIM, 1)
    g.strokeCircle(CENTRE.x, CENTRE.y, PLANET_RADIUS)

    // Subtle surface texture: small bumps around the rim
    const bumpCount = 48
    for (let i = 0; i < bumpCount; i++) {
      const angle = (i / bumpCount) * Math.PI * 2
      const bumpH = 3 + Math.sin(i * 7.3 + 1.2) * 2
      const bumpW = 4 + Math.sin(i * 3.1) * 2
      const radial = radialUnit({ x: Math.cos(angle), y: Math.sin(angle) }, { x: 0, y: 0 })
      const baseX = CENTRE.x + Math.cos(angle) * PLANET_RADIUS
      const baseY = CENTRE.y + Math.sin(angle) * PLANET_RADIUS
      const tipX = baseX + radial.x * bumpH
      const tipY = baseY + radial.y * bumpH
      g.lineStyle(bumpW, COL_PLANET_RIM, 0.7)
      g.beginPath()
      g.moveTo(baseX, baseY)
      g.lineTo(tipX, tipY)
      g.strokePath()
    }
  }

  private renderHazards(g: Phaser.GameObjects.Graphics): void {
    for (const h of this.hazards) {
      const angle = h.angle
      const radial = { x: Math.cos(angle), y: Math.sin(angle) }
      const tangent = tangentUnit(radial, true)

      // Draw spike: trapezoid from surface to tip
      const tipAlt = h.height
      const halfBaseW = h.width * 0.5
      const halfTipW = h.width * 0.15

      const surfX = CENTRE.x + radial.x * PLANET_RADIUS
      const surfY = CENTRE.y + radial.y * PLANET_RADIUS

      const b1x = surfX + tangent.x * halfBaseW
      const b1y = surfY + tangent.y * halfBaseW
      const b2x = surfX - tangent.x * halfBaseW
      const b2y = surfY - tangent.y * halfBaseW
      const t1x = surfX + radial.x * tipAlt + tangent.x * halfTipW
      const t1y = surfY + radial.y * tipAlt + tangent.y * halfTipW
      const t2x = surfX + radial.x * tipAlt - tangent.x * halfTipW
      const t2y = surfY + radial.y * tipAlt - tangent.y * halfTipW

      g.fillStyle(COL_HAZARD)
      g.beginPath()
      g.moveTo(b1x, b1y)
      g.lineTo(t1x, t1y)
      g.lineTo(t2x, t2y)
      g.lineTo(b2x, b2y)
      g.closePath()
      g.fillPath()

      // Tip highlight
      g.lineStyle(1, COL_HAZARD_TIP, 0.8)
      g.beginPath()
      g.moveTo(t1x, t1y)
      g.lineTo(t2x, t2y)
      g.strokePath()
    }
  }

  private renderFood(g: Phaser.GameObjects.Graphics, _nowMs: number): void {
    for (const f of this.foods) {
      // Outer glow
      g.fillStyle(COL_FOOD_GLOW, 0.4)
      g.fillCircle(f.x, f.y, FOOD_RADIUS + 4)
      // Core
      g.fillStyle(COL_FOOD)
      g.fillCircle(f.x, f.y, FOOD_RADIUS)
      // Specular highlight
      g.fillStyle(0xffffff, 0.6)
      g.fillCircle(f.x - 2, f.y - 2, 2)
    }
  }

  private renderBody(g: Phaser.GameObjects.Graphics, samples: readonly BodySample[], nowMs: number, headWidth: number, tailWidth: number): void {
    if (samples.length < 2) return
    const total = samples.length

    // Pre-compute left/right edge points for a smooth tapered ribbon
    const lx: number[] = [], ly: number[] = []
    const rx: number[] = [], ry: number[] = []

    for (let i = 0; i < total; i++) {
      const t = i / (total - 1)
      const w = lerp(headWidth / 2, tailWidth / 2, t)
      let dx: number, dy: number
      if (i < total - 1) {
        dx = samples[i + 1].x - samples[i].x
        dy = samples[i + 1].y - samples[i].y
      } else {
        dx = samples[i].x - samples[i - 1].x
        dy = samples[i].y - samples[i - 1].y
      }
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const nx = -dy / len
      const ny =  dx / len
      lx.push(samples[i].x + nx * w)
      ly.push(samples[i].y + ny * w)
      rx.push(samples[i].x - nx * w)
      ry.push(samples[i].y - ny * w)
    }

    // Filled ribbon — alternating scale bands every 3 samples
    for (let i = 0; i < total - 1; i++) {
      const t = (i + 0.5) / (total - 1)
      const light = Math.floor(i / 3) % 2 === 0
      const col = t < 0.5
        ? (light ? 0x4aaa1a : COL_BODY)
        : (light ? 0x3a7a0a : COL_BODY_DARK)
      g.fillStyle(col)
      g.beginPath()
      g.moveTo(lx[i],     ly[i])
      g.lineTo(rx[i],     ry[i])
      g.lineTo(rx[i + 1], ry[i + 1])
      g.lineTo(lx[i + 1], ly[i + 1])
      g.closePath()
      g.fillPath()
    }

    // Scale divider lines
    for (let i = 3; i < total - 1; i += 3) {
      const alpha = lerp(0.45, 0.08, i / (total - 1))
      g.lineStyle(1, 0x1a5008, alpha)
      g.beginPath()
      g.moveTo(lx[i], ly[i])
      g.lineTo(rx[i], ry[i])
      g.strokePath()
    }

    // Tail round cap
    g.fillStyle(COL_BODY_DARK)
    g.fillCircle(samples[total - 1].x, samples[total - 1].y, tailWidth / 2)

    // Edge outlines
    g.lineStyle(1, 0x1a5008, 0.6)
    g.beginPath()
    g.moveTo(lx[0], ly[0])
    for (let i = 1; i < total; i++) g.lineTo(lx[i], ly[i])
    g.strokePath()
    g.beginPath()
    g.moveTo(rx[0], ry[0])
    for (let i = 1; i < total; i++) g.lineTo(rx[i], ry[i])
    g.strokePath()

    // Growth pulses
    for (const pulse of this.growth.pulses) {
      const progress = this.growth.getPulseProgress(pulse, nowMs)
      const sampleIdx = Math.min(Math.floor(progress * (total - 1)), total - 1)
      if (sampleIdx >= 0 && sampleIdx < samples.length) {
        const s = samples[sampleIdx]
        const t = sampleIdx / Math.max(1, total - 1)
        const r = lerp(headWidth / 2, tailWidth / 2, t) + 3
        g.fillStyle(COL_PULSE, 0.7)
        g.fillCircle(s.x, s.y, r)
      }
    }
  }

  private renderHead(g: Phaser.GameObjects.Graphics): void {
    const hx = this.head.position.x
    const hy = this.head.position.y
    const speed = Math.sqrt(this.head.velocity.x ** 2 + this.head.velocity.y ** 2)
    const dir = speed > 1 ? normalize(this.head.velocity) : { x: 1, y: 0 }
    const perp = { x: -dir.y, y: dir.x }
    const R = this.bodyHeadWidth() / 2 + 2

    // Pointed wedge: tip → left shoulder → left back → right back → right shoulder
    const tipX  = hx + dir.x * R * 1.3
    const tipY  = hy + dir.y * R * 1.3
    const midX  = hx - dir.x * R * 0.2
    const midY  = hy - dir.y * R * 0.2
    const backX = hx - dir.x * R * 0.9
    const backY = hy - dir.y * R * 0.9

    g.fillStyle(COL_HEAD)
    g.beginPath()
    g.moveTo(tipX, tipY)
    g.lineTo(midX  + perp.x * R,       midY  + perp.y * R)
    g.lineTo(backX + perp.x * R * 0.5, backY + perp.y * R * 0.5)
    g.lineTo(backX - perp.x * R * 0.5, backY - perp.y * R * 0.5)
    g.lineTo(midX  - perp.x * R,       midY  - perp.y * R)
    g.closePath()
    g.fillPath()

    g.lineStyle(1.5, 0x4aaa00, 1)
    g.beginPath()
    g.moveTo(tipX, tipY)
    g.lineTo(midX  + perp.x * R,       midY  + perp.y * R)
    g.lineTo(backX + perp.x * R * 0.5, backY + perp.y * R * 0.5)
    g.lineTo(backX - perp.x * R * 0.5, backY - perp.y * R * 0.5)
    g.lineTo(midX  - perp.x * R,       midY  - perp.y * R)
    g.closePath()
    g.strokePath()

    // Two eyes — forward and to each side
    const eyeX = hx + dir.x * R * 0.4
    const eyeY = hy + dir.y * R * 0.4
    for (const s of [1, -1]) {
      const ex = eyeX + perp.x * R * 0.55 * s
      const ey = eyeY + perp.y * R * 0.55 * s
      g.fillStyle(COL_EYE)
      g.fillCircle(ex, ey, 2.5)
      g.fillStyle(0xffffff)
      g.fillCircle(ex - 0.5, ey - 0.5, 1)
    }
  }
}
