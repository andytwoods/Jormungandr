// All tunable values live here. Never use magic numbers in logic files.
// Values marked [TUNING] are the most likely to need adjustment in playtesting.

import type { CelestialBody } from './types'

// World
export const PLANET_RADIUS = 220
export const PLAYABLE_ALT_MIN = 40
export const PLAYABLE_ALT_MAX = 220      // above this: thin atmosphere zone
export const ATMOSPHERE_HARD_CAP = 300   // safety failsafe – should never trigger

// Serpent body
export const INITIAL_BODY_SAMPLES = 10
export const BODY_SAMPLE_SPACING = 12    // world units between body samples
export const BODY_WIDTH_HEAD = 18        // body width near head (world units)
export const BODY_WIDTH_TAIL = 10        // body width near tail
export const HEAD_COLLISION_RADIUS = 12
export const SAFE_NECK_SAMPLES = 8       // samples behind head exempt from self-collision
export const PATH_BUFFER_SIZE = 4096     // ring buffer – pre-allocated, never grows

// Growth
export const GROWTH_PER_FOOD = 8         // base body samples added per food eaten [TUNING]
export const GROWTH_DELAY_MS = 350       // ms delay between eating and tail extension [TUNING]

// Food types — weight is relative spawn probability
export const FOOD_TYPES = [
  { type: 'small'  as const, weight: 60, radius: 6,  nutrition: 1, color: 0xffd700 },
  { type: 'medium' as const, weight: 30, radius: 10, nutrition: 2, color: 0x44dd88 },
  { type: 'large'  as const, weight: 10, radius: 15, nutrition: 4, color: 0xaa66ff },
] satisfies Array<{ type: string; weight: number; radius: number; nutrition: number; color: number }>
export type FoodType = typeof FOOD_TYPES[number]['type']

// Physics [TUNING]
export const GRAVITY = 2000              // units/s² at Earth's surface
export const THRUST_DIAGONAL = 2025      // magnitude for left/right thrust (radial component ~1432 < gravity — you fall while steering)
export const THRUST_RADIAL = 3000         // magnitude for up thrust — less than gravity so you can only slow a fall, not rocket upward
export const THRUST_ANGLE_DEG = 45       // degrees from tangent toward radial — equal orbital/radial split
export const DAMPING = 0.15              // velocity multiplier loss per second (genuinely mild)
export const MAX_SPEED = 1000             // units/s speed cap
export const MIN_TANGENTIAL_SPEED = 500  // units/s floor — keeps orbital speed feeling fast
export const TANGENTIAL_ASSIST_ACCEL = 3000  // units/s² the orbital floor may apply — a force, never a velocity injection

// Gravity field shape [TUNING]. Below `radius * FALLOFF_START_MULT` a body pulls at a
// flat `surfaceGravity`; beyond it the pull decays as (start / r) ** EXP.
//
// The flat inner zone is what keeps the playable ceiling meaningful — it is the field
// the thrust and speed constants were tuned against. The decaying outer zone is what
// lets a smaller body locally out-pull a larger one, which is the whole point: it is
// what produces a handover instead of a hand-coded sphere of influence.
//
// EXP = 1 makes the outer potential logarithmic, so it is infinitely deep: no speed
// escapes, however large. EXP = 2 (true inverse-square) makes escape possible at
// sqrt(2 * GRAVITY * PLANET_RADIUS) ≈ 938 u/s, under MAX_SPEED. EXP = 0 disables
// falloff entirely and no body can ever dominate another.
export const GRAVITY_FALLOFF_EXP = 1
export const GRAVITY_FALLOFF_START_MULT = 2  // Earth: flat out to r = 440, i.e. exactly the base ceiling

// Thin atmosphere (above PLAYABLE_ALT_MAX of the *nearest* body)
export const THIN_ATMOSPHERE_THRUST_FACTOR = 0.15  // thrust efficiency just above the ceiling
export const ATMOSPHERE_SCALE_HEIGHT = 60   // thrust authority e-folds every this many units above the ceiling.
                                            // Without this decay, thrust eventually out-pulls a falloff-1 gravity
                                            // field and you can power away to infinity. It also means the only way
                                            // off Earth is through another body's atmosphere — fly to the moon.

