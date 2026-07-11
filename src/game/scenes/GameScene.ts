import Phaser from 'phaser'
import { SerpentHead } from '../entities/SerpentHead'
import { SerpentBody } from '../entities/SerpentBody'
import { buildHazardRuntime, type HazardRuntime } from '../entities/Hazard'
import { InputSystem } from '../systems/InputSystem'
import { updateMovement, baseMovementStats, type MovementStats } from '../systems/MovementSystem'
import { netGravity, dominanceRadius } from '../systems/GravitySystem'
import { GrowthSystem } from '../systems/GrowthSystem'
import {
  checkHeadContact, checkFoodCollection,
  canSwallow, canBurrow, coilProgress, swallowNutrition
} from '../systems/CollisionSystem'
import { spawnFood, generateHazards, addHazard } from '../systems/SpawnSystem'
import {
  spawnGods, updateGods, updateGodProjectiles, godWorldPos
} from '../entities/God'
import type { CelestialBody, FoodItem, GameState, LavaBlob, God, GodProjectile, Ufo, Vec2 } from '../types'
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
  CAMERA_ZOOM_MIN, CAMERA_ZOOM_FULL_SCORE,
  MOON_X, MOON_Y, MOON_RADIUS, MOON_UNLOCK_SCORE,
  HEAD_COLLISION_RADIUS, FOOD_TYPES, BODIES, HAZARD_NUTRITION, SWALLOW_COILS,
  BURROW_CARVE_RADIUS_MULT, BURROW_BITE_SPACING_MULT, BURROW_COLLAPSE_FRACTION,
  GOD_INITIAL_COUNT, GOD_COLLISION_RADIUS, GOD_EAT_HEAD_RADIUS, GOD_NUTRITION,
  GOD_STAND_HEIGHT, HAMMER_RADIUS, BOLT_RADIUS,
  ISS_ALTITUDE, ISS_ANGULAR_SPEED, ISS_RADIUS, ISS_NUTRITION, ISS_RESPAWN_MS,
  UFO_RADIUS, UFO_NUTRITION, UFO_SPEED, UFO_LIFE_MS, UFO_SPAWN_MIN_MS, UFO_SPAWN_MAX_MS,
  MARS_X, MARS_Y, MARS_RADIUS, MARTIAN_COUNT
} from '../config'

const CENTRE = { x: 0, y: 0 }
const MARS_CENTRE: Vec2 = { x: MARS_X, y: MARS_Y }
const SPAWN_ANGLE = Math.PI / 2  // bottom of planet

// Devour effects
const DEVOUR_RING_MS = 450        // expanding shockwave lifetime
const TOAST_MS = 2600             // how long a milestone message lingers

/** Expanding ring left behind by anything the serpent swallows. */
interface DevourRing {
  x: number
  y: number
  radius: number   // ring settles at ~2.2× this
  spawnMs: number
}

/** A carved-out cavity in a world, world-space. A tunnel is a chain of these. */
interface Bite {
  x: number
  y: number
  r: number
}

/** Per-world burrow state: the holes chewed into it and how much area that adds up to. */
interface BurrowState {
  bites: Bite[]
  carvedArea: number      // Σ πr² of bites actually added (near-duplicates skipped)
  lastX: number           // head position at the last bite — spacing gate
  lastY: number
  hasBite: boolean
}

// Fixed star field — generated once using golden-angle distribution
/** Deterministic 0..1 hash of an integer cell — for a starfield that tiles infinitely. */
function starHash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

// Colours
const COL_SKY_LOW      = 0x0a0a1a
const COL_OCEAN_DEEP   = 0x0d3d6b
const COL_OCEAN_SHALLOW = 0x1a6a9a
const COL_LAND_DEEP    = 0x1a3d0a
const COL_LAND         = 0x2d7a16
const COL_POLAR_ICE    = 0xdcf0ff
const COL_PLANET_RIM   = 0x2a4a2a
const COL_BODY       = 0x48d1cc
const COL_BODY_DARK  = 0x008b8b
const COL_HEAD       = 0x7fffd4
const COL_EYE        = 0x002e2e


const COL_PULSE      = 0xffffff

export class GameScene extends Phaser.Scene {
  private head!: SerpentHead
  private body!: SerpentBody
  private inputSys!: InputSystem
  private growth!: GrowthSystem

  private foods: FoodItem[] = []
  private hazards: HazardRuntime[] = []
  private lavaBlobs: LavaBlob[] = []
  private gods: God[] = []
  private godProjectiles: GodProjectile[] = []
  private martians: God[] = []
  private martianProjectiles: GodProjectile[] = []
  private nextGodId = 0
  private hasEatenGod = false

  // Orbital craft — the ISS circling Earth, and occasional UFO flybys
  private issAngle = 0
  private issAlive = true
  private issRespawnMs = 0
  private ufos: Ufo[] = []
  private nextUfoMs = 0

  /** Live celestial bodies. Starts as a copy of BODIES; entries leave when devoured. */
  private bodies: CelestialBody[] = [...BODIES]
  /** Cached because dominanceRadius bisects — recomputed only when `bodies` changes. */
  private moonDominanceRadius = 0

  private gameState: GameState = 'PLAYING'
  private score = 0
  private bestScore = 0
  private foodsSinceLastHazard = 0
  private movementStats: MovementStats = baseMovementStats()
  private displayCeilingAlt = PLAYABLE_ALT_MAX  // smoothly lerped for rendering

  private devourRings: DevourRing[] = []
  private hasDevouredHazard = false
  private announcedSwallowable = new Set<string>()
  private announcedBurrowable = new Set<string>()
  /** Burrow state per body id — bites carved, area chewed. */
  private burrows: Record<string, BurrowState> = {}

  private gfx!: Phaser.GameObjects.Graphics
  private scoreText!: Phaser.GameObjects.Text
  private preyText!: Phaser.GameObjects.Text
  private toastText!: Phaser.GameObjects.Text
  private deathPanel!: Phaser.GameObjects.Container
  private deathTitleText!: Phaser.GameObjects.Text
  private deathScoreText!: Phaser.GameObjects.Text
  private deathBestText!: Phaser.GameObjects.Text
  private deathHintText!: Phaser.GameObjects.Text

  // TODO: remove debug key before release
  private debugFeedKey!: Phaser.Input.Keyboard.Key
  private debugFeedTapped = false

  // Camera follow target
  private camTarget!: Phaser.GameObjects.Container
  private currentZoom = CAMERA_BASE_ZOOM
  private baseZoom = CAMERA_BASE_ZOOM
  // Separate camera for HUD so it keeps a constant on-screen size while the world zooms out
  private uiCam!: Phaser.Cameras.Scene2D.Camera
  private uiObjects: Phaser.GameObjects.GameObject[] = []

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

    this.bodies = [...BODIES]
    this.refreshBodyDerived()

    // Generate hazards
    const hazardItems = generateHazards(INITIAL_HAZARD_COUNT, SPAWN_ANGLE)
    this.hazards = hazardItems.map(h => buildHazardRuntime(h, CENTRE, PLANET_RADIUS))

    // Spawn initial food
    this.foods = []
    this.spawnFoodBatch(INITIAL_FOOD_COUNT)

    // Gods patrolling Midgard, Martians patrolling Mars
    this.spawnInhabitants()

    // Orbital craft
    this.resetCraft()

