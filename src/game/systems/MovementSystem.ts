import type { SerpentHead } from '../entities/SerpentHead'
import type { CelestialBody, InputState } from '../types'
import {
  radialUnit, tangentUnit, length, normalize, dot
} from '../utils/math'
import {
  netGravity, dominantBody, minAltitude, surfaceOrbitSpeed, REFERENCE_ORBIT_SPEED
} from './GravitySystem'
import {
  THRUST_RADIAL, DAMPING, MAX_SPEED, MIN_TANGENTIAL_SPEED,
  PLAYABLE_ALT_MAX, THIN_ATMOSPHERE_THRUST_FACTOR, TANGENTIAL_ASSIST_ACCEL,
  ATMOSPHERE_SCALE_HEIGHT, ASSIST_FADE_GRAVITY
} from '../config'

export interface MovementStats {
  maxSpeed: number
  minTangentialSpeed: number
  playableAltMax: number
}

export function baseMovementStats(): MovementStats {
  return {
    maxSpeed: MAX_SPEED,
    minTangentialSpeed: MIN_TANGENTIAL_SPEED,
    playableAltMax: PLAYABLE_ALT_MAX,
  }
}

export function updateMovement(
  head: SerpentHead,
  input: InputState,
  dtSec: number,
  stats: MovementStats,
  bodies: readonly CelestialBody[],
): void {
  const { upHeld } = input
  const pos = head.position
  const vel = head.velocity

  // --- Gravity: every body, summed. No blending, no special cases. ---
  const g = netGravity(pos, bodies)
  vel.x += g.x * dtSec
  vel.y += g.y * dtSec

  // --- Thrust ---
  // "Up" is away from whatever is pulling you, so it rotates smoothly as one body
  // hands over to another instead of flipping. Where the field cancels there is no
  // "down", so fall back to the dominant body's radial.
  const dom = dominantBody(pos, bodies)
  const gLen = length(g)
  const up = gLen > 1e-4 ? { x: -g.x / gLen, y: -g.y / gLen } : radialUnit(pos, dom)

  // Thrust needs air. Above the nearest body's ceiling it drops to a fraction and then
  // decays away entirely, so no amount of held thrust escapes to deep space. Approach
  // another body and its atmosphere gives you back your engine.
  const excessAlt = minAltitude(pos, bodies) - stats.playableAltMax
  const thrustFactor = excessAlt <= 0
    ? 1.0
    : THIN_ATMOSPHERE_THRUST_FACTOR * Math.exp(-excessAlt / ATMOSPHERE_SCALE_HEIGHT)

  if (upHeld) {
    vel.x += up.x * THRUST_RADIAL * thrustFactor * dtSec
    vel.y += up.y * THRUST_RADIAL * thrustFactor * dtSec
  }

  // --- Damping ---
  const dampFactor = 1 - DAMPING * dtSec
  vel.x *= dampFactor
  vel.y *= dampFactor

  // --- Orbital speed floor, around the dominant body ---
  // Scaled to that body: the moon is smaller and weaker, so orbiting it should be
  // slower than orbiting Earth. Applied as an acceleration and capped at the
  // remaining deficit — as a direct velocity injection it would teleport the serpent
  // sideways on the frame the dominant body (and so "tangential") changed.
  // It also fades where the field is weak — at the point between two bodies where
  // gravity cancels there is no orbit to hold, and a full-strength floor would just
  // spin you as the tangent frame swaps over.
  const radial = radialUnit(pos, dom)
  const cwTang = tangentUnit(radial, true)
  const authority = Math.min(1, gLen / ASSIST_FADE_GRAVITY)
  const floor = stats.minTangentialSpeed * (surfaceOrbitSpeed(dom) / REFERENCE_ORBIT_SPEED)
  const tangentialSpeed = dot(vel, cwTang)
  const deficit = floor - Math.abs(tangentialSpeed)
  if (deficit > 0 && authority > 0) {
    const sign = tangentialSpeed >= 0 ? 1 : -1
    const dv = Math.min(deficit, TANGENTIAL_ASSIST_ACCEL * authority * dtSec)
    vel.x += cwTang.x * sign * dv
    vel.y += cwTang.y * sign * dv
  }

  // --- Speed cap ---
  const spd = length(vel)
  if (spd > stats.maxSpeed) {
    const n = normalize(vel)
    vel.x = n.x * stats.maxSpeed
    vel.y = n.y * stats.maxSpeed
  }

  // --- Integrate ---
  pos.x += vel.x * dtSec
  pos.y += vel.y * dtSec
}