// Orbital speed floor fades out where there is nothing to orbit (e.g. the point
// between two bodies where their fields cancel).
export const ASSIST_FADE_GRAVITY = 500     // field strength below which the floor loses authority

// Spawn
export const SPAWN_ALTITUDE = 60
export const SPAWN_INITIAL_SPEED = 350   // units/s initial clockwise tangential velocity
export const SPAWN_SAFE_ARC_DEG = 30     // degrees around spawn angle kept clear of hazards

// Food
export const INITIAL_FOOD_COUNT = 3
export const FOOD_RADIUS = 8             // collision radius
export const FOOD_LIFETIME_MS = 30_000    // food despawns and relocates after this
export const FOOD_SPAWN_EXCLUSION_DEG = 25  // angular buffer ahead of head – no spawns here
export const FOOD_MAX_ALTITUDE = 180     // prefer below this; hard rule
export const SPAWN_SEGMENTS = 36         // angular segments for precomputed spawn

// Hazards
export const INITIAL_HAZARD_COUNT = 6
export const HAZARD_ALT_MIN = 30
export const HAZARD_ALT_MAX = 90
export const HAZARD_WIDTH_MIN = 24
export const HAZARD_WIDTH_MAX = 60
export const HAZARD_MIN_SPACING_DEG = 20
export const HAZARD_ADD_INTERVAL = 8    // foods eaten before adding a hazard
export const HAZARD_SOFT_MAX = 12

// Lava
export const LAVA_BLOB_SPEED    = 750   // initial radial launch speed
export const LAVA_BLOB_SPREAD   = 0.35  // angular spread of burst (radians)
export const LAVA_BLOB_COUNT    = 4     // blobs per eruption
export const LAVA_BLOB_RADIUS   = 6     // collision + visual radius
export const LAVA_BLOB_LIFE_MS  = 3500  // max lifespan
export const LAVA_ERUPT_INTERVAL_MS = 2800  // ms between eruptions

// Gods — the Norse pantheon walking Midgard, hurling hammers and lightning at the World
// Serpent. Lethal to the head until you outgrow them; then they become prey. [TUNING]
export const GOD_INITIAL_COUNT = 1
export const GOD_WALK_SPEED = 0.12          // rad/s surface patrol
export const GOD_PATROL_HALF_ARC = 0.5      // rad each side of a god's home angle
export const GOD_ATTACK_RANGE_DEG = 55      // serpent within this arc (and low) provokes an attack
export const GOD_ATTACK_ALT_MAX = 240       // gods only strike a serpent below this altitude
export const GOD_ATTACK_INTERVAL_MS = 2400  // base delay between a god's attacks
export const GOD_COLLISION_RADIUS = 24      // figure body radius (drives figure scale too)
export const GOD_EAT_HEAD_RADIUS = 26       // head radius needed to devour a god (~score 14)
export const GOD_NUTRITION = 4              // growth from eating a god
export const GOD_STAND_HEIGHT = 14          // figure centre sits this far above the surface
// Projectiles
export const HAMMER_SPEED = 650
export const HAMMER_RANGE = 520             // out-distance before Mjölnir boomerangs back
export const HAMMER_RADIUS = 10
export const BOLT_SPEED = 1000
export const BOLT_RADIUS = 6
export const BOLT_LIFE_MS = 2500
export const GOD_JUMP_SPEED = 950           // radial launch speed of a leaping god
export const GOD_PROJECTILE_LIFE_MS = 4200

// Orbital craft — harmless prey you can snap up for a small bonus. [TUNING]
export const ISS_ALTITUDE = 160          // orbit height above Earth's surface
export const ISS_ANGULAR_SPEED = 0.22    // rad/s around Earth
export const ISS_RADIUS = 11             // collision + visual radius
export const ISS_NUTRITION = 2
export const ISS_RESPAWN_MS = 12000      // reappears this long after being eaten
export const UFO_RADIUS = 10
export const UFO_NUTRITION = 2
export const UFO_SPEED = 320
export const UFO_LIFE_MS = 9000          // despawns after this if not eaten
export const UFO_SPAWN_MIN_MS = 7000     // random gap between flybys
export const UFO_SPAWN_MAX_MS = 15000

