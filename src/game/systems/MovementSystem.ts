import type { SerpentHead } from '../entities/SerpentHead'
import type { InputState } from '../types'
import {
  radialUnit, tangentUnit, length, normalize,
  dot, altitude
} from '../utils/math'
import {
  GRAVITY, THRUST_RADIAL,
  DAMPING, MAX_SPEED, MIN_TANGENTIAL_SPEED,
  PLANET_RADIUS, PLAYABLE_ALT_MAX, THIN_ATMOSPHERE_THRUST_FACTOR,
  MOON_X, MOON_Y, MOON_RADIUS, MOON_GRAVITY, MOON_SOI
} from '../config'

export interface MovementStats {
  maxSpeed: number
  minTangentialSpeed: number
  playableAltMax: number
  // Active gravity body — set to moon when inside lunar SOI
  activeCentre: { x: number; y: number }
  activeSurfaceRadius: number
  activeGravity: number // This is for thrust calculation
  effectiveEarthGravity: number // New field for actual Earth gravity application
}

export function baseMovementStats(): MovementStats {
  return {
    maxSpeed: MAX_SPEED,
    minTangentialSpeed: MIN_TANGENTIAL_SPEED,
    playableAltMax: PLAYABLE_ALT_MAX,
    activeCentre: { x: 0, y: 0 },
    activeSurfaceRadius: PLANET_RADIUS,
    activeGravity: GRAVITY, // Default thrust gravity
    effectiveEarthGravity: GRAVITY, // Default actual Earth gravity
  }
}

export function updateMovement(head: SerpentHead, input: InputState, dtSec: number, stats: MovementStats): void {
  const { upHeld } = input
  const pos = head.position
  const vel = head.velocity

  // --- Multi-body Gravity ---

  // Moon gravity (inverse square) — computed first so we can blend Earth gravity
  const moonPos = { x: MOON_X, y: MOON_Y };
  const vecToMoonX = moonPos.x - pos.x;
  const vecToMoonY = moonPos.y - pos.y;
  const distToMoonCenterSq = vecToMoonX * vecToMoonX + vecToMoonY * vecToMoonY;
  let moonInfluence = 0; // 0 = outside SOI, 1 = deep inside SOI
  if (distToMoonCenterSq > 1) {
    const distToMoonCenter = Math.sqrt(distToMoonCenterSq);
    const gravityMagnitudeMoon = MOON_GRAVITY * (MOON_RADIUS * MOON_RADIUS) / distToMoonCenterSq;
    const radialMoonX = vecToMoonX / distToMoonCenter;
    const radialMoonY = vecToMoonY / distToMoonCenter;
    vel.x += radialMoonX * gravityMagnitudeMoon * dtSec;
    vel.y += radialMoonY * gravityMagnitudeMoon * dtSec;
    // Blend factor: 0 at SOI edge, 1 at moon surface
    if (distToMoonCenter < MOON_SOI) {
      moonInfluence = Math.max(0, 1 - (distToMoonCenter - MOON_RADIUS) / (MOON_SOI - MOON_RADIUS));
    }
  }

  // Earth gravity — reduced smoothly as moon influence increases
  const earthGravityScale = 1 - moonInfluence;
  const radialEarth = radialUnit(pos, { x: 0, y: 0 });
  vel.x -= radialEarth.x * stats.effectiveEarthGravity * earthGravityScale * dtSec;
  vel.y -= radialEarth.y * stats.effectiveEarthGravity * earthGravityScale * dtSec;


  const centre = stats.activeCentre

  // Radial outward unit vector relative to active body (for thrust and other mechanics)
  const radial = radialUnit(pos, centre)

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
