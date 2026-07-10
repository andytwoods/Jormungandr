import type { God, GodProjectile, GodType, Vec2 } from '../types'
import { orbitPoint, angleFromCentre, altitude as altOf } from '../utils/math'
import {
  GOD_WALK_SPEED, GOD_PATROL_HALF_ARC, GOD_ATTACK_RANGE_DEG, GOD_ATTACK_ALT_MAX,
  GOD_ATTACK_INTERVAL_MS, GOD_STAND_HEIGHT, GOD_JUMP_SPEED,
  HAMMER_SPEED, HAMMER_RANGE, BOLT_SPEED, BOLT_LIFE_MS, GOD_PROJECTILE_LIFE_MS,
  GRAVITY, PLANET_RADIUS,
} from '../config'

const GOD_CYCLE: GodType[] = ['thor', 'lightning', 'jumper']

/** Even spread of gods around the equator, one of each type in turn. */
export function spawnGods(count: number, startId: number): God[] {
  const gods: God[] = []
  for (let i = 0; i < count; i++) {
    const homeAngle = (i / count) * Math.PI * 2 + 0.4
    gods.push({
      id: startId + i,
      type: GOD_CYCLE[i % GOD_CYCLE.length],
      angle: homeAngle,
      homeAngle,
      walkDir: i % 2 === 0 ? 1 : -1,
      altitude: 0,
      vAlt: 0,
      nextAttackMs: 1500 + i * 700,
    })
  }
  return gods
}

/** World-space centre of a god's figure (accounts for a mid-leap altitude). */
export function godWorldPos(g: God, centre: Vec2): Vec2 {
  return orbitPoint(centre, PLANET_RADIUS, g.angle, GOD_STAND_HEIGHT + g.altitude)
}

function shortestAngleRad(a: number, b: number): number {
  let d = ((b - a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  return d
}

/**
 * Patrol, leap physics, and attacks. Mutates `gods` and pushes new projectiles into
 * `projectiles`. Gods only strike when the serpent head is within their arc and flying low.
 */
export function updateGods(
  gods: God[],
  projectiles: GodProjectile[],
  head: Vec2,
  centre: Vec2,
  nowMs: number,
  dtSec: number,
): void {
  const headAngle = angleFromCentre(head, centre)
  const headAlt = altOf(head, centre, PLANET_RADIUS)
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
      const from = godWorldPos(g, centre)

      if (g.type === 'jumper') {
        g.vAlt = GOD_JUMP_SPEED
      } else {
        const dx = head.x - from.x, dy = head.y - from.y
        const d = Math.hypot(dx, dy) || 1
        const speed = g.type === 'thor' ? HAMMER_SPEED : BOLT_SPEED
        projectiles.push({
          kind: g.type === 'thor' ? 'hammer' : 'bolt',
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
 * god's live position). Bolts fly straight and die on the surface or with age. Returns the
 * indices to remove (spent projectiles), leaving collision to the caller.
 */
export function updateGodProjectiles(
  projectiles: GodProjectile[],
  gods: God[],
  centre: Vec2,
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
        const target = owner ? godWorldPos(owner, centre) : centre
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
      if (distToCentre < PLANET_RADIUS || nowMs - p.spawnMs > BOLT_LIFE_MS) {
        projectiles.splice(i, 1)
      }
    }
  }
}
