import type { CelestialBody, Vec2 } from '../types'
import { distance } from '../utils/math'
import { GRAVITY, GRAVITY_FALLOFF_EXP, GRAVITY_FALLOFF_START_MULT, PLANET_RADIUS } from '../config'

/**
 * Pull of a single body at `dist` from its centre: flat at `surfaceGravity` close in,
 * decaying beyond `radius * GRAVITY_FALLOFF_START_MULT`. Clamping to the falloff start
 * also means the field never blows up at the centre.
 */
export function fieldMagnitude(b: CelestialBody, dist: number): number {
  const start = b.radius * GRAVITY_FALLOFF_START_MULT
  const r = Math.max(dist, start)
  return b.surfaceGravity * Math.pow(start / r, GRAVITY_FALLOFF_EXP)
}

/** Summed acceleration from every body. This is the only source of gravity in the game. */
export function netGravity(pos: Vec2, bodies: readonly CelestialBody[]): Vec2 {
  let ax = 0
  let ay = 0
  for (const b of bodies) {
    const dx = b.x - pos.x
    const dy = b.y - pos.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1e-6) continue
    const g = fieldMagnitude(b, dist)
    ax += (dx / dist) * g
    ay += (dy / dist) * g
  }
  return { x: ax, y: ay }
}

/**
 * The body pulling hardest at `pos`. Defines the tangent frame and the orbital
 * speed floor. The handover between bodies happens where their fields are equal,
 * which is also where the net field passes through zero.
 */
export function dominantBody(pos: Vec2, bodies: readonly CelestialBody[]): CelestialBody {
  let best = bodies[0]
  let bestG = -Infinity
  for (const b of bodies) {
    const g = fieldMagnitude(b, distance(pos, b))
    if (g > bestG) {
      bestG = g
      best = b
    }
  }
  return best
}

/**
 * Height above the nearest surface, over all bodies. Used for the thin-atmosphere
 * thrust cutoff: a min of continuous functions is continuous, so thrust efficiency
 * never steps when the dominant body changes.
 */
export function minAltitude(pos: Vec2, bodies: readonly CelestialBody[]): number {
  let lowest = Infinity
  for (const b of bodies) {
    const alt = distance(pos, b) - b.radius
    if (alt < lowest) lowest = alt
  }
  return lowest
}

/**
 * Speed of a circular orbit skimming this body's surface — its characteristic
 * orbital speed. Exact when GRAVITY_FALLOFF_EXP is 1; a good scale factor otherwise.
 */
export function surfaceOrbitSpeed(b: CelestialBody): number {
  return Math.sqrt(b.surfaceGravity * b.radius)
}

/** Earth's characteristic orbital speed — the reference the tuning constants are expressed in. */
export const REFERENCE_ORBIT_SPEED = Math.sqrt(GRAVITY * PLANET_RADIUS)

/**
 * Distance from `b`'s centre, measured toward its strongest rival, at which `b`
 * stops being the dominant body. Purely cosmetic — the physics has no such boundary —
 * but it is what the player is actually navigating toward, so it is worth drawing.
 */
export function dominanceRadius(b: CelestialBody, bodies: readonly CelestialBody[]): number {
  let rival: CelestialBody | null = null
  let bestG = -Infinity
  for (const o of bodies) {
    if (o === b) continue
    const g = fieldMagnitude(o, distance(b, o))
    if (g > bestG) {
      bestG = g
      rival = o
    }
  }
  if (!rival) return Infinity

  const sep = distance(b, rival)
  let lo = b.radius
  let hi = sep
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (fieldMagnitude(b, mid) > fieldMagnitude(rival, sep - mid)) lo = mid
    else hi = mid
  }
  return lo
}
