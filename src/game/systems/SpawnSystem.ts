import type { FoodItem, HazardItem, BodySample } from '../types'
import { createFood } from '../entities/Food'
import { orbitPoint, angleFromCentre, angleDiffDeg } from '../utils/math'
import {
  PLANET_RADIUS, SPAWN_SEGMENTS, FOOD_MAX_ALTITUDE, PLAYABLE_ALT_MIN,
  FOOD_SPAWN_EXCLUSION_DEG,
  HAZARD_ALT_MIN, HAZARD_ALT_MAX, HAZARD_WIDTH_MIN, HAZARD_WIDTH_MAX,
  HAZARD_MIN_SPACING_DEG, SPAWN_SAFE_ARC_DEG
} from '../config'

const CENTRE = { x: 0, y: 0 }
const SEG_SIZE_RAD = (Math.PI * 2) / SPAWN_SEGMENTS

function angleToBin(rad: number): number {
  const normalized = ((rad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  return Math.floor(normalized / SEG_SIZE_RAD) % SPAWN_SEGMENTS
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * Find a valid food spawn position using the 36-segment precomputation approach.
 * Returns null if no valid position found (very long serpent edge case).
 */
export function spawnFood(
  bodySamples: BodySample[],
  existingFood: FoodItem[],
  _headX: number,
  _headY: number,
  headAngle: number
): FoodItem | null {
  // Mark occupied segments from body
  const occupied = new Set<number>()
  for (const s of bodySamples) {
    const angle = angleFromCentre(s, CENTRE)
    occupied.add(angleToBin(angle))
  }

  // Mark segments too close to the head (reaction time buffer)
  for (let deg = -FOOD_SPAWN_EXCLUSION_DEG; deg <= FOOD_SPAWN_EXCLUSION_DEG; deg += 10) {
    const bin = angleToBin(headAngle + (deg * Math.PI / 180))
    occupied.add(bin)
  }

  // Mark segments occupied by existing food
  for (const f of existingFood) {
    const angle = angleFromCentre({ x: f.x, y: f.y }, CENTRE)
    occupied.add(angleToBin(angle))
  }

  // Collect free segments
  const freeSegments: number[] = []
  for (let i = 0; i < SPAWN_SEGMENTS; i++) {
    if (!occupied.has(i)) freeSegments.push(i)
  }

  if (freeSegments.length === 0) return null

  // Pick a random free segment and place food
  const seg = freeSegments[Math.floor(Math.random() * freeSegments.length)]
  const segAngle = (seg + Math.random()) * SEG_SIZE_RAD
  const alt = randomInRange(PLAYABLE_ALT_MIN, FOOD_MAX_ALTITUDE)
  const pos = orbitPoint(CENTRE, PLANET_RADIUS, segAngle, alt)

  return createFood(pos.x, pos.y)
}

/**
 * Generate initial hazard placement.
 * Returns HazardItem[] with at most `count` hazards respecting spacing rules.
 */
export function generateHazards(count: number, spawnAngle: number): HazardItem[] {
  const hazards: HazardItem[] = []
  const usedAngles: number[] = []
  let attempts = 0

  while (hazards.length < count && attempts < 200) {
    attempts++
    const angle = Math.random() * Math.PI * 2

    // Skip spawn corridor
    const diffFromSpawn = Math.abs(angleDiffDeg(
      spawnAngle * 180 / Math.PI,
      angle * 180 / Math.PI
    ))
    if (diffFromSpawn < SPAWN_SAFE_ARC_DEG) continue

    // Check spacing from existing hazards
    let tooClose = false
    for (const used of usedAngles) {
      const diff = Math.abs(angleDiffDeg(used * 180 / Math.PI, angle * 180 / Math.PI))
      if (diff < HAZARD_MIN_SPACING_DEG) { tooClose = true; break }
    }
    if (tooClose) continue

    usedAngles.push(angle)
    hazards.push({
      angle,
      altitude: randomInRange(HAZARD_ALT_MIN, HAZARD_ALT_MAX) * 0.5, // midpoint
      width: randomInRange(HAZARD_WIDTH_MIN, HAZARD_WIDTH_MAX),
      height: randomInRange(HAZARD_ALT_MIN, HAZARD_ALT_MAX),
    })
  }

  return hazards
}

/** Add one more hazard to the world (difficulty ramp) */
export function addHazard(existingHazards: HazardItem[], spawnAngle: number): HazardItem | null {
  const usedAngles = existingHazards.map(h => h.angle)
  let attempts = 0
  while (attempts < 100) {
    attempts++
    const angle = Math.random() * Math.PI * 2
    const diffFromSpawn = Math.abs(angleDiffDeg(spawnAngle * 180 / Math.PI, angle * 180 / Math.PI))
    if (diffFromSpawn < SPAWN_SAFE_ARC_DEG) continue

    let tooClose = false
    for (const used of usedAngles) {
      if (Math.abs(angleDiffDeg(used * 180 / Math.PI, angle * 180 / Math.PI)) < HAZARD_MIN_SPACING_DEG) {
        tooClose = true; break
      }
    }
    if (tooClose) continue

    return {
      angle,
      altitude: randomInRange(HAZARD_ALT_MIN, HAZARD_ALT_MAX) * 0.5,
      width: randomInRange(HAZARD_WIDTH_MIN, HAZARD_WIDTH_MAX),
      height: randomInRange(HAZARD_ALT_MIN, HAZARD_ALT_MAX),
    }
  }
  return null
}
