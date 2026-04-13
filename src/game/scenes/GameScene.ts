import Phaser from 'phaser'
import { SerpentHead } from '../entities/SerpentHead'
import { SerpentBody } from '../entities/SerpentBody'
import { buildHazardRuntime, type HazardRuntime } from '../entities/Hazard'
import { InputSystem } from '../systems/InputSystem'
import { updateMovement, baseMovementStats, type MovementStats } from '../systems/MovementSystem'
import { GrowthSystem } from '../systems/GrowthSystem'
import { checkDeath, checkFoodCollection } from '../systems/CollisionSystem'
import { spawnFood, generateHazards, addHazard } from '../systems/SpawnSystem'
import type { FoodItem, GameState, LavaBlob } from '../types'
import {
  radialUnit, tangentUnit, angleFromCentre,
  lerp, normalize
} from '../utils/math'
import type { BodySample } from '../types'
import {
  PLANET_RADIUS, INITIAL_FOOD_COUNT, INITIAL_HAZARD_COUNT,
  CAMERA_BASE_ZOOM, CAMERA_SMOOTHING,
  BODY_WIDTH_HEAD, BODY_WIDTH_TAIL,
  HAZARD_ADD_INTERVAL, HAZARD_SOFT_MAX,
  PLAYABLE_ALT_MAX, MAX_SPEED, MIN_TANGENTIAL_SPEED, FOOD_LIFETIME_MS,
  LAVA_BLOB_SPEED, LAVA_BLOB_SPREAD, LAVA_BLOB_COUNT,
  LAVA_BLOB_RADIUS, LAVA_BLOB_LIFE_MS, LAVA_ERUPT_INTERVAL_MS,
  GRAVITY, CAMERA_ZOOM_MIN, CAMERA_ZOOM_FULL_SCORE,
  MOON_X, MOON_Y, MOON_RADIUS, MOON_GRAVITY, MOON_SOI, MOON_UNLOCK_SCORE,
  HEAD_COLLISION_RADIUS, FOOD_TYPES
} from '../config'

const CENTRE = { x: 0, y: 0 }
const SPAWN_ANGLE = Math.PI / 2  // bottom of planet

// Fixed star field — generated once using golden-angle distribution
const STARS: Array<{ x: number; y: number; r: number; alpha: number }> = (() => {
  const out = []
  for (let i = 0; i < 120; i++) {
    const angle = i * 2.3999  // golden angle
    const dist  = 600 + (i * 53) % 3200
    out.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      r: 0.5 + (i % 4) * 0.4,
      alpha: 0.4 + (i % 5) * 0.12,
    })
  }
  return out
})()

// Colours
const COL_SKY_LOW      = 0x0a0a1a
const COL_OCEAN_DEEP   = 0x0d3d6b
const COL_OCEAN_SHALLOW = 0x1a6a9a
const COL_LAND_DEEP    = 0x1a3d0a
const COL_LAND         = 0x2d7a16
const COL_POLAR_ICE    = 0xdcf0ff
const COL_PLANET_RIM   = 0x2a4a2a
const COL_BODY       = 0x3a8a1a
const COL_BODY_DARK  = 0x2a5a0a
const COL_HEAD       = 0x7fff00
const COL_EYE        = 0x001a00


const COL_PULSE      = 0xffffff

export class GameScene extends Phaser.Scene {
  private head!: SerpentHead
  private body!: SerpentBody
  private inputSys!: InputSystem
  private growth!: GrowthSystem

  private foods: FoodItem[] = []
  private hazards: HazardRuntime[] = []
  private lavaBlobs: LavaBlob[] = []

  private gameState: GameState = 'PLAYING'
  private score = 0
  private bestScore = 0
  private foodsSinceLastHazard = 0
  private movementStats: MovementStats = baseMovementStats()
  private displayCeilingAlt = PLAYABLE_ALT_MAX  // smoothly lerped for rendering

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

