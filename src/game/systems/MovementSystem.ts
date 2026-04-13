import type { SerpentHead } from '../entities/SerpentHead'
import type { InputState } from '../types'
import {
  radialUnit, tangentUnit, length, normalize,
  dot, altitude
} from '../utils/math'
import {
  GRAVITY, THRUST_RADIAL,
  DAMPING, MAX_SPEED, MIN_TANGENTIAL_SPEED,
  PLANET_RADIUS, PLAYABLE_ALT_MAX, THIN_ATMOSPHERE_THRUST_FACTOR
} from '../config'

export interface MovementStats {
  maxSpeed: number
  minTangentialSpeed: number
  playableAltMax: number
  // Active gravity body — set to moon when inside lunar SOI
  activeCentre: { x: number; y: number }
  activeSurfaceRadius: number
  activeGravity: number
}

export function baseMovementStats(): MovementStats {
  return {
    maxSpeed: MAX_SPEED,
    minTangentialSpeed: MIN_TANGENTIAL_SPEED,
    playableAltMax: PLAYABLE_ALT_MAX,
    activeCentre: { x: 0, y: 0 },
    activeSurfaceRadius: PLANET_RADIUS,
    activeGravity: GRAVITY,
  }
}

export function updateMovement(head: SerpentHead, input: InputState, dtSec: number, stats: MovementStats): void {
  const { upHeld } = input
  const pos = head.position
  const vel = head.velocity

  const centre = stats.activeCentre

  // Radial outward unit vector relative to active body
  const radial = radialUnit(pos, centre)

  // --- Gravity toward active body centre ---
  vel.x += -radial.x * stats.activeGravity * dtSec
  vel.y += -radial.y * stats.activeGravity * dtSec

  // --- Thrust (radial from active body) ---
  const alt = altitude(pos, centre, stats.activeSurfaceRadius)
  const thrustFactor = alt > stats.playableAltMax ? THIN_ATMOSPHERE_THRUST_FACTOR : 1.0

  if (upHeld) {
    vel.x += radial.x * THRUST_RADIAL * thrustFactor * dtSec
    vel.y += radial.y * THRUST_RADIAL * thrustFactor * dtSec
  }

  // --- Damping ---
  const dampFactor = 1 - DAMPING * dtSec
  vel.x *= dampFactor
  vel.y *= dampFactor

  // --- Minimum tangential speed floor (relative to active body) ---
  const cwTang = tangentUnit(radial, true)
  const tangentialSpeed = dot(vel, cwTang)
  const absSpeed = Math.abs(tangentialSpeed)
  if (absSpeed < stats.minTangentialSpeed) {
    const sign = tangentialSpeed >= 0 ? 1 : -1
    const deficit = (stats.minTangentialSpeed - absSpeed)
    vel.x += cwTang.x * sign * deficit
    vel.y += cwTang.y * sign * deficit
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
