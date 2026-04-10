import type { BodySample } from '../types'
import type { HazardRuntime } from '../entities/Hazard'
import { distance, altitude, circleOverlapsCapsule } from '../utils/math'
import {
  PLANET_RADIUS, HEAD_COLLISION_RADIUS, SAFE_NECK_SAMPLES,
  FOOD_RADIUS, ATMOSPHERE_HARD_CAP
} from '../config'

const CENTRE = { x: 0, y: 0 }
// Body capsule radius = mid-body width / 2 (approximation)
const BODY_CAPSULE_RADIUS = 10

export type DeathCause = 'surface' | 'hazard' | 'self' | 'ceiling'

/** Returns cause of death or null if alive */
export function checkDeath(
  headX: number,
  headY: number,
  bodySamples: BodySample[],
  hazards: HazardRuntime[]
): DeathCause | null {
  const head = { x: headX, y: headY }

  // 1. Planet surface
  const alt = altitude(head, CENTRE, PLANET_RADIUS)
  if (alt <= 0) return 'surface'

  // 2. Atmosphere hard cap (safety failsafe)
  if (alt > ATMOSPHERE_HARD_CAP) return 'ceiling'

  // 3. Hazards (bounding circle check)
  for (const h of hazards) {
    const hCentre = { x: h.worldX, y: h.worldY }
    if (distance(head, hCentre) < HEAD_COLLISION_RADIUS + h.collisionRadius) return 'hazard'
  }

  // 4. Self-collision (capsule check, skip safe neck zone)
  for (let i = SAFE_NECK_SAMPLES; i < bodySamples.length - 1; i++) {
    const a = bodySamples[i]
    const b = bodySamples[i + 1]
    if (circleOverlapsCapsule(head, HEAD_COLLISION_RADIUS, a, b, BODY_CAPSULE_RADIUS)) {
      return 'self'
    }
  }

  return null
}

/** Returns index of eaten food or -1 */
export function checkFoodCollection(
  headX: number,
  headY: number,
  foods: Array<{ x: number; y: number }>
): number {
  const head = { x: headX, y: headY }
  for (let i = 0; i < foods.length; i++) {
    if (distance(head, foods[i]) < HEAD_COLLISION_RADIUS + FOOD_RADIUS) {
      return i
    }
  }
  return -1
}
