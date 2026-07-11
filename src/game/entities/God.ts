import type { God, GodProjectile, GodType, Vec2 } from '../types'
import { orbitPoint, angleFromCentre, altitude as altOf } from '../utils/math'
import {
  GOD_WALK_SPEED, GOD_PATROL_HALF_ARC, GOD_ATTACK_RANGE_DEG, GOD_ATTACK_ALT_MAX,
  GOD_ATTACK_INTERVAL_MS, GOD_STAND_HEIGHT, GOD_JUMP_SPEED,
  HAMMER_SPEED, HAMMER_RANGE, BOLT_SPEED, BOLT_LIFE_MS, GOD_PROJECTILE_LIFE_MS,
  GRAVITY,
} from '../config'

const EARTH_GOD_TYPES: GodType[] = ['thor', 'lightning', 'jumper']

/**
 * Inhabitants scattered at random angles with random types — a different set each run.
 * `types` restricts which kinds spawn (Earth's pantheon vs Martians on Mars).
 */
export function spawnGods(count: number, startId: number, types: GodType[] = EARTH_GOD_TYPES): God[] {
  const gods: God[] = []
  for (let i = 0; i < count; i++) {
    const homeAngle = Math.random() * Math.PI * 2
    gods.push({
      id: startId + i,
      type: types[Math.floor(Math.random() * types.length)],
      angle: homeAngle,
      homeAngle,
      walkDir: Math.random() < 0.5 ? 1 : -1,
      altitude: 0,
      vAlt: 0,
      nextAttackMs: 1200 + Math.random() * 2500,
    })
  }
  return gods
}

/** World-space centre of an inhabitant's figure on its host body (accounts for a mid-leap altitude). */
export function godWorldPos(g: God, centre: Vec2, planetRadius: number): Vec2 {
  return orbitPoint(centre, planetRadius, g.angle, GOD_STAND_HEIGHT + g.altitude)
}

function shortestAngleRad(a: number, b: number): number {
  let d = ((b - a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  return d
}

/**
 * Patrol, leap physics, and attacks for a set of inhabitants on one host body (`centre`,
 * `planetRadius`). Mutates `gods` and pushes new projectiles. They only strike when the
 * serpent head is within their arc and flying low over *their* world — so Martians ignore
 * you while you're at Earth, and vice versa.
 */
export function updateGods(
  gods: God[],
  projectiles: GodProjectile[],
  head: Vec2,
  centre: Vec2,
  planetRadius: number,
  nowMs: number,
  dtSec: number,
): void {
  const headAngle = angleFromCentre(head, centre)
  const headAlt = altOf(head, centre, planetRadius)
  const rangeRad = (GOD_ATTACK_RANGE_DEG * Math.PI) / 180

  for (const g of gods) {
    // --- Patrol along the surface, turning back at the edge of the home arc ---
    if (g.altitude <= 0) {
      g.angle += g.walkDir * GOD_WALK_SPEED * dtSec
      if (shortestAngleRad(g.homeAngle, g.angle) > GOD_PATROL_HALF_ARC) g.walkDir = -1
      else if (shortestAngleRad(g.homeAngle, g.angle) < -GOD_PATROL_HALF_ARC) g.walkDir = 1
    }

    // --- Leap physics (jumpers) ---
    if (g.altitude > 0 || g.vAlt > 0) {
      g.altitude += g.vAlt * dtSec
      g.vAlt -= GRAVITY * dtSec
      if (g.altitude <= 0) { g.altitude = 0; g.vAlt = 0 }
    }

    // --- Attack when the serpent is overhead and low enough ---
    const inArc = Math.abs(shortestAngleRad(g.angle, headAngle)) < rangeRad
    const canReach = headAlt < GOD_ATTACK_ALT_MAX
    if (nowMs >= g.nextAttackMs && inArc && canReach && g.altitude <= 0) {
      g.nextAttackMs = nowMs + GOD_ATTACK_INTERVAL_MS + Math.random() * 1200
      const from = godWorldPos(g, centre, planetRadius)

      if (g.type === 'jumper') {
        g.vAlt = GOD_JUMP_SPEED
      } else {
        const dx = head.x - from.x, dy = head.y - from.y
        const d = Math.hypot(dx, dy) || 1
        // Thor throws the boomeranging hammer; lightning gods and Martians fire straight bolts
        const isHammer = g.type === 'thor'
        const speed = isHammer ? HAMMER_SPEED : BOLT_SPEED
        projectiles.push({
          kind: isHammer ? 'hammer' : 'bolt',
          x: from.x, y: from.y,
          vx: (dx / d) * speed, vy: (dy / d) * speed,
          originX: from.x, originY: from.y,
          ownerId: g.id,
          phase: 'out',
          spawnMs: nowMs,
          spin: 0,
        })
      }
    }
  }
}

/**
 * Move projectiles. Mjölnir flies out, then boomerangs home to its thrower (homing on the
 * thrower's live position). Bolts fly straight and die on the host surface or with age.
 */
export function updateGodProjectiles(
  projectiles: GodProjectile[],
  gods: God[],
  centre: Vec2,
  planetRadius: number,
  nowMs: number,
  dtSec: number,
): void {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]
    p.spin += dtSec * 18

    if (nowMs - p.spawnMs > GOD_PROJECTILE_LIFE_MS) { projectiles.splice(i, 1); continue }

    if (p.kind === 'hammer') {
      const owner = gods.find(g => g.id === p.ownerId)
      if (p.phase === 'out') {
        const travelled = Math.hypot(p.x - p.originX, p.y - p.originY)
        if (travelled > HAMMER_RANGE || !owner) p.phase = 'back'
      }
      if (p.phase === 'back') {
        // Home toward the thrower's current hand; if they're gone, fall to the surface
        const target = owner ? godWorldPos(owner, centre, planetRadius) : centre
        const dx = target.x - p.x, dy = target.y - p.y
        const d = Math.hypot(dx, dy) || 1
        p.vx = (dx / d) * HAMMER_SPEED
        p.vy = (dy / d) * HAMMER_SPEED
        if (owner && d < 22) { projectiles.splice(i, 1); continue }
      }
      p.x += p.vx * dtSec
      p.y += p.vy * dtSec
    } else {
      // Bolt — straight line, dies on the surface
      p.x += p.vx * dtSec
      p.y += p.vy * dtSec
      const distToCentre = Math.hypot(p.x - centre.x, p.y - centre.y)
      if (distToCentre < planetRadius || nowMs - p.spawnMs > BOLT_LIFE_MS) {
        projectiles.splice(i, 1)
      }
    }
  }
}
