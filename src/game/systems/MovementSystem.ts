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
}

const CENTRE = { x: 0, y: 0 }

export function baseMovementStats(): MovementStats {
  return {
    maxSpeed: MAX_SPEED,
    minTangentialSpeed: MIN_TANGENTIAL_SPEED,
    playableAltMax: PLAYABLE_ALT_MAX,
  }
}

export function updateMovement(head: SerpentHead, input: InputState, dtSec: number, stats: MovementStats): void {
  const { upHeld } = input
  const pos = head.position
  const vel = head.velocity

  // Radial outward unit vector
  const radial = radialUnit(pos, CENTRE)

  // --- Gravity (toward centre) ---
  vel.x += -radial.x * GRAVITY * dtSec
  vel.y += -radial.y * GRAVITY * dtSec

  // --- Thrust ---
  const alt = altitude(pos, CENTRE, PLANET_RADIUS)
  const thrustFactor = alt > stats.playableAltMax ? THIN_ATMOSPHERE_THRUST_FACTOR : 1.0

  if (upHeld) {
    // Space: pure radial outward
    vel.x += radial.x * THRUST_RADIAL * thrustFactor * dtSec
    vel.y += radial.y * THRUST_RADIAL * thrustFactor * dtSec
  }

  // --- Damping ---
  const dampFactor = 1 - DAMPING * dtSec
  vel.x *= dampFactor
  vel.y *= dampFactor

  // --- Minimum tangential speed floor ---
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
