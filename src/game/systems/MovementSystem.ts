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

const CENTRE = { x: 0, y: 0 }

export function updateMovement(head: SerpentHead, input: InputState, dtSec: number): void {
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
  const thrustFactor = alt > PLAYABLE_ALT_MAX ? THIN_ATMOSPHERE_THRUST_FACTOR : 1.0

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
  // Project velocity onto tangent plane; nudge if too slow
  const cwTang = tangentUnit(radial, true)
  const tangentialSpeed = dot(vel, cwTang)
  const absSpeed = Math.abs(tangentialSpeed)
  if (absSpeed < MIN_TANGENTIAL_SPEED) {
    // Nudge in whichever tangential direction the serpent is already moving
    const sign = tangentialSpeed >= 0 ? 1 : -1
    const deficit = (MIN_TANGENTIAL_SPEED - absSpeed)
    vel.x += cwTang.x * sign * deficit
    vel.y += cwTang.y * sign * deficit
  }

  // --- Speed cap ---
  const spd = length(vel)
  if (spd > MAX_SPEED) {
    const n = normalize(vel)
    vel.x = n.x * MAX_SPEED
    vel.y = n.y * MAX_SPEED
  }

  // --- Integrate ---
  pos.x += vel.x * dtSec
  pos.y += vel.y * dtSec
}