  private updateLava(nowMs: number, dtSec: number): void {
    // Eruptions
    for (const h of this.hazards) {
      if (h.volcanoState !== 'active') continue
      if (nowMs < h.nextEruptionMs) continue
      h.nextEruptionMs = nowMs + LAVA_ERUPT_INTERVAL_MS + Math.random() * 1000

      const rad = { x: Math.cos(h.angle), y: Math.sin(h.angle) }
      const craterX = CENTRE.x + rad.x * (PLANET_RADIUS + h.height)
      const craterY = CENTRE.y + rad.y * (PLANET_RADIUS + h.height)

      for (let i = 0; i < LAVA_BLOB_COUNT; i++) {
        const spread = (Math.random() - 0.5) * LAVA_BLOB_SPREAD
        const launchAngle = h.angle + spread
        const lrad = { x: Math.cos(launchAngle), y: Math.sin(launchAngle) }
        const speed = LAVA_BLOB_SPEED * (0.75 + Math.random() * 0.5)
        this.lavaBlobs.push({
          x: craterX, y: craterY,
          vx: lrad.x * speed,
          vy: lrad.y * speed,
          radius: LAVA_BLOB_RADIUS * (0.7 + Math.random() * 0.6),
          spawnMs: nowMs,
        })
      }
    }

    // Physics + expiry
    for (let i = this.lavaBlobs.length - 1; i >= 0; i--) {
      const b = this.lavaBlobs[i]
      const age = nowMs - b.spawnMs
      if (age > LAVA_BLOB_LIFE_MS) { this.lavaBlobs.splice(i, 1); continue }

      // Gravity toward centre
      const len = Math.sqrt(b.x * b.x + b.y * b.y) || 1
      b.vx += -(b.x / len) * GRAVITY * dtSec
      b.vy += -(b.y / len) * GRAVITY * dtSec
      b.x  += b.vx * dtSec
      b.y  += b.vy * dtSec

      // Remove if hit surface
      if (Math.sqrt(b.x * b.x + b.y * b.y) < PLANET_RADIUS) {
        this.lavaBlobs.splice(i, 1)
      }
    }
  }

  /** Re-compute movement + body stats from current score */
  private recomputeStats(): void {
    const f = this.score
    this.movementStats = {
      maxSpeed:           MAX_SPEED            + f * 30,   // +30 speed per food
      minTangentialSpeed: MIN_TANGENTIAL_SPEED + f * 12,   // +12 orbital floor per food
      playableAltMax:     PLAYABLE_ALT_MAX     + f * 20,   // +20 altitude ceiling per food
    }
  }

  /** Dynamic body widths based on score */
  private bodyHeadWidth(): number { return BODY_WIDTH_HEAD + this.score * 2.5 }
  private bodyTailWidth(): number { return BODY_WIDTH_TAIL + this.score * 1.2 }

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

    // Moon gravity — only once the snake is large enough to feel it
    if (this.score >= MOON_UNLOCK_SCORE) {
      const mdx = this.head.position.x - MOON_X
      const mdy = this.head.position.y - MOON_Y
      const mdist = Math.sqrt(mdx * mdx + mdy * mdy)
      if (mdist > 0 && mdist < MOON_SOI) {
        const pull = MOON_GRAVITY * Math.pow(1 - mdist / MOON_SOI, 0.6)
        this.head.velocity.x -= (mdx / mdist) * pull * dtSec
        this.head.velocity.y -= (mdy / mdist) * pull * dtSec
      }
    }

    // Lava eruptions + blob physics
    this.updateLava(nowMs, dtSec)

    // Push head position into body buffer
    this.body.push(this.head.position.x, this.head.position.y)

    // Growth system
    this.growth.update(nowMs, this.body)

    // Get current body samples for collision and rendering
    const samples = this.body.getSamples(this.body.visibleSampleCount)

