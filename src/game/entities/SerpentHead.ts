import type { Vec2 } from '../types'
import { orbitPoint, tangentUnit, radialUnit } from '../utils/math'
import { PLANET_RADIUS, SPAWN_ALTITUDE, SPAWN_INITIAL_SPEED } from '../config'

export class SerpentHead {
  position: Vec2
  velocity: Vec2

  constructor(private centre: Vec2) {
    const spawnState = SerpentHead.spawnState(centre)
    this.position = spawnState.position
    this.velocity = spawnState.velocity
  }

  private static spawnState(centre: Vec2): { position: Vec2; velocity: Vec2 } {
    // Spawn at bottom of planet (angle PI/2 in screen coords = below centre)
    const angle = Math.PI / 2
    const position = orbitPoint(centre, PLANET_RADIUS, angle, SPAWN_ALTITUDE)

    // Initial velocity: clockwise tangential
    const radial = radialUnit(position, centre)
    const cwTangent = tangentUnit(radial, true)
    const velocity: Vec2 = { x: cwTangent.x * SPAWN_INITIAL_SPEED, y: cwTangent.y * SPAWN_INITIAL_SPEED }

    return { position, velocity }
  }

  reset(): void {
    const state = SerpentHead.spawnState(this.centre)
    this.position = state.position
    this.velocity = state.velocity
  }
}