    // Camera — zoom computed from actual camera height so planet fills ~80% regardless of screen size
    this.baseZoom = this.computeBaseZoom()
    this.currentZoom = this.baseZoom
    this.camTarget = this.add.container(this.head.position.x, this.head.position.y)
    this.cameras.main.startFollow(this.camTarget, false, CAMERA_SMOOTHING, CAMERA_SMOOTHING)
    this.cameras.main.setZoom(this.currentZoom)

    // TODO: remove debug key before release
    this.debugFeedKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G)
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x > this.cameras.main.width * 0.75 && ptr.y < this.cameras.main.height * 0.25) {
        this.debugFeedTapped = true
      }
    })

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

    // Coil progress toward the next world — makes "big enough" a number, not a mystery
    this.preyText = this.add.text(16, 12 + fs + 4, '', {
      fontSize: `${Math.round(fs * 0.8)}px`,
      color: '#88ccff',
      fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(10)

    // Milestone toast — centre-top, fades itself out
    this.toastText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height * 0.18, '', {
      fontSize: `${fs + 2}px`,
      color: '#ffd700',
      fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(15).setAlpha(0)

    // Death overlay
    this.buildDeathOverlay()

    // HUD lives on its own camera that never zooms, so the text stays a fixed on-screen
    // size no matter how far the world camera pulls back. The main camera renders only the
    // world; the UI camera renders only the HUD.
    this.uiObjects = [this.scoreText, this.preyText, this.toastText, this.deathPanel]
    this.uiCam = this.cameras.add(0, 0, this.cameras.main.width, this.cameras.main.height)
    this.uiCam.setScroll(0, 0)
    this.cameras.main.ignore(this.uiObjects)
    this.uiCam.ignore([this.gfx, this.camTarget])

    // Recompute zoom and UI on window resize
    this.scale.on('resize', () => {
      this.baseZoom = this.computeBaseZoom()
      this.currentZoom = this.baseZoom
      this.cameras.main.setZoom(this.currentZoom)
      this.uiCam.setSize(this.cameras.main.width, this.cameras.main.height)
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

    const bg = this.add.rectangle(0, 0, 340, 160, 0x000000, 0.82)
    this.deathTitleText = this.add.text(0, -56, '', {
      fontSize: `${fs + 2}px`, color: '#ffffff', fontFamily: 'monospace', align: 'center'
    }).setOrigin(0.5)
    this.deathScoreText = this.add.text(0, -20, '', {
      fontSize: `${fs + 4}px`, color: '#ffd700', fontFamily: 'monospace', align: 'center'
    }).setOrigin(0.5)
    this.deathBestText = this.add.text(0, 14, '', {
      fontSize: `${fs}px`, color: '#ffffd0', fontFamily: 'monospace', align: 'center'
    }).setOrigin(0.5)
    this.deathHintText = this.add.text(0, fs + 30, 'tap or press space to restart', {
      fontSize: `${Math.round(fs * 0.8)}px`, color: '#aaaaaa', fontFamily: 'monospace', align: 'center'
    }).setOrigin(0.5)

    this.deathPanel.add([bg, this.deathTitleText, this.deathScoreText, this.deathBestText, this.deathHintText])

    // Tap anywhere to restart once the run is over
    this.input.on('pointerdown', () => {
      if (this.gameState !== 'PLAYING') this.resetGame()
    })
  }

  private repositionDeathPanel(): void {
    if (this.deathPanel) {
      this.deathPanel.setPosition(this.cameras.main.width / 2, this.cameras.main.height / 2)
    }
    if (this.toastText) {
      this.toastText.setPosition(this.cameras.main.width / 2, this.cameras.main.height * 0.18)
    }
  }

  /** Bodies whose gravity is live at the current score. Surfaces stay solid regardless. */
  private activeBodies(): CelestialBody[] {
    return this.bodies.filter(b => this.score >= b.unlockScore)
  }

  private findBody(id: string): CelestialBody | undefined {
    return this.bodies.find(b => b.id === id)
  }

  /** Recompute anything derived from the set of live bodies. Call after eating one. */
  private refreshBodyDerived(): void {
    const moon = this.findBody('moon')
    this.moonDominanceRadius = moon ? dominanceRadius(moon, this.bodies) : 0
  }

  private showToast(message: string): void {
    this.toastText.setText(message)
    this.tweens.killTweensOf(this.toastText)
    this.toastText.setAlpha(1)
    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      delay: TOAST_MS * 0.6,
      duration: TOAST_MS * 0.4,
    })
  }

  private addDevourRing(x: number, y: number, radius: number, nowMs: number): void {
    this.devourRings.push({ x, y, radius, spawnMs: nowMs })
  }

  private updateLava(nowMs: number, dtSec: number, gravitySources: readonly CelestialBody[]): void {
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

      // Same gravity field the serpent flies in
      const g = netGravity(b, gravitySources)
      b.vx += g.x * dtSec
      b.vy += g.y * dtSec
      b.x  += b.vx * dtSec
      b.y  += b.vy * dtSec

      // Remove if hit any surface still in the world
      if (this.bodies.some(cb => Math.hypot(b.x - cb.x, b.y - cb.y) < cb.radius)) {
        this.lavaBlobs.splice(i, 1)
      }
    }
  }

  /** Re-compute movement + body stats from current score */
  private recomputeStats(): void {
    const f = this.score
    this.movementStats = {
      ...this.movementStats,
      maxSpeed:           MAX_SPEED            + f * 30,   // +30 speed per food
      minTangentialSpeed: MIN_TANGENTIAL_SPEED + f * 12,   // +12 orbital floor per food
      playableAltMax:     PLAYABLE_ALT_MAX     + f * 20,   // +20 altitude ceiling per food
    }
  }

  /** Dynamic body widths based on score */
  private bodyHeadWidth(): number { return BODY_WIDTH_HEAD + this.score * 2.5 }
  private bodyTailWidth(): number { return BODY_WIDTH_TAIL + this.score * 1.2 }

  /** Spawn Earth's gods and Mars's Martians for a new run. */
  private spawnInhabitants(): void {
    this.gods = spawnGods(GOD_INITIAL_COUNT, this.nextGodId)
    this.nextGodId += GOD_INITIAL_COUNT
    this.godProjectiles = []
    this.martians = spawnGods(MARTIAN_COUNT, this.nextGodId, ['martian', 'jumper'])
    this.nextGodId += MARTIAN_COUNT
    this.martianProjectiles = []
  }

  /** Fresh orbital-craft state for a new run. */
  private resetCraft(): void {
    this.issAngle = Math.random() * Math.PI * 2
    this.issAlive = true
    this.issRespawnMs = 0
    this.ufos = []
    this.nextUfoMs = UFO_SPAWN_MIN_MS + Math.random() * (UFO_SPAWN_MAX_MS - UFO_SPAWN_MIN_MS)
  }

  /** World-space centre of the ISS on its Earth orbit. */
  private issWorldPos(): { x: number; y: number } {
    const r = PLANET_RADIUS + ISS_ALTITUDE
    return { x: CENTRE.x + Math.cos(this.issAngle) * r, y: CENTRE.y + Math.sin(this.issAngle) * r }
  }

  /** Move the ISS along its orbit and drift/expire UFOs; spawn the occasional flyby. */
  private updateCraft(nowMs: number, dtSec: number): void {
    // ISS orbits only while Earth is there to orbit
    if (this.findBody('earth')) {
      this.issAngle += ISS_ANGULAR_SPEED * dtSec
      if (!this.issAlive && nowMs >= this.issRespawnMs) this.issAlive = true
    } else {
      this.issAlive = false
    }

    // Occasional UFO flyby, launched from off-screen across the head's vicinity
    if (nowMs >= this.nextUfoMs) {
      this.nextUfoMs = nowMs + UFO_SPAWN_MIN_MS + Math.random() * (UFO_SPAWN_MAX_MS - UFO_SPAWN_MIN_MS)
      const hx = this.head.position.x, hy = this.head.position.y
      const inAng = Math.random() * Math.PI * 2
      const dist = 700
      const sx = hx + Math.cos(inAng) * dist, sy = hy + Math.sin(inAng) * dist
      // Fly roughly across the head, offset so it passes by rather than straight at it
      const toHead = Math.atan2(hy - sy, hx - sx) + (Math.random() - 0.5) * 0.9
      this.ufos.push({
        x: sx, y: sy,
        vx: Math.cos(toHead) * UFO_SPEED, vy: Math.sin(toHead) * UFO_SPEED,
        spawnMs: nowMs, phase: Math.random() * Math.PI * 2,
      })
    }
    for (let i = this.ufos.length - 1; i >= 0; i--) {
      const u = this.ufos[i]
      if (nowMs - u.spawnMs > UFO_LIFE_MS) { this.ufos.splice(i, 1); continue }
      u.x += u.vx * dtSec
      u.y += u.vy * dtSec
    }
  }

  update(time: number, delta: number): void {
    const dtSec = delta / 1000
    const nowMs = time

    this.inputSys.update()

    if (this.gameState === 'PLAYING') {
      this.updatePlaying(nowMs, dtSec)
    } else {
      // DEAD or WON: check for restart input
      if (this.inputSys.isRestartPressed()) this.resetGame()
    }

    this.renderFrame(nowMs)
  }

  private updatePlaying(nowMs: number, dtSec: number): void {
    // TODO: remove debug key before release — G or top-right tap gives 7 food points instantly
    if (Phaser.Input.Keyboard.JustDown(this.debugFeedKey) || this.debugFeedTapped) {
      this.debugFeedTapped = false
      this.score += 7
      this.foodsSinceLastHazard += 7
      this.growth.onFoodEaten(nowMs, 7)
      this.recomputeStats()
      this.scoreText.setText(`score: ${this.score}`)
    }

    const inputState = this.inputSys.getState()
    const gravitySources = this.activeBodies()

    // Physics
    updateMovement(this.head, inputState, dtSec, this.movementStats, gravitySources)

    // Lava eruptions + blob physics
    this.updateLava(nowMs, dtSec, gravitySources)

    // Inhabitants walk, leap, and hurl — each set only while its world still exists
    if (this.findBody('earth')) {
      updateGods(this.gods, this.godProjectiles, this.head.position, CENTRE, PLANET_RADIUS, nowMs, dtSec)
      updateGodProjectiles(this.godProjectiles, this.gods, CENTRE, PLANET_RADIUS, nowMs, dtSec)
    }
    if (this.findBody('mars')) {
      updateGods(this.martians, this.martianProjectiles, this.head.position, MARS_CENTRE, MARS_RADIUS, nowMs, dtSec)
      updateGodProjectiles(this.martianProjectiles, this.martians, MARS_CENTRE, MARS_RADIUS, nowMs, dtSec)
    }

    // ISS orbit + UFO flybys
    this.updateCraft(nowMs, dtSec)

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
        if (headRadius > h.eatRadius) {
          // Snake is big enough — devour the hazard
          const isVolcano = h.width > 40
          this.hazards.splice(i, 1)
          this.score++
          this.foodsSinceLastHazard++
          this.growth.onFoodEaten(nowMs, HAZARD_NUTRITION)
          this.recomputeStats()
          this.scoreText.setText(`score: ${this.score}`)

          // Bigger prey, bigger jolt — the shake is the feedback that you outgrew it
          this.addDevourRing(h.worldX, h.worldY, h.collisionRadius, nowMs)
          this.cameras.main.shake(90 + h.collisionRadius * 3, 0.003 + h.collisionRadius * 0.00015)

          if (!this.hasDevouredHazard) {
            this.hasDevouredHazard = true
            this.showToast('DEVOURED\nyou have outgrown the surface')
          } else if (isVolcano) {
            this.showToast('a volcano, swallowed whole')
          }
        } else {
          this.triggerDeath(nowMs); return
        }
      }
    }

    // Celestial surfaces + self-collision. A surface is only lethal while it is
    // bigger than you; once you can coil around it, it is food.
    const contact = checkHeadContact(
      this.head.position.x, this.head.position.y, samples, this.bodies, this.body.length, this.score
    )
    if (contact?.kind === 'death') { this.triggerDeath(nowMs); return }
    if (contact?.kind === 'swallow') { this.swallowBody(contact.body, nowMs, swallowNutrition(contact.body)); return }
    if (contact?.kind === 'burrow') { this.burrowInto(contact.body, nowMs) }  // not lethal — carve and fly on

    const hx = this.head.position.x, hy = this.head.position.y
    for (const blob of this.lavaBlobs) {
      const dx = hx - blob.x, dy = hy - blob.y
      if (Math.sqrt(dx * dx + dy * dy) < this.bodyHeadWidth() / 2 + blob.radius) {
        this.triggerDeath(nowMs); return
      }
    }

    // Inhabitants of Earth and Mars: projectiles are always lethal; the walkers are prey
    // once you've outgrown them, death by touch otherwise.
    if (this.checkInhabitantHits(this.gods, this.godProjectiles, CENTRE, PLANET_RADIUS, nowMs) === 'dead') { this.triggerDeath(nowMs); return }
    if (this.checkInhabitantHits(this.martians, this.martianProjectiles, MARS_CENTRE, MARS_RADIUS, nowMs) === 'dead') { this.triggerDeath(nowMs); return }

    // Orbital craft — harmless snacks. Catch the ISS or a UFO and gulp it down.
    if (this.issAlive && this.findBody('earth')) {
      const iss = this.issWorldPos()
      if (Math.hypot(hx - iss.x, hy - iss.y) < headRadius + ISS_RADIUS) {
        this.issAlive = false
        this.issRespawnMs = nowMs + ISS_RESPAWN_MS
        this.eatCraft(iss.x, iss.y, ISS_RADIUS, ISS_NUTRITION, nowMs)
      }
    }
    for (let i = this.ufos.length - 1; i >= 0; i--) {
      const u = this.ufos[i]
      if (Math.hypot(hx - u.x, hy - u.y) < headRadius + UFO_RADIUS) {
        this.ufos.splice(i, 1)
        this.eatCraft(u.x, u.y, UFO_RADIUS, UFO_NUTRITION, nowMs)
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

    this.updatePreyHud()
    this.devourRings = this.devourRings.filter(r => nowMs - r.spawnMs < DEVOUR_RING_MS)

    // Smoothly expand ceiling display
    this.displayCeilingAlt = lerp(this.displayCeilingAlt, this.movementStats.playableAltMax, 0.025)

    // Zoom out as score grows — reveals moon progressively
    const scoreFrac = Math.min(1, this.score / CAMERA_ZOOM_FULL_SCORE)
    const targetZoom = lerp(this.baseZoom, CAMERA_ZOOM_MIN, scoreFrac)
    this.currentZoom = lerp(this.currentZoom, targetZoom, 0.02)
    this.cameras.main.setZoom(this.currentZoom)
  }

  /**
   * A world leaves play — swallowed whole, or collapsed after being burrowed hollow.
   * `netGravity` sums whatever is left, so eating the thing you were orbiting flings you
   * toward whatever still pulls. No special case. `nutrition` is the growth payload:
   * a full gulp pays the world's worth; a collapse pays little, since burrowing already fed you.
   */
  private swallowBody(b: CelestialBody, nowMs: number, nutrition: number): void {
    this.bodies = this.bodies.filter(x => x.id !== b.id)
    delete this.burrows[b.id]
    this.refreshBodyDerived()

    this.score += nutrition
    if (nutrition > 0) this.growth.onFoodEaten(nowMs, nutrition)
    this.recomputeStats()
    this.scoreText.setText(`score: ${this.score}`)

    this.addDevourRing(b.x, b.y, b.radius, nowMs)
    this.cameras.main.shake(600, 0.02)

    // Eating a populated world ends its surface life but not the game — the ladder continues
    if (b.id === 'earth') {
      this.hazards = []
      this.gods = []
      this.godProjectiles = []
      this.lavaBlobs = []
    }
    if (b.id === 'mars') {
      this.martians = []
      this.martianProjectiles = []
    }

    // The last world eaten is the finale — nothing left in the heavens to devour
    if (this.bodies.length === 0) { this.triggerWin(); return }

    const label = b.name ?? b.id
    this.showToast(`${label.toUpperCase()} IS EATEN\nthe hunger grows`)
  }

  /**
   * The head is inside `b` and long enough to burrow. Carve a cavity at the head and — once
   * enough of the world is hollowed out — collapse it. Burrowing does NOT grow the serpent;
   * excavating a world is its own reward, paid at the collapse.
   *
   * Carved area is measured as the tunnel's *swept* area (path length × width), not the sum
   * of each bite's disc. Overlapping bites along a straight bore would otherwise overcount
   * wildly and collapse a world in a single pass.
   *
   * The head is NOT stopped: gravity keeps pulling it toward the core, so it tunnels through.
   */
  private burrowInto(b: CelestialBody, nowMs: number): void {
    const st = this.burrows[b.id] ?? (this.burrows[b.id] = {
      bites: [], carvedArea: 0, lastX: 0, lastY: 0, hasBite: false,
    })

    const hx = this.head.position.x, hy = this.head.position.y
    const carveR = (this.bodyHeadWidth() / 2) * BURROW_CARVE_RADIUS_MULT

    // Only lay a fresh bite once the head has moved far enough — bounds the count and
    // stops a stationary head from inflating carvedArea toward a free collapse.
    const moved = st.hasBite ? Math.hypot(hx - st.lastX, hy - st.lastY) : 0
    if (st.hasBite && moved <= carveR * BURROW_BITE_SPACING_MULT) return

    st.bites.push({ x: hx, y: hy, r: carveR })
    // Swept area: the entry crater once, then a rectangular slab per step of tunnel
    st.carvedArea += st.hasBite ? moved * 2 * carveR : Math.PI * carveR * carveR
    st.lastX = hx; st.lastY = hy; st.hasBite = true

    // HUD reflects progress; no growth, no score for the act of digging
    this.updatePreyHud()

    // Enough of the world hollowed → it collapses. The collapse pays a modest finishing bonus.
    const worldArea = Math.PI * b.radius * b.radius
    if (st.carvedArea >= worldArea * BURROW_COLLAPSE_FRACTION) {
      this.swallowBody(b, nowMs, Math.round(swallowNutrition(b) * 0.25))
    }
  }

  /**
   * Head against one inhabitant set (gods on Earth, Martians on Mars) and their projectiles.
   * Returns 'dead' if the serpent should die this frame; otherwise resolves any eats.
   */
  private checkInhabitantHits(
    list: God[], projectiles: GodProjectile[], centre: Vec2, radius: number, nowMs: number
  ): 'dead' | 'ok' {
    const hx = this.head.position.x, hy = this.head.position.y
    const headRadius = this.bodyHeadWidth() / 2

    // Thrown hammer or bolt to the head is always lethal — dodge them
    for (const p of projectiles) {
      const pr = p.kind === 'hammer' ? HAMMER_RADIUS : BOLT_RADIUS
      if (Math.hypot(hx - p.x, hy - p.y) < headRadius + pr) return 'dead'
    }

    const canEat = headRadius >= GOD_EAT_HEAD_RADIUS
    for (let i = list.length - 1; i >= 0; i--) {
      const gp = godWorldPos(list[i], centre, radius)
      if (Math.hypot(hx - gp.x, hy - gp.y) < headRadius + GOD_COLLISION_RADIUS) {
        if (!canEat) return 'dead'
        const type = list[i].type
        list.splice(i, 1)
        this.score++
        this.growth.onFoodEaten(nowMs, GOD_NUTRITION)
        this.recomputeStats()
        this.scoreText.setText(`score: ${this.score}`)
        this.addDevourRing(gp.x, gp.y, GOD_COLLISION_RADIUS * 1.5, nowMs)
        this.cameras.main.shake(120, 0.006)
        if (!this.hasEatenGod) {
          this.hasEatenGod = true
          this.showToast(
            type === 'thor' ? 'you have swallowed THOR\nthe thunderer is meat now'
            : type === 'martian' ? 'a Martian, devoured\nthe red world is yours'
            : 'a god, devoured\nthey cannot stop you')
        }
      }
    }
    return 'ok'
  }

  /** Shared reward for snapping up a small craft (ISS or UFO). */
  private eatCraft(x: number, y: number, radius: number, nutrition: number, nowMs: number): void {
    this.score++
    this.growth.onFoodEaten(nowMs, nutrition)
    this.recomputeStats()
    this.scoreText.setText(`score: ${this.score}`)
    this.addDevourRing(x, y, radius * 1.6, nowMs)
    this.cameras.main.shake(70, 0.004)
  }

  /** Progress toward the next world you can't yet fully swallow, and its burrow state. */
  private updatePreyHud(): void {
    const len = this.body.length
    const target = this.bodies
      .filter(b => !canSwallow(b, len))
      .sort((a, b) => a.radius - b.radius)[0]

    if (!target) {
      this.preyText.setText(this.bodies.length ? 'every world is prey' : '')
    } else if (canBurrow(target, len, this.score)) {
      // Show how much of it is chewed away rather than coils — burrowing is the live goal
      const worldArea = Math.PI * target.radius * target.radius
      const eaten = Math.min(100, ((this.burrows[target.id]?.carvedArea ?? 0) /
        (worldArea * BURROW_COLLAPSE_FRACTION)) * 100)
      this.preyText.setText(`${target.id}: burrow — ${eaten.toFixed(0)}% devoured`)
    } else {
      const coils = coilProgress(target, len) * SWALLOW_COILS
      this.preyText.setText(`${target.id}: ${coils.toFixed(1)} / ${SWALLOW_COILS.toFixed(1)} coils`)
    }

    // Announce each tier the moment it opens, once per world per run
    for (const b of this.bodies) {
      if (canBurrow(b, len, this.score) && !this.announcedBurrowable.has(b.id)) {
        this.announcedBurrowable.add(b.id)
        this.showToast(`you can now BURROW into the ${b.id}\ndive in and tunnel through`)
      }
      if (canSwallow(b, len) && !this.announcedSwallowable.has(b.id)) {
        this.announcedSwallowable.add(b.id)
        this.showToast(`the ${b.id} is small enough to swallow whole`)
      }
    }
  }

  private triggerWin(): void {
    this.gameState = 'WON'
    if (this.score > this.bestScore) this.bestScore = this.score
    this.hazards = []
    this.foods = []
    this.lavaBlobs = []
    this.gods = []
    this.godProjectiles = []
    this.martians = []
    this.martianProjectiles = []
    this.ufos = []
    this.issAlive = false
    this.toastText.setAlpha(0)
    this.deathTitleText.setText('THE HEAVENS ARE DEVOURED')
    this.deathScoreText.setText(`score: ${this.score}`)
    this.deathBestText.setText(`best: ${this.bestScore}`)
    this.deathHintText.setText('tap or press space to begin again')
    this.deathPanel.setVisible(true)
    this.cameras.main.shake(900, 0.025)
  }

  private triggerDeath(_nowMs: number): void {
    this.gameState = 'DEAD'
    if (this.score > this.bestScore) this.bestScore = this.score
    this.deathTitleText.setText('')
    this.deathScoreText.setText(`score: ${this.score}`)
    this.deathBestText.setText(`best: ${this.bestScore}`)
    this.deathHintText.setText('tap or press space to restart')
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
    this.devourRings = []
    this.hasDevouredHazard = false
    this.hasEatenGod = false
    this.announcedSwallowable.clear()
    this.announcedBurrowable.clear()
    this.burrows = {}
    this.bodies = [...BODIES]
    this.refreshBodyDerived()
    this.scoreText.setText('score: 0')
    this.preyText.setText('')
    this.tweens.killTweensOf(this.toastText)
    this.toastText.setAlpha(0)
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
    this.spawnInhabitants()
    this.resetCraft()
    this.currentZoom = this.baseZoom
    this.cameras.main.setZoom(this.baseZoom)
  }

  /**
   * Pre-populate the ring buffer with a trail extending behind the head.
   * Push tail-first so the most recent entry (writePtr-1) is the head.
   * Trail extends in the direction opposite to initial velocity (CCW at spawn bottom).
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
    // Bodies without a bespoke renderer (Mars, its moons, Jupiter, the Sun) draw generically
    for (const b of this.bodies) {
      if (b.id === 'earth' || b.id === 'moon') continue
      this.renderGenericBody(g, b)
      if (b.id === 'mars') this.renderOlympusMons(g, b)
      this.renderBites(g, b)
      if (b.id === 'mars') {
        this.renderGods(g, this.martians, { x: b.x, y: b.y }, b.radius, nowMs)
        this.renderGodProjectiles(g, this.martianProjectiles)
      }
    }
    const moon = this.findBody('moon')
    if (moon) { this.renderMoon(g); this.renderBites(g, moon) }
    const earth = this.findBody('earth')
    if (earth) {
      this.renderSkyBoundary(g)
      this.renderPlanet(g)
      this.renderBites(g, earth)
      this.renderHazards(g, nowMs)
      this.renderGods(g, this.gods, CENTRE, PLANET_RADIUS, nowMs)
      this.renderGodProjectiles(g, this.godProjectiles)
      this.renderIss(g, nowMs)
    }
    this.renderUfos(g, nowMs)
    this.renderSwallowableHalos(g, nowMs)
    this.renderNextTargetBeacon(g, nowMs)
    this.renderLavaBlobs(g, nowMs)
    this.renderFood(g, nowMs)
    this.renderDevourRings(g, nowMs)

    const samples = this.body.getSamples(this.body.visibleSampleCount)
    this.renderBody(g, samples, nowMs, this.bodyHeadWidth(), this.bodyTailWidth())
    this.renderHead(g)
  }

  private renderBackground(g: Phaser.GameObjects.Graphics): void {
    // Fill the actual view (plus margin) so there's never bare black beyond a fixed rect,
    // however far out the serpent flies or the camera zooms.
    const v = this.cameras.main.worldView
    const m = Math.max(v.width, v.height)
    g.fillStyle(COL_SKY_LOW)
    g.fillRect(v.x - m, v.y - m, v.width + m * 2, v.height + m * 2)
  }

  /**
   * Infinite parallax-free starfield: a grid of cells covering the view, one hashed star per
   * populated cell. Because it's generated from cell coordinates it tiles forever — deep space
   * is always starry, never an empty void. Cell size scales with zoom to bound the star count.
   */
  private renderStars(g: Phaser.GameObjects.Graphics): void {
    const v = this.cameras.main.worldView
    const cell = Math.max(120, v.height / 26)
    const i0 = Math.floor(v.x / cell) - 1, i1 = Math.floor((v.x + v.width) / cell) + 1
    const j0 = Math.floor(v.y / cell) - 1, j1 = Math.floor((v.y + v.height) / cell) + 1
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const h = starHash(i * 73856.1 + j * 19349.7)
        if (h < 0.35) continue                       // ~2/3 of cells hold a star
        const h2 = starHash(i * 12.3 + j * 78.2 + 7)
        const sx = (i + starHash(i * 3.1 + j * 5.7)) * cell
        const sy = (j + h2) * cell
        g.fillStyle(0xffffff, 0.35 + h2 * 0.5)
        g.fillCircle(sx, sy, 0.5 + h * 1.6)
      }
    }
  }

  private renderMoon(g: Phaser.GameObjects.Graphics): void {
    const mx = MOON_X, my = MOON_Y, R = MOON_RADIUS

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

    // Dominance ring — cross it and the moon, not Earth, is what "down" means.
    // Drawn over the atmosphere halos so it stays legible. Brightens once moon gravity is live.
    const unlocked = this.score >= MOON_UNLOCK_SCORE
    g.lineStyle(unlocked ? 1.5 : 1, unlocked ? 0x88ccff : 0x445566, unlocked ? 0.45 : 0.18)
    g.strokeCircle(mx, my, this.moonDominanceRadius)
  }

  /**
   * Draws any celestial body from its data alone — colour, atmosphere, a few stable craters.
   * Earth and the moon keep their bespoke art; everything else in BODIES routes through here,
   * so extending the ladder (Mars, the sun, …) is a config row, not new render code.
   */
  private renderGenericBody(g: Phaser.GameObjects.Graphics, b: CelestialBody): void {
    const R = b.radius
    const base = b.color ?? 0x888888
    // Deterministic per-body variation — no Math.random at render time (would strobe)
    const seed = b.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)

    // Atmosphere halo
    for (let i = 3; i >= 1; i--) {
      g.fillStyle(base, 0.05 * i)
      g.fillCircle(b.x, b.y, R + i * (R * 0.12))
    }
    // Base disc
    g.fillStyle(base)
    g.fillCircle(b.x, b.y, R)
    // Sunlit face — upper-right lighter
    g.fillStyle(this.lighten(base, 0.3), 0.5)
    g.fillCircle(b.x + R * 0.18, b.y - R * 0.18, R * 0.86)
    // A handful of craters/mare, positioned from the seed
    for (let i = 0; i < 5; i++) {
      const a = seed * 1.3 + i * 2.399
      const dist = ((seed * 7 + i * 53) % 60) / 100 * R
      const cr = (0.08 + ((seed + i * 13) % 12) / 100) * R
      g.fillStyle(this.darken(base, 0.35), 0.55)
      g.fillCircle(b.x + Math.cos(a) * dist, b.y + Math.sin(a) * dist, cr)
    }
    // Limb shadow on the far side
    g.fillStyle(0x000010, 0.3)
    g.fillCircle(b.x - R * 0.28, b.y, R * 0.85)
    // Orbital beacon ring so it reads as a destination from afar
    g.lineStyle(1, this.lighten(base, 0.4), 0.4)
    g.strokeCircle(b.x, b.y, R + 12)
  }

  /** Blend a colour toward white by t (0..1). */
  private lighten(c: number, t: number): number {
    const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff
    const m = (v: number) => Math.min(255, Math.round(v + (255 - v) * t))
    return (m(r) << 16) | (m(g) << 8) | m(b)
  }

  /** Blend a colour toward black by t (0..1). */
  private darken(c: number, t: number): number {
    const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff
    const m = (v: number) => Math.max(0, Math.round(v * (1 - t)))
    return (m(r) << 16) | (m(g) << 8) | m(b)
  }

  /** Olympus Mons — the vast shield volcano, the solar system's tallest, on Mars's flank. */
  private renderOlympusMons(g: Phaser.GameObjects.Graphics, b: CelestialBody): void {
    const ang = -0.7  // fixed spot on Mars
    const rad = { x: Math.cos(ang), y: Math.sin(ang) }
    const tan = { x: -Math.sin(ang), y: Math.cos(ang) }
    const R = b.radius
    // Sink the base slightly below the surface so it always overlaps
    const sink = R * 0.03
    const bx = b.x + rad.x * (R - sink), by = b.y + rad.y * (R - sink)
    const halfBase = R * 0.46      // very broad — a shield, not a cone
    const height = R * 0.3
    const topHalf = R * 0.16
    const topX = bx + rad.x * height, topY = by + rad.y * height

    // Shield body
    g.fillStyle(this.darken(b.color ?? 0xc1440e, 0.35))
    g.beginPath()
    g.moveTo(bx - tan.x * halfBase, by - tan.y * halfBase)
    g.lineTo(topX - tan.x * topHalf, topY - tan.y * topHalf)
    g.lineTo(topX + tan.x * topHalf, topY + tan.y * topHalf)
    g.lineTo(bx + tan.x * halfBase, by + tan.y * halfBase)
    g.closePath(); g.fillPath()
    // Lit flank
    g.fillStyle(this.lighten(b.color ?? 0xc1440e, 0.15), 0.6)
    g.beginPath()
    g.moveTo(bx, by)
    g.lineTo(bx + tan.x * halfBase, by + tan.y * halfBase)
    g.lineTo(topX + tan.x * topHalf, topY + tan.y * topHalf)
    g.lineTo(topX, topY)
    g.closePath(); g.fillPath()
    // Summit caldera
    g.fillStyle(this.darken(b.color ?? 0xc1440e, 0.6))
    g.fillCircle(topX, topY, topHalf * 0.7)
    g.fillStyle(0x1a0a06)
    g.fillCircle(topX, topY, topHalf * 0.4)
  }

  /**
   * A chevron near the head pointing at the next world to conquer — the nearest body whose
   * gravity is live but that you haven't eaten. Without it, a far planet is just black space.
   */
  private renderNextTargetBeacon(g: Phaser.GameObjects.Graphics, nowMs: number): void {
    const hx = this.head.position.x, hy = this.head.position.y
    // Nearest gravity-active body that isn't the one we're currently closest-orbiting.
    let target: CelestialBody | null = null
    let bestDist = Infinity
    for (const b of this.activeBodies()) {
      const d = Math.hypot(b.x - hx, b.y - hy)
      // Skip the body we're sitting on/inside — beacon should point onward
      if (d < b.radius * 2.4) continue
      if (d < bestDist) { bestDist = d; target = b }
    }
    if (!target) return

    const ang = Math.atan2(target.y - hy, target.x - hx)
    const headR = this.bodyHeadWidth() / 2
    const dist = headR + 26
    const cx = hx + Math.cos(ang) * dist
    const cy = hy + Math.sin(ang) * dist
    const pulse = 0.4 + Math.sin(nowMs * 0.006) * 0.25
    const col = target.color ?? 0x88ccff
    const s = 7
    const px = Math.cos(ang), py = Math.sin(ang)
    const nx = -py, ny = px
    g.fillStyle(col, pulse + 0.3)
    g.beginPath()
    g.moveTo(cx + px * s,          cy + py * s)
    g.lineTo(cx - px * s + nx * s, cy - py * s + ny * s)
    g.lineTo(cx - px * s - nx * s, cy - py * s - ny * s)
    g.closePath()
    g.fillPath()
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

  /** Expanding shockwave left where something was devoured. */
  private renderDevourRings(g: Phaser.GameObjects.Graphics, nowMs: number): void {
    for (const r of this.devourRings) {
      const t = (nowMs - r.spawnMs) / DEVOUR_RING_MS
      if (t < 0 || t > 1) continue
      const radius = r.radius * (0.6 + t * 1.6)
      const alpha = (1 - t) * 0.8
      g.lineStyle(2 + (1 - t) * 3, 0xffd700, alpha)
      g.strokeCircle(r.x, r.y, radius)
      g.lineStyle(1, 0xffffff, alpha * 0.6)
      g.strokeCircle(r.x, r.y, radius * 0.75)
    }
  }

  /** Holes chewed into a world — drawn as dark cavities over its surface. */
  private renderBites(g: Phaser.GameObjects.Graphics, b: CelestialBody): void {
    const st = this.burrows[b.id]
    if (!st) return
    for (const bite of st.bites) {
      // Cavity floor — sky colour so it reads as punched clean through
      g.fillStyle(COL_SKY_LOW, 1)
      g.fillCircle(bite.x, bite.y, bite.r)
      // Inner shadow rim for depth
      g.lineStyle(2, 0x000000, 0.5)
      g.strokeCircle(bite.x, bite.y, bite.r)
      g.fillStyle(0x000000, 0.25)
      g.fillCircle(bite.x, bite.y, bite.r * 0.7)
    }
  }

  /**
   * Rim around any world the serpent can act on: gold = swallow whole, ember = burrow in.
   * The player should never have to guess which tier they're in.
   */
  private renderSwallowableHalos(g: Phaser.GameObjects.Graphics, nowMs: number): void {
    const len = this.body.length
    for (const b of this.bodies) {
      if (canSwallow(b, len)) {
        const pulse = 0.55 + Math.sin(nowMs * 0.005) * 0.25
        g.lineStyle(3, 0xffd700, pulse)
        g.strokeCircle(b.x, b.y, b.radius + 6)
      } else if (canBurrow(b, len, this.score)) {
        const pulse = 0.45 + Math.sin(nowMs * 0.006) * 0.2
        g.lineStyle(2, 0xff7722, pulse)
        g.strokeCircle(b.x, b.y, b.radius + 5)
      }
    }
  }

  private renderHazards(g: Phaser.GameObjects.Graphics, nowMs: number): void {
    const headRadius = this.bodyHeadWidth() / 2
    for (const h of this.hazards) {
      // Edible prey wears a gold rim — the player should never have to guess
      if (headRadius > h.eatRadius) {
        const pulse = 0.35 + Math.sin(nowMs * 0.006 + h.angle * 3) * 0.18
        g.lineStyle(1.5, 0xffd700, pulse)
        g.strokeCircle(h.worldX, h.worldY, h.collisionRadius + 3)
      }

      const rad = { x: Math.cos(h.angle), y: Math.sin(h.angle) }
      const tan = tangentUnit(rad, true)
      const sx = CENTRE.x + rad.x * PLANET_RADIUS
      const sy = CENTRE.y + rad.y * PLANET_RADIUS

      if (h.width > 40) {
        // ── Dormant volcano ──────────────────────────────────────────────
        // Base half-width scales with h.width; sink base 8px into planet so it always overlaps surface
        const hb = h.width * 0.85
        const ht = h.width * 0.18
        const sink = 8  // pixels below surface to guarantee overlap
        const bx = sx - rad.x * sink
        const by = sy - rad.y * sink
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
        g.moveTo(bx  - tan.x * hb,        by  - tan.y * hb)
        g.lineTo(topX - tan.x * ht,       topY - tan.y * ht)
        g.lineTo(topX + tan.x * ht,       topY + tan.y * ht)
        g.lineTo(bx  + tan.x * hb,        by  + tan.y * hb)
        g.closePath()
        g.fillPath()

        // Lava streaks down the flanks for active/simmering
        if (h.volcanoState !== 'dormant') {
          const streaks = h.volcanoState === 'active' ? 3 : 1
          for (let s = 0; s < streaks; s++) {
            const t = 0.2 + s * 0.3
            const lx1 = topX + tan.x * ht * (t - 0.1)
            const ly1 = topY + tan.y * ht * (t - 0.1)
            const lx2 = bx   + tan.x * hb * (t + 0.15)
            const ly2 = by   + tan.y * hb * (t + 0.15)
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
        g.moveTo(bx,                       by)
        g.lineTo(bx  + tan.x * hb,        by  + tan.y * hb)
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

  /** Pixel inhabitants standing on a host world (`centre`, `radius`); gold-rimmed once edible. */
  private renderGods(g: Phaser.GameObjects.Graphics, list: God[], centre: Vec2, radius: number, nowMs: number): void {
    const canEat = this.bodyHeadWidth() / 2 >= GOD_EAT_HEAD_RADIUS
    for (const god of list) {
      const rad = { x: Math.cos(god.angle), y: Math.sin(god.angle) }
      const tan = { x: -Math.sin(god.angle), y: Math.cos(god.angle) }
      const baseAlt = GOD_STAND_HEIGHT + god.altitude
      const bx = centre.x + rad.x * (radius + baseAlt)
      const by = centre.y + rad.y * (radius + baseAlt)
      // Local frame: dx along the surface (tangent), dy up from it (radial)
      const up = (dx: number, dy: number) => ({ x: bx + tan.x * dx + rad.x * dy, y: by + tan.y * dx + rad.y * dy })

      // Eatable marker
      if (canEat) {
        const pulse = 0.4 + Math.sin(nowMs * 0.006 + god.id) * 0.2
        g.lineStyle(1.5, 0xffd700, pulse)
        g.strokeCircle(bx, by, GOD_COLLISION_RADIUS + 3)
      }

      const robe = god.type === 'thor' ? 0x9a3b2e
        : god.type === 'lightning' ? 0x3355aa
        : god.type === 'martian' ? 0x3aa33a
        : 0x2e7d46
      const skin = god.type === 'martian' ? 0x8fe08f : 0xe8c9a0
      // Figure scale keyed to collision size, so bigger inhabitants stay proportioned
      const S = GOD_COLLISION_RADIUS / 12
      const u = (dx: number, dy: number) => up(dx * S, dy * S)

      // Legs
      g.lineStyle(3 * S, this.darken(robe, 0.3), 1)
      const legT = u(0, 2)
      g.beginPath(); g.moveTo(legT.x, legT.y); g.lineTo(u(-3, -6).x, u(-3, -6).y); g.strokePath()
      g.beginPath(); g.moveTo(legT.x, legT.y); g.lineTo(u(3, -6).x, u(3, -6).y); g.strokePath()

      // Torso — a trapezoid along the radial
      const shoulder = u(0, 15), hipL = u(-4, 2), hipR = u(4, 2)
      const shL = u(-4, 14), shR = u(4, 14)
      g.fillStyle(robe)
      g.beginPath()
      g.moveTo(shL.x, shL.y); g.lineTo(shR.x, shR.y); g.lineTo(hipR.x, hipR.y); g.lineTo(hipL.x, hipL.y)
      g.closePath(); g.fillPath()
      // Head
      g.fillStyle(skin)
      g.fillCircle(shoulder.x, shoulder.y, 4 * S)
      // Simple helm/hair shadow
      g.fillStyle(this.darken(robe, 0.2))
      g.fillCircle(shoulder.x + rad.x * 2 * S, shoulder.y + rad.y * 2 * S, 4.2 * S)
      g.fillStyle(skin)
      g.fillCircle(shoulder.x, shoulder.y, 3.6 * S)

      if (god.type === 'thor') {
        // Mjölnir raised in hand (unless it's in flight)
        const inFlight = this.godProjectiles.some(p => p.kind === 'hammer' && p.ownerId === god.id)
        if (!inFlight) {
          const hand = u(8, 17)
          g.lineStyle(2.5 * S, 0x6b4a2a, 1)
          g.beginPath(); g.moveTo(shR.x, shR.y); g.lineTo(hand.x, hand.y); g.strokePath()
          g.fillStyle(0x9aa0a8)
          const hw = 5 * S, hh = 3.5 * S
          g.fillRect(hand.x - hw, hand.y - hh, hw * 2, hh * 2)
          g.fillStyle(0xc8ccd2, 0.6)
          g.fillRect(hand.x - hw, hand.y - hh, hw * 2, hh * 0.6)
        }
      } else if (god.type === 'lightning') {
        // Glowing staff
        const tip = u(6, 22), grip = u(5, 3)
        g.lineStyle(2 * S, 0xcaa15a, 1)
        g.beginPath(); g.moveTo(grip.x, grip.y); g.lineTo(tip.x, tip.y); g.strokePath()
        const glow = 0.5 + Math.sin(nowMs * 0.01 + god.id) * 0.3
        g.fillStyle(0x88ddff, glow * 0.4)
        g.fillCircle(tip.x, tip.y, 8 * S)
        g.fillStyle(0xccf0ff, glow)
        g.fillCircle(tip.x, tip.y, 4 * S)
      } else if (god.type === 'martian') {
        // Two antennae with glowing bulbs
        const glow = 0.5 + Math.sin(nowMs * 0.012 + god.id) * 0.4
        for (const s of [-1, 1]) {
          const bulb = u(s * 3, 22)
          g.lineStyle(1.5 * S, 0x2f7a2f, 1)
          g.beginPath(); g.moveTo(shoulder.x, shoulder.y); g.lineTo(bulb.x, bulb.y); g.strokePath()
          g.fillStyle(0xff5544, glow)
          g.fillCircle(bulb.x, bulb.y, 2.2 * S)
        }
        // Ray gun in hand
        const muzzle = u(9, 15)
        g.lineStyle(2.5 * S, 0x556, 1)
        g.beginPath(); g.moveTo(shR.x, shR.y); g.lineTo(muzzle.x, muzzle.y); g.strokePath()
        g.fillStyle(0x9dff6a, glow * 0.5)
        g.fillCircle(muzzle.x, muzzle.y, 3.5 * S)
      } else {
        // Jumper — a spring-line under it when airborne
        if (god.altitude > 4) {
          g.lineStyle(1.5 * S, 0x66ff99, 0.4)
          g.beginPath(); g.moveTo(hipL.x, hipL.y); g.lineTo(bx - rad.x * god.altitude, by - rad.y * god.altitude); g.strokePath()
        }
      }
    }
  }

  /** The ISS on its orbit — a little truss with solar panels, banking along its path. */
  private renderIss(g: Phaser.GameObjects.Graphics, nowMs: number): void {
    if (!this.issAlive) return
    const p = this.issWorldPos()
    // Orbit tangent = facing direction
    const fa = this.issAngle + Math.PI / 2
    const fx = Math.cos(fa), fy = Math.sin(fa)
    const nx = -fy, ny = fx
    const S = ISS_RADIUS / 11

    // Faint orbit hint
    g.lineStyle(1, 0x88ccff, 0.12)
    g.strokeCircle(CENTRE.x, CENTRE.y, PLANET_RADIUS + ISS_ALTITUDE)

    // Truss
    g.lineStyle(2.5 * S, 0xcfd4da, 1)
    g.beginPath(); g.moveTo(p.x - fx * 10 * S, p.y - fy * 10 * S); g.lineTo(p.x + fx * 10 * S, p.y + fy * 10 * S); g.strokePath()
    // Core module
    g.fillStyle(0xe8ecf0)
    g.fillCircle(p.x, p.y, 3.5 * S)
    // Solar panels — two dark-blue wings on the cross axis
    g.fillStyle(0x2a3f7a)
    for (const s of [1, -1]) {
      const cx = p.x + nx * s * 9 * S, cy = p.y + ny * s * 9 * S
      g.fillRect(cx - 6 * S, cy - 3 * S, 12 * S, 6 * S)
    }
    g.fillStyle(0x5a7fd0, 0.5)
    for (const s of [1, -1]) {
      const cx = p.x + nx * s * 9 * S, cy = p.y + ny * s * 9 * S
      g.fillRect(cx - 6 * S, cy - 3 * S, 12 * S, 1.5 * S)
    }
    // Blinking beacon
    if (Math.sin(nowMs * 0.006) > 0.6) { g.fillStyle(0xff5555, 0.9); g.fillCircle(p.x + fx * 10 * S, p.y + fy * 10 * S, 1.6 * S) }
  }

  private renderUfos(g: Phaser.GameObjects.Graphics, nowMs: number): void {
    for (const u of this.ufos) {
      const bob = Math.sin(nowMs * 0.005 + u.phase) * 2
      const cx = u.x, cy = u.y + bob
      const S = UFO_RADIUS / 10
      // Glow
      g.fillStyle(0x66ffcc, 0.12)
      g.fillCircle(cx, cy, 14 * S)
      // Saucer body
      g.fillStyle(0x8892a0)
      g.fillEllipse(cx, cy, 22 * S, 8 * S)
      g.fillStyle(0xb8c0cc)
      g.fillEllipse(cx, cy - 1 * S, 22 * S, 4 * S)
      // Dome
      g.fillStyle(0x9fe8ff, 0.9)
      g.fillCircle(cx, cy - 3 * S, 5 * S)
      // Under-lights
      for (let i = -1; i <= 1; i++) {
        const on = Math.sin(nowMs * 0.012 + i + u.phase) > 0
        g.fillStyle(on ? 0xffe066 : 0x556, on ? 0.95 : 0.5)
        g.fillCircle(cx + i * 7 * S, cy + 4 * S, 1.6 * S)
      }
    }
  }

  private renderGodProjectiles(g: Phaser.GameObjects.Graphics, list: GodProjectile[]): void {
    for (const p of list) {
      if (p.kind === 'hammer') {
        // Spinning Mjölnir with a motion glow
        const c = Math.cos(p.spin), s = Math.sin(p.spin)
        g.fillStyle(0xaab0b8, 0.25)
        g.fillCircle(p.x, p.y, HAMMER_RADIUS + 4)
        // Handle
        g.lineStyle(2.5, 0x6b4a2a, 1)
        g.beginPath(); g.moveTo(p.x - c * 9, p.y - s * 9); g.lineTo(p.x + c * 3, p.y + s * 3); g.strokePath()
        // Head block (rotated)
        const hw = HAMMER_RADIUS, hh = HAMMER_RADIUS * 0.7
        const corner = (dx: number, dy: number) => ({ x: p.x + c * dx - s * dy, y: p.y + s * dx + c * dy })
        const a = corner(3, -hh), b = corner(3 + hw, -hh), d = corner(3 + hw, hh), e = corner(3, hh)
        g.fillStyle(0x9aa0a8)
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(d.x, d.y); g.lineTo(e.x, e.y)
        g.closePath(); g.fillPath()
      } else {
        // Lightning bolt — jagged segment along velocity
        const sp = Math.hypot(p.vx, p.vy) || 1
        const dx = p.vx / sp, dy = p.vy / sp
        const nx = -dy, ny = dx
        const len = 16
        g.lineStyle(2, 0x88ddff, 0.9)
        g.beginPath()
        g.moveTo(p.x - dx * len, p.y - dy * len)
        g.lineTo(p.x - dx * len * 0.4 + nx * 4, p.y - dy * len * 0.4 + ny * 4)
        g.lineTo(p.x + dx * len * 0.2 - nx * 4, p.y + dy * len * 0.2 - ny * 4)
        g.lineTo(p.x + dx * len, p.y + dy * len)
        g.strokePath()
        g.fillStyle(0xccf0ff, 0.9)
        g.fillCircle(p.x + dx * len, p.y + dy * len, BOLT_RADIUS * 0.6)
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
        ? (light ? 0x7fffd4 : COL_BODY)
        : (light ? 0x40e0d0 : COL_BODY_DARK)
      g.fillStyle(col)
      g.beginPath()
      g.moveTo(lx[i],     ly[i])
      g.lineTo(rx[i],     ry[i])
      g.lineTo(rx[i + 1], ry[i + 1])
      g.lineTo(lx[i + 1], ly[i + 1])
      g.closePath()
      g.fillPath()

      // Small scale highlight in the middle of each band
      if (i % 3 === 1) {
        const w = lerp(headWidth / 2, tailWidth / 2, t)
        g.fillStyle(0xffffff, 0.12)
        g.fillCircle(samples[i].x, samples[i].y, w * 0.5)
      }
    }

    // Scale divider lines
    for (let i = 3; i < total - 1; i += 3) {
      const alpha = lerp(0.45, 0.08, i / (total - 1))
      g.lineStyle(1, 0x004d4d, alpha)
      g.beginPath()
      g.moveTo(lx[i], ly[i])
      g.lineTo(rx[i], ry[i])
      g.strokePath()
    }

    // Tail round cap
    g.fillStyle(COL_BODY_DARK)
    g.fillCircle(samples[total - 1].x, samples[total - 1].y, tailWidth / 2)

    // Edge outlines
    g.lineStyle(1, 0x004d4d, 0.6)
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

    g.lineStyle(1.5, 0x00ced1, 1)
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
