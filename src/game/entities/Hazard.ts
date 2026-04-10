import type { HazardItem } from '../types'
import { orbitPoint } from '../utils/math'
import type { Vec2 } from '../types'

/** Pre-compute the world-space bounding circle centre and radius for quick collision */
export interface HazardRuntime extends HazardItem {
  worldX: number
  worldY: number
  collisionRadius: number
}

export function buildHazardRuntime(h: HazardItem, centre: Vec2, planetRadius: number): HazardRuntime {
  const midAlt = h.altitude
  const pos = orbitPoint(centre, planetRadius, h.angle, midAlt)
  // Bounding circle: encompass width and height
  const collisionRadius = Math.max(h.width, h.height) * 0.5
  return { ...h, worldX: pos.x, worldY: pos.y, collisionRadius }
}
