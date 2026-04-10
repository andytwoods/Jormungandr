import type { Vec2 } from '../types'

export function vec2(x: number, y: number): Vec2 { return { x, y } }

export function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y } }
export function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y } }
export function scale(v: Vec2, s: number): Vec2 { return { x: v.x * s, y: v.y * s } }
export function dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y }
export function lengthSq(v: Vec2): number { return v.x * v.x + v.y * v.y }
export function length(v: Vec2): number { return Math.sqrt(lengthSq(v)) }
export function normalize(v: Vec2): Vec2 {
  const len = length(v)
  return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 }
}
export function distanceSq(a: Vec2, b: Vec2): number { return lengthSq(sub(a, b)) }
export function distance(a: Vec2, b: Vec2): number { return Math.sqrt(distanceSq(a, b)) }
export function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Unit vector pointing from centre outward toward pos */
export function radialUnit(pos: Vec2, centre: Vec2): Vec2 {
  return normalize(sub(pos, centre))
}

/** Tangent unit vector perpendicular to radial. clockwise=true gives CW direction. */
export function tangentUnit(radial: Vec2, clockwise: boolean): Vec2 {
  // Rotate radial 90°: CCW = (-y, x), CW = (y, -x)
  return clockwise ? { x: radial.y, y: -radial.x } : { x: -radial.y, y: radial.x }
}

/** Altitude of pos above a circle of given radius centred at centre */
export function altitude(pos: Vec2, centre: Vec2, planetRadius: number): number {
  return distance(pos, centre) - planetRadius
}

/** Angle of pos relative to centre, in radians (0 = right, PI/2 = down in screen coords) */
export function angleFromCentre(pos: Vec2, centre: Vec2): number {
  return Math.atan2(pos.y - centre.y, pos.x - centre.x)
}

/** World position on planet surface at a given angle */
export function surfacePoint(centre: Vec2, planetRadius: number, angle: number): Vec2 {
  return { x: centre.x + Math.cos(angle) * planetRadius, y: centre.y + Math.sin(angle) * planetRadius }
}

/** World position at a given angle and altitude above the planet */
export function orbitPoint(centre: Vec2, planetRadius: number, angle: number, alt: number): Vec2 {
  const r = planetRadius + alt
  return { x: centre.x + Math.cos(angle) * r, y: centre.y + Math.sin(angle) * r }
}

/** Closest point on segment AB to point P */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a)
  const ap = sub(p, a)
  const lenSq = lengthSq(ab)
  if (lenSq === 0) return a
  const t = Math.max(0, Math.min(1, dot(ap, ab) / lenSq))
  return add(a, scale(ab, t))
}

/** True if circle (centre p, radius r1) overlaps capsule (segment A→B, radius r2) */
export function circleOverlapsCapsule(p: Vec2, r1: number, a: Vec2, b: Vec2, r2: number): boolean {
  const closest = closestPointOnSegment(p, a, b)
  return distanceSq(p, closest) < (r1 + r2) * (r1 + r2)
}

/** True if circle at p overlaps axis-aligned rect (cx, cy, hw, hh are half-extents) */
export function circleOverlapsRect(p: Vec2, r: number, cx: number, cy: number, hw: number, hh: number): boolean {
  const dx = Math.max(0, Math.abs(p.x - cx) - hw)
  const dy = Math.max(0, Math.abs(p.y - cy) - hh)
  return dx * dx + dy * dy < r * r
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function degToRad(deg: number): number { return deg * Math.PI / 180 }
export function radToDeg(rad: number): number { return rad * 180 / Math.PI }

/** Angular difference in degrees, normalised to [-180, 180] */
export function angleDiffDeg(a: number, b: number): number {
  let d = ((b - a) % 360 + 360) % 360
  if (d > 180) d -= 360
  return d
}
