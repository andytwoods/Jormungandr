export interface Vec2 {
  x: number
  y: number
}

export interface InputState {
  upHeld: boolean
}

export interface BodySample {
  x: number
  y: number
}

export type GameState = 'PLAYING' | 'DEAD' | 'WON'

/** A gravitating, solid celestial body. Registry lives in config.ts. */
export interface CelestialBody {
  id: string
  x: number
  y: number
  radius: number          // surface radius, world units
  surfaceGravity: number  // units/s² at the surface
  unlockScore: number     // gravity is inert below this score; the surface is always solid
  color?: number          // base surface colour for the generic renderer (earth/moon draw bespoke)
  name?: string           // display label; defaults to id
}

export interface GrowthEntry {
  samplesRemaining: number
  triggerTime: number  // ms timestamp when growth resolves
}

export interface FoodItem {
  x: number
  y: number
  id: number
  spawnTime: number
  foodType: string
  radius: number
  nutrition: number
}

export interface HazardItem {
  // Centre of hazard at surface
  angle: number     // radians around planet
  altitude: number  // midpoint altitude above surface
  width: number     // world units
  height: number    // world units (radial extent)
}

export type GodType = 'thor' | 'lightning' | 'jumper' | 'martian'

/** A god patrolling a planet's surface, attacking the serpent until it outgrows them. */
export interface God {
  id: number
  type: GodType
  angle: number          // position around the planet, radians
  homeAngle: number      // centre of its patrol arc
  walkDir: 1 | -1
  altitude: number       // 0 when grounded; >0 mid-leap (jumpers)
  vAlt: number           // radial velocity while airborne
  nextAttackMs: number
}

export type GodProjectileKind = 'hammer' | 'bolt'

/** Mjölnir in flight, or a lightning bolt. */
export interface GodProjectile {
  kind: GodProjectileKind
  x: number
  y: number
  vx: number
  vy: number
  originX: number        // throw point — for measuring hammer out-distance
  originY: number
  ownerId: number        // god who threw it (hammer boomerangs back to them)
  phase: 'out' | 'back'  // hammer only
  spawnMs: number
  spin: number           // accumulated rotation for rendering
}

/** A UFO drifting across space — harmless, eatable flavour. */
export interface Ufo {
  x: number
  y: number
  vx: number
  vy: number
  spawnMs: number
  phase: number   // seeds the bobbing wobble
}

export type VolcanoState = 'dormant' | 'simmering' | 'active'

export interface LavaBlob {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  spawnMs: number
}
