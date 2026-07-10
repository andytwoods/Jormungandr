import type { BodySample, CelestialBody } from '../types'
import { distance, circleOverlapsCapsule } from '../utils/math'
import {
  HEAD_COLLISION_RADIUS, SAFE_NECK_SAMPLES, SWALLOW_COILS, BURROW_COILS,
  SWALLOW_NUTRITION_PER_RADIUS
} from '../config'

// Body capsule radius = mid-body width / 2 (approximation)
const BODY_CAPSULE_RADIUS = 10

export type DeathCause = 'surface' | 'hazard' | 'self' | 'ceiling'

/** What the head ran into this frame. */
export type Contact =
  | { kind: 'death'; cause: DeathCause }
  | { kind: 'burrow'; body: CelestialBody }
  | { kind: 'swallow'; body: CelestialBody }

/** Body length needed to coil around `b` SWALLOW_COILS times — the price of eating a world whole. */
export function coilLengthRequired(b: CelestialBody): number {
  return 2 * Math.PI * b.radius * SWALLOW_COILS
}

/** Body length needed to start burrowing into `b` — the middle tier, well short of a whole gulp. */
export function burrowLengthRequired(b: CelestialBody): number {
  return 2 * Math.PI * b.radius * BURROW_COILS
}

/** How far along the serpent is toward swallowing `b` whole. 1 = ready. */
export function coilProgress(b: CelestialBody, serpentLength: number): number {
  return serpentLength / coilLengthRequired(b)
}

export function canSwallow(b: CelestialBody, serpentLength: number): boolean {
  return serpentLength >= coilLengthRequired(b)
}

export function canBurrow(b: CelestialBody, serpentLength: number): boolean {
  return serpentLength >= burrowLengthRequired(b)
}

/** Growth payload for devouring a world — proportional to how much world there was. */
export function swallowNutrition(b: CelestialBody): number {
  return Math.round(b.radius * SWALLOW_NUTRITION_PER_RADIUS)
}

/**
 * Head against celestial surfaces and against its own body. Hazards are handled by the
 * caller, which needs the hazard index to remove it.
 *
 * A surface that used to be certain death becomes a meal once the serpent outgrows it,
 * so this returns a Contact rather than a cause.
 */
export function checkHeadContact(
  headX: number,
  headY: number,
  bodySamples: BodySample[],
  bodies: readonly CelestialBody[],
  serpentLength: number
): Contact | null {
  const head = { x: headX, y: headY }

  // 1. Celestial surfaces. Three tiers by how long the serpent is:
  //    huge  → swallow the whole world in one gulp
  //    mid   → burrow into it (the caller carves + feeds; not lethal)
  //    small → the surface is still solid death
  for (const b of bodies) {
    if (distance(head, b) <= b.radius) {
      if (canSwallow(b, serpentLength)) return { kind: 'swallow', body: b }
      if (canBurrow(b, serpentLength))  return { kind: 'burrow', body: b }
      return { kind: 'death', cause: 'surface' }
    }
  }

  // 2. Self-collision (capsule check, skip safe neck zone)
  for (let i = SAFE_NECK_SAMPLES; i < bodySamples.length - 1; i++) {
    const a = bodySamples[i]
    const b = bodySamples[i + 1]
    if (circleOverlapsCapsule(head, HEAD_COLLISION_RADIUS, a, b, BODY_CAPSULE_RADIUS)) {
      return { kind: 'death', cause: 'self' }
    }
  }

  return null
}

/** Returns index of eaten food or -1 */
export function checkFoodCollection(
  headX: number,
  headY: number,
  foods: Array<{ x: number; y: number; radius: number }>
): number {
  const head = { x: headX, y: headY }
  for (let i = 0; i < foods.length; i++) {
    if (distance(head, foods[i]) < HEAD_COLLISION_RADIUS + foods[i].radius) {
      return i
    }
  }
  return -1
}
