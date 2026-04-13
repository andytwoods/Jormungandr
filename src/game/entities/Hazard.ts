import type { HazardItem, VolcanoState } from '../types'
import { orbitPoint } from '../utils/math'
import type { Vec2 } from '../types'

/** Pre-compute the world-space bounding circle centre and radius for quick collision */
export interface HazardRuntime extends HazardItem {
  worldX: number
  worldY: number
  collisionRadius: number
  volcanoState: VolcanoState   // only meaningful when width > 40
  nextEruptionMs: number
}

export function buildHazardRuntime(h: HazardItem, centre: Vec2, planetRadius: number): HazardRuntime {
  const midAlt = h.altitude
  const pos = orbitPoint(centre, planetRadius, h.angle, midAlt)
  const collisionRadius = Math.max(h.width, h.height) * 0.5

  // Assign volcano state based on angle — gives stable, varied distribution
  let volcanoState: VolcanoState = 'dormant'
  if (h.width > 40) {
    const v = Math.sin(h.angle * 7.3 + 1.2)
    if (v > 0.4)       volcanoState = 'active'
    else if (v > -0.2) volcanoState = 'simmering'
    else               volcanoState = 'dormant'
  }

  return {
    ...h,
    worldX: pos.x,
    worldY: pos.y,
    collisionRadius,
    volcanoState,
    nextEruptionMs: 1000 + Math.random() * 3000,
  }
}
