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

export type GameState = 'PLAYING' | 'DEAD'

/** A gravitating, solid celestial body. Registry lives in config.ts. */
export interface CelestialBody {
  id: string
  x: number
  y: number
  radius: number          // surface radius, world units
  surfaceGravity: number  // units/s² at the surface
  unlockScore: number     // gravity is inert below this score; the surface is always solid
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

export type VolcanoState = 'dormant' | 'simmering' | 'active'

export interface LavaBlob {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  spawnMs: number
}
