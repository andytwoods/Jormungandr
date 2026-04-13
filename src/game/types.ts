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

export interface GrowthEntry {
  samplesRemaining: number
  triggerTime: number  // ms timestamp when growth resolves
}

export interface FoodItem {
  x: number
  y: number
  id: number
}

export interface HazardItem {
  // Centre of hazard at surface
  angle: number     // radians around planet
  altitude: number  // midpoint altitude above surface
  width: number     // world units
  height: number    // world units (radial extent)
}