// Camera
export const CAMERA_SMOOTHING = 0.12
export const CAMERA_BASE_ZOOM = 0.49    // px per world unit at 480×270
export const CAMERA_MAX_ZOOM_OUT = 0.42 // unused legacy — zoom now driven by score
export const CAMERA_ZOOM_MIN = 0.22     // fully zoomed out — moon stays in frame, surface keeps its detail
export const CAMERA_ZOOM_FULL_SCORE = 28  // score at which max zoom-out is reached (spread over the longer endgame)

// Devouring
// A hazard is edible once the head's radius exceeds it. A *world* is edible once the
// serpent is long enough to coil around it SWALLOW_COILS times — being long, not being
// wide, is what qualifies you to eat a planet.
export const SWALLOW_COILS = 5           // circumferences of body length needed to gulp a world whole [TUNING]
export const SWALLOW_NUTRITION_PER_RADIUS = 0.09  // moon → 12 nutrition, Earth → 20 [TUNING]
export const HAZARD_NUTRITION = 3        // nutrition from devouring a tree or volcano

// Burrowing — the middle tier. Long enough to coil a world BURROW_COILS times (well short
// of swallowing it whole) and you tunnel INTO it instead of dying: carving it away, feeding
// as you go. Chew past BURROW_COLLAPSE_FRACTION of its area and the whole world collapses.
export const BURROW_COILS = 2                    // coils of length to unlock burrowing [TUNING]
export const BURROW_CARVE_RADIUS_MULT = 1.4      // tunnel radius relative to head radius
export const BURROW_BITE_SPACING_MULT = 0.55     // carve a fresh bite once moved this × tunnel radius
// Fraction of a world's area to hollow (as swept tunnel area) before it collapses. Higher =
// more tunnelling required. At 0.6 the moon takes roughly 2–3 full bores to eat. [TUNING]
export const BURROW_COLLAPSE_FRACTION = 0.6
// A hazard is swallowed once the head outgrows its GIRTH (width), not its full bounding
// circle — a tall skinny tree shouldn't be as hard to eat as a fat volcano. Lower = eat sooner.
export const HAZARD_EAT_GIRTH_FACTOR = 0.5

// Celestial bodies
export const MOON_UNLOCK_SCORE = 6    // score at which moon gravity kicks in [TUNING]
export const MOON_X = 300
export const MOON_Y = -900
export const MOON_RADIUS = 130
export const MOON_GRAVITY = 1200        // units/s² at moon surface — tuned so the moon dominates
                                        // out to ~248 units from its centre (~118 above its surface)

/**
 * Every gravitating body in the world. Gravity is the sum of all active entries —
 * no sphere-of-influence switching, no blending. Add the sun (and anything else)
 * here; nothing else needs to change.
 *
 * A body's surface is always solid, even before `unlockScore` makes its gravity active.
 */
export const BODIES: readonly CelestialBody[] = [
  { id: 'earth',   x: 0,      y: 0,      radius: PLANET_RADIUS, surfaceGravity: GRAVITY,      unlockScore: 0 },
  { id: 'moon',    x: MOON_X, y: MOON_Y, radius: MOON_RADIUS,   surfaceGravity: MOON_GRAVITY, unlockScore: MOON_UNLOCK_SCORE },
  // The ladder outward. Each becomes reachable (gravity unlocks) as you grow; all are drawn
  // from the start by the generic renderer as distant destinations. Positions/scales [TUNING].
  { id: 'mars',    x: -1350,  y: -650,   radius: 95,  surfaceGravity: 800,  unlockScore: 14, color: 0xc1440e, name: 'Mars' },
  { id: 'jupiter', x: 2600,   y: 1500,   radius: 470, surfaceGravity: 1700, unlockScore: 30, color: 0xd8a878, name: 'Jupiter' },
  { id: 'sun',     x: -1200,  y: 4600,   radius: 820, surfaceGravity: 2600, unlockScore: 55, color: 0xffcc33, name: 'the Sun' },
]

export const INTERNAL_WIDTH = 480
export const INTERNAL_HEIGHT = 270

// Performance
export const TARGET_FPS = 60