    // Hazard collision — eat it if head is bigger, die otherwise
    const hxPos = this.head.position.x, hyPos = this.head.position.y
    const headRadius = this.bodyHeadWidth() / 2
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]
      const hdx = hxPos - h.worldX, hdy = hyPos - h.worldY
      if (Math.sqrt(hdx * hdx + hdy * hdy) < HEAD_COLLISION_RADIUS + h.collisionRadius) {
        if (headRadius > h.collisionRadius) {
          // Snake is big enough — devour the hazard
          this.hazards.splice(i, 1)
          this.score++
          this.foodsSinceLastHazard++
          this.growth.onFoodEaten(nowMs, 3)
          this.recomputeStats()
          this.scoreText.setText(`score: ${this.score}`)
          this.cameras.main.shake(80, 0.005)
        } else {
          this.triggerDeath(nowMs); return
        }
      }
    }

    // Surface + self-collision (hazards already handled above)
    const cause = checkDeath(this.head.position.x, this.head.position.y, samples, [])
    if (cause !== null) { this.triggerDeath(nowMs); return }

    const hx = this.head.position.x, hy = this.head.position.y
    for (const blob of this.lavaBlobs) {
      const dx = hx - blob.x, dy = hy - blob.y
      if (Math.sqrt(dx * dx + dy * dy) < this.bodyHeadWidth() / 2 + blob.radius) {
        this.triggerDeath(nowMs); return
      }
    }

    // Expire old food and respawn elsewhere
    const headAngle = angleFromCentre(this.head.position, CENTRE)
    for (let i = this.foods.length - 1; i >= 0; i--) {
      if (nowMs - this.foods[i].spawnTime > FOOD_LIFETIME_MS) {
        this.foods.splice(i, 1)
        const replacement = spawnFood(samples, this.foods, this.head.position.x, this.head.position.y, headAngle, this.hazards, nowMs)
        if (replacement) this.foods.push(replacement)
      }
    }

    // Food collection
    const eaten = checkFoodCollection(this.head.position.x, this.head.position.y, this.foods)
    if (eaten >= 0) {
      const nutrition = this.foods[eaten].nutrition
      this.foods.splice(eaten, 1)
      this.score++
      this.foodsSinceLastHazard++
      this.growth.onFoodEaten(nowMs, nutrition)
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
      const newFood = spawnFood(samples, this.foods, this.head.position.x, this.head.position.y, headAngle, this.hazards, nowMs)
      if (newFood) this.foods.push(newFood)
    }

    // Update camera target
    this.camTarget.setPosition(this.head.position.x, this.head.position.y)

    // Smoothly expand ceiling display
    this.displayCeilingAlt = lerp(this.displayCeilingAlt, this.movementStats.playableAltMax, 0.025)

    // Zoom out as score grows — reveals moon progressively
    const scoreFrac = Math.min(1, this.score / CAMERA_ZOOM_FULL_SCORE)
    const targetZoom = lerp(this.baseZoom, CAMERA_ZOOM_MIN, scoreFrac)
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
    this.displayCeilingAlt = PLAYABLE_ALT_MAX
    this.lavaBlobs = []
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

  private spawnFoodBatch(count: number, nowMs = 0): void {
    const samples = this.body.getSamples(this.body.visibleSampleCount)
    const headAngle = angleFromCentre(this.head.position, CENTRE)
    for (let i = 0; i < count; i++) {
      const f = spawnFood(samples, this.foods, this.head.position.x, this.head.position.y, headAngle, this.hazards, nowMs)
      if (f) this.foods.push(f)
    }
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  private renderFrame(nowMs: number): void {
    const g = this.gfx
    g.clear()

    this.renderBackground(g)
    this.renderStars(g)
    this.renderMoon(g)
    this.renderSkyBoundary(g)
    this.renderPlanet(g)
    this.renderHazards(g)
    this.renderLavaBlobs(g, nowMs)
    this.renderFood(g, nowMs)

    const samples = this.body.getSamples(this.body.visibleSampleCount)
    this.renderBody(g, samples, nowMs, this.bodyHeadWidth(), this.bodyTailWidth())
    this.renderHead(g)
  }

  private renderBackground(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(COL_SKY_LOW)
    g.fillRect(-3000, -3000, 6000, 6000)
  }

  private renderStars(g: Phaser.GameObjects.Graphics): void {
    for (const s of STARS) {
      g.fillStyle(0xffffff, s.alpha)
      g.fillCircle(s.x, s.y, s.r)
    }
  }

  private renderMoon(g: Phaser.GameObjects.Graphics): void {
    const mx = MOON_X, my = MOON_Y, R = MOON_RADIUS

    // Sphere of influence — brightens once moon gravity is unlocked
    const soiAlpha = this.score >= MOON_UNLOCK_SCORE ? 0.45 : 0.18
    const soiCol   = this.score >= MOON_UNLOCK_SCORE ? 0x88ccff : 0x445566
    g.lineStyle(this.score >= MOON_UNLOCK_SCORE ? 1.5 : 1, soiCol, soiAlpha)
    g.strokeCircle(mx, my, MOON_SOI)

    // Thick layered atmosphere — 6 halos fading outward
    const atmoLayers = [
      { r: R + 90, a: 0.04, col: 0x99bbcc },
      { r: R + 65, a: 0.07, col: 0x88aacc },
      { r: R + 45, a: 0.11, col: 0x7799bb },
      { r: R + 28, a: 0.16, col: 0x6688aa },
      { r: R + 15, a: 0.22, col: 0x8899bb },
      { r: R + 6,  a: 0.30, col: 0xaabbcc },
    ]
    for (const l of atmoLayers) {
      g.fillStyle(l.col, l.a)
      g.fillCircle(mx, my, l.r)
    }

    // Base — dark grey
    g.fillStyle(0x6a6a72)
    g.fillCircle(mx, my, R)

    // Sunlit face — lighter on upper-right
    g.fillStyle(0x9a9aa8, 0.55)
    g.fillCircle(mx + R * 0.18, my - R * 0.18, R * 0.88)

    // Craters
    const craters = [
      { ox: -0.35, oy: -0.25, r: 0.18 },
      { ox:  0.30, oy:  0.30, r: 0.22 },
      { ox: -0.10, oy:  0.45, r: 0.12 },
      { ox:  0.50, oy: -0.10, r: 0.14 },
      { ox: -0.55, oy:  0.20, r: 0.10 },
      { ox:  0.05, oy: -0.55, r: 0.16 },
    ]
    for (const c of craters) {
      const cx = mx + c.ox * R, cy = my + c.oy * R, cr = c.r * R
      // Crater shadow
      g.fillStyle(0x3a3a42, 0.8)
      g.fillCircle(cx, cy, cr)
      // Crater rim highlight
      g.lineStyle(1, 0xb0b0be, 0.5)
      g.strokeCircle(cx - cr * 0.15, cy - cr * 0.15, cr)
    }

    // Dark mare regions (flat lava plains)
    g.fillStyle(0x4a4a52, 0.5)
    g.fillCircle(mx + R * 0.15, my + R * 0.1, R * 0.35)
    g.fillStyle(0x4a4a52, 0.35)
    g.fillCircle(mx - R * 0.25, my - R * 0.05, R * 0.22)

    // Limb shadow (terminator edge — dark left side)
    g.fillStyle(0x111118, 0.35)
    g.fillCircle(mx - R * 0.28, my, R * 0.85)

    // Orbital ring — always visible as a navigation beacon
    g.lineStyle(1, 0x8899aa, 0.4)
    g.strokeCircle(mx, my, R + 12)
  }

  private renderSkyBoundary(g: Phaser.GameObjects.Graphics): void {
    const boundaryR = PLANET_RADIUS + this.displayCeilingAlt
    // Outer glow band
    g.lineStyle(6, 0x4488cc, 0.08)
    g.strokeCircle(CENTRE.x, CENTRE.y, boundaryR + 4)
    // Main boundary line
    g.lineStyle(1.5, 0x66aadd, 0.5)
    g.strokeCircle(CENTRE.x, CENTRE.y, boundaryR)
    // Inner accent
    g.lineStyle(1, 0x3366aa, 0.25)
    g.strokeCircle(CENTRE.x, CENTRE.y, boundaryR - 3)
  }

  private renderPlanet(g: Phaser.GameObjects.Graphics): void {
    const cx = CENTRE.x, cy = CENTRE.y, R = PLANET_RADIUS

    // Deep ocean base
    g.fillStyle(COL_OCEAN_DEEP)
    g.fillCircle(cx, cy, R)

    // Shallow water inner tint
    g.fillStyle(COL_OCEAN_SHALLOW, 0.35)
    g.fillCircle(cx, cy, R * 0.72)

    // Helper: draw a closed surface patch (outer arc forward, inner arc back)
    const drawPatch = (
      a0: number, a1: number,
      outerR: number, innerR: number,
      outerAmp: number, innerAmp: number,
      seed: number, steps: number
    ) => {
      const span = a1 - a0
      g.beginPath()
      // Outer edge (forward)
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const angle = a0 + t * span
        const j = Math.sin(i * 5.3 + seed)        * outerAmp
                + Math.sin(i * 13.1 + seed * 0.4) * outerAmp * 0.4
                + Math.sin(i * 2.7  + seed * 1.7) * outerAmp * 0.5
        const r = R * (outerR + j)
        if (i === 0) g.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
        else         g.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
      }
      // Inner edge (backward)
      for (let i = steps; i >= 0; i--) {
        const t = i / steps
        const angle = a0 + t * span
        const j = Math.sin(i * 3.7 + seed * 1.3)  * innerAmp
                + Math.sin(i * 9.1  + seed * 0.8)  * innerAmp * 0.5
                + Math.sin(i * 17.3 + seed * 2.1)  * innerAmp * 0.3
        const r = R * (innerR + j)
        g.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
      }
      g.closePath()
      g.fillPath()
    }

    // Three continents — uneven size and spacing, no pie-slice geometry
    const landMasses = [
      { a0: 0.15, a1: 1.4,  outer: 0.97, inner: 0.82, oAmp: 0.025, iAmp: 0.03 },
      { a0: 2.0,  a1: 2.95, outer: 0.96, inner: 0.80, oAmp: 0.030, iAmp: 0.04 },
      { a0: 3.8,  a1: 5.2,  outer: 0.97, inner: 0.83, oAmp: 0.020, iAmp: 0.03 },
    ]

    for (const land of landMasses) {
      const seed = land.a0 * 7.3
      g.fillStyle(COL_LAND_DEEP)
      drawPatch(land.a0, land.a1, land.outer, land.inner + 0.05, land.oAmp, land.iAmp * 0.6, seed, 26)
      g.fillStyle(COL_LAND)
      drawPatch(land.a0 + 0.05, land.a1 - 0.05, land.outer - 0.01, land.inner, land.oAmp * 0.8, land.iAmp, seed + 1.1, 22)
    }

    // Polar caps — surface patches, not wedges
    const poleCaps = [
      { centre: -Math.PI / 2, halfSpan: 0.52, outer: 0.97, inner: 0.88 },
      { centre:  Math.PI / 2 + 0.3, halfSpan: 0.28, outer: 0.97, inner: 0.90 },
    ]
    for (const cap of poleCaps) {
      const seed = cap.centre * 3.1
      g.fillStyle(COL_POLAR_ICE, 0.88)
      drawPatch(cap.centre - cap.halfSpan, cap.centre + cap.halfSpan, cap.outer, cap.inner, 0.015, 0.025, seed, 18)
    }

    // Ocean specular shimmer
    g.fillStyle(0x5aaadd, 0.10)
    g.fillCircle(cx - R * 0.25, cy - R * 0.25, R * 0.55)

    // Planet rim
    g.lineStyle(2, COL_PLANET_RIM, 1)
    g.strokeCircle(cx, cy, R)

    // Trees and mountains around the rim
    const featureCount = 52
    for (let i = 0; i < featureCount; i++) {
      const angle = (i / featureCount) * Math.PI * 2
      const height = 5 + Math.sin(i * 7.3 + 1.2) * 3 + Math.sin(i * 2.9) * 2
      const halfBase = 2 + Math.sin(i * 3.1 + 0.7) * 1.2
      const isMountain = height > 8

      const rad = { x: Math.cos(angle), y: Math.sin(angle) }
      const tan = { x: -Math.sin(angle), y: Math.cos(angle) }

      const baseX = cx + rad.x * R
      const baseY = cy + rad.y * R
      const tipX  = baseX + rad.x * height
      const tipY  = baseY + rad.y * height
      const leftX  = baseX + tan.x * halfBase
      const leftY  = baseY + tan.y * halfBase
      const rightX = baseX - tan.x * halfBase
      const rightY = baseY - tan.y * halfBase

      if (isMountain) {
        // Mountain body — dark grey
        g.fillStyle(0x6a6a72)
        g.beginPath()
        g.moveTo(tipX, tipY)
        g.lineTo(leftX, leftY)
        g.lineTo(rightX, rightY)
        g.closePath()
        g.fillPath()
        // Snow cap on top third
        const snowX = baseX + rad.x * height * 0.65
        const snowY = baseY + rad.y * height * 0.65
        const snowHalfBase = halfBase * 0.45
        g.fillStyle(0xeef4ff, 0.9)
        g.beginPath()
        g.moveTo(tipX, tipY)
        g.lineTo(snowX + tan.x * snowHalfBase, snowY + tan.y * snowHalfBase)
        g.lineTo(snowX - tan.x * snowHalfBase, snowY - tan.y * snowHalfBase)
        g.closePath()
        g.fillPath()
      } else {
        // Tree — dark green triangle, slightly narrower
        g.fillStyle(0x1a4a0a)
        g.beginPath()
        g.moveTo(tipX, tipY)
        g.lineTo(leftX, leftY)
        g.lineTo(rightX, rightY)
        g.closePath()
        g.fillPath()
        // Lighter highlight on one side
        g.fillStyle(0x2d7a16, 0.5)
        g.beginPath()
        g.moveTo(tipX, tipY)
        g.lineTo(baseX, baseY)
        g.lineTo(rightX, rightY)
        g.closePath()
        g.fillPath()
      }
    }
  }

  private renderHazards(g: Phaser.GameObjects.Graphics): void {
    for (const h of this.hazards) {
      const rad = { x: Math.cos(h.angle), y: Math.sin(h.angle) }
      const tan = tangentUnit(rad, true)
      const sx = CENTRE.x + rad.x * PLANET_RADIUS
      const sy = CENTRE.y + rad.y * PLANET_RADIUS

      if (h.width > 40) {
        // ── Dormant volcano ──────────────────────────────────────────────
        const hb = h.width * 0.5
        const ht = h.width * 0.18
        const topX = sx + rad.x * h.height
        const topY = sy + rad.y * h.height
        const craterR = h.width * 0.14

        // Active: red-hot glow behind cone
        if (h.volcanoState === 'active') {
          g.fillStyle(0xff2200, 0.18)
          g.fillCircle(topX, topY, hb * 1.1)
        }

        // Cone body — active ones are darker/redder
        const coneCol = h.volcanoState === 'active' ? 0x2e1a12 : 0x3a3028
        g.fillStyle(coneCol)
        g.beginPath()
        g.moveTo(sx  - tan.x * hb,        sy  - tan.y * hb)
        g.lineTo(topX - tan.x * ht,       topY - tan.y * ht)
        g.lineTo(topX + tan.x * ht,       topY + tan.y * ht)
        g.lineTo(sx  + tan.x * hb,        sy  + tan.y * hb)
        g.closePath()
        g.fillPath()

        // Lava streaks down the flanks for active/simmering
        if (h.volcanoState !== 'dormant') {
          const streaks = h.volcanoState === 'active' ? 3 : 1
          for (let s = 0; s < streaks; s++) {
            const t = 0.2 + s * 0.3
            const lx1 = topX + tan.x * ht * (t - 0.1)
            const ly1 = topY + tan.y * ht * (t - 0.1)
            const lx2 = sx   + tan.x * hb * (t + 0.15)
            const ly2 = sy   + tan.y * hb * (t + 0.15)
            const alpha = h.volcanoState === 'active' ? 0.7 : 0.4
            g.lineStyle(2, 0xff4400, alpha)
            g.beginPath()
            g.moveTo(lx1, ly1)
            g.lineTo(lx2, ly2)
            g.strokePath()
          }
        }

        // Lit flank
        g.fillStyle(0x524438, 0.6)
        g.beginPath()
        g.moveTo(sx,                       sy)
        g.lineTo(sx  + tan.x * hb,        sy  + tan.y * hb)
        g.lineTo(topX + tan.x * ht,       topY + tan.y * ht)
        g.lineTo(topX,                     topY)
        g.closePath()
        g.fillPath()

        // Crater rim
        g.fillStyle(0x5c4a3c)
        g.fillCircle(topX, topY, craterR + 2)
        // Crater hole
        g.fillStyle(0x140c08)
        g.fillCircle(topX, topY, craterR)

        if (h.volcanoState === 'dormant') {
          g.fillStyle(0x3a0a00, 0.4)
          g.fillCircle(topX, topY, craterR * 0.5)
        } else if (h.volcanoState === 'simmering') {
          g.fillStyle(0xcc3300, 0.7)
          g.fillCircle(topX, topY, craterR * 0.75)
          g.fillStyle(0xff6600, 0.5)
          g.fillCircle(topX, topY, craterR * 0.4)
          // Small smoke puff
          g.fillStyle(0x554444, 0.3)
          g.fillCircle(topX + rad.x * craterR * 2, topY + rad.y * craterR * 2, craterR * 0.8)
        } else {
          // Active — bright lava
          g.fillStyle(0xff4400, 0.4)
          g.fillCircle(topX, topY, craterR + 5)
          g.fillStyle(0xff6600, 0.9)
          g.fillCircle(topX, topY, craterR * 0.85)
          g.fillStyle(0xffcc00, 0.8)
          g.fillCircle(topX, topY, craterR * 0.45)
          // Rising plume of smoke/fire above crater
          const plumeSteps = 5
          for (let p = 1; p <= plumeSteps; p++) {
            const t = p / plumeSteps
            const pr = h.height * 0.6 * t
            const px = topX + rad.x * pr
            const py = topY + rad.y * pr
            const pSize = craterR * (1.2 + t * 1.4)
            // Smoke
            g.fillStyle(0x332222, (1 - t) * 0.45)
            g.fillCircle(px, py, pSize)
            // Fire core at base of plume
            if (t < 0.5) {
              g.fillStyle(0xff5500, (0.5 - t) * 0.8)
              g.fillCircle(px, py, pSize * 0.5)
            }
          }
        }

      } else {
        // ── Dead giant tree ──────────────────────────────────────────────
        const tw = h.width * 0.18
        const th = h.height
        const topX = sx + rad.x * th
        const topY = sy + rad.y * th

        // Trunk
        g.fillStyle(0x2e1f0e)
        g.beginPath()
        g.moveTo(sx   - tan.x * tw,         sy   - tan.y * tw)
        g.lineTo(topX - tan.x * tw * 0.4,   topY - tan.y * tw * 0.4)
        g.lineTo(topX + tan.x * tw * 0.4,   topY + tan.y * tw * 0.4)
        g.lineTo(sx   + tan.x * tw,         sy   + tan.y * tw)
        g.closePath()
        g.fillPath()

        // Bare branches
        const branches = [
          { frac: 0.78, side:  1, len: th * 0.32, lift: 0.35 },
          { frac: 0.60, side: -1, len: th * 0.26, lift: 0.40 },
          { frac: 0.88, side: -1, len: th * 0.18, lift: 0.28 },
          { frac: 0.50, side:  1, len: th * 0.20, lift: 0.45 },
        ]
        for (const b of branches) {
          const bx = sx + rad.x * th * b.frac
          const by = sy + rad.y * th * b.frac
          const dx = tan.x * b.side * Math.cos(b.lift) + rad.x * Math.sin(b.lift)
          const dy = tan.y * b.side * Math.cos(b.lift) + rad.y * Math.sin(b.lift)
          g.lineStyle(Math.max(1, tw * 0.7), 0x2e1f0e, 1)
          g.beginPath()
          g.moveTo(bx, by)
          g.lineTo(bx + dx * b.len, by + dy * b.len)
          g.strokePath()
        }
      }
    }
  }

  private renderLavaBlobs(g: Phaser.GameObjects.Graphics, nowMs: number): void {
    for (const b of this.lavaBlobs) {
      const age = nowMs - b.spawnMs
      const life = 1 - age / LAVA_BLOB_LIFE_MS

      // Velocity trail
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1
      const trailLen = Math.min(speed * 0.04, 18)
      const tx = b.x - (b.vx / speed) * trailLen
      const ty = b.y - (b.vy / speed) * trailLen
      g.lineStyle(b.radius * 1.2, 0xff4400, life * 0.5)
      g.beginPath()
      g.moveTo(b.x, b.y)
      g.lineTo(tx, ty)
      g.strokePath()

      // Outer glow
      g.fillStyle(0xff4400, life * 0.3)
      g.fillCircle(b.x, b.y, b.radius + 4)
      // Core — cools from orange to dark red
      const col = life > 0.5 ? 0xff6600 : 0xcc2200
      g.fillStyle(col, Math.min(1, life * 0.9 + 0.1))
      g.fillCircle(b.x, b.y, b.radius)
      // Hot bright centre when freshly launched
      if (life > 0.6) {
        g.fillStyle(0xffdd44, (life - 0.6) * 2.5)
        g.fillCircle(b.x, b.y, b.radius * 0.45)
      }
    }
  }

  private renderFood(g: Phaser.GameObjects.Graphics, nowMs: number): void {
    for (const f of this.foods) {
      const ft = FOOD_TYPES.find(t => t.type === f.foodType) ?? FOOD_TYPES[0]
      const r = f.radius
      const pulse = 1 + Math.sin(nowMs * 0.004 + f.id) * 0.12

      if (f.foodType === 'small') {
        // Simple glowing orb
        g.fillStyle(ft.color, 0.3)
        g.fillCircle(f.x, f.y, r * 1.8 * pulse)
        g.fillStyle(ft.color)
        g.fillCircle(f.x, f.y, r)
        g.fillStyle(0xffffff, 0.7)
        g.fillCircle(f.x - r * 0.3, f.y - r * 0.3, r * 0.3)

      } else if (f.foodType === 'medium') {
        // Fruit-like: outer glow + two-tone
        g.fillStyle(ft.color, 0.25)
        g.fillCircle(f.x, f.y, r * 1.9 * pulse)
        g.fillStyle(ft.color)
        g.fillCircle(f.x, f.y, r)
        g.fillStyle(0xaaffcc, 0.6)
        g.fillCircle(f.x + r * 0.2, f.y - r * 0.2, r * 0.55)
        g.fillStyle(0xffffff, 0.8)
        g.fillCircle(f.x - r * 0.3, f.y - r * 0.35, r * 0.25)
        // Stem nub
        g.fillStyle(0x336622)
        g.fillRect(f.x - 1, f.y - r - 3, 2, 4)

      } else {
        // Large crystal: diamond polygon + inner sparkle
        g.fillStyle(ft.color, 0.2)
        g.fillCircle(f.x, f.y, r * 2.2 * pulse)
        // Hexagonal crystal faces
        g.fillStyle(ft.color, 0.9)
        g.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6
          if (i === 0) g.moveTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r)
          else         g.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r)
        }
        g.closePath()
        g.fillPath()
        // Inner lighter face
        g.fillStyle(0xddaaff, 0.7)
        g.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6
          if (i === 0) g.moveTo(f.x + Math.cos(a) * r * 0.55, f.y + Math.sin(a) * r * 0.55)
          else         g.lineTo(f.x + Math.cos(a) * r * 0.55, f.y + Math.sin(a) * r * 0.55)
        }
        g.closePath()
        g.fillPath()
        // Sparkle centre
        g.fillStyle(0xffffff, 0.9)
        g.fillCircle(f.x, f.y, r * 0.2)
      }
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
