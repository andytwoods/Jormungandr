// All tunable values live here. Never use magic numbers in logic files.
// Values marked [TUNING] are the most likely to need adjustment in playtesting.

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
export const GROWTH_PER_FOOD = 4         // body samples added per food eaten [TUNING]
export const GROWTH_DELAY_MS = 350       // ms delay between eating and tail extension [TUNING]

// Physics [TUNING]
export const GRAVITY = 1800              // units/s² toward planet centre — strong enough that single button cannot maintain altitude
export const THRUST_DIAGONAL = 2025      // magnitude for left/right thrust (radial component ~1432 < gravity — you fall while steering)
export const THRUST_RADIAL = 3600        // magnitude for both-pressed thrust — the altitude rescue button (2× gravity = decisive pull-out)
export const THRUST_ANGLE_DEG = 45       // degrees from tangent toward radial — equal orbital/radial split
export const DAMPING = 0.15              // velocity multiplier loss per second (genuinely mild)
export const MAX_SPEED = 700             // units/s speed cap
export const MIN_TANGENTIAL_SPEED = 40   // units/s floor — lower now that steering is more natural

// Thin atmosphere (above PLAYABLE_ALT_MAX)
export const THIN_ATMOSPHERE_THRUST_FACTOR = 0.15  // thrust efficiency above ceiling (tighter with stronger thrust)

// Spawn
export const SPAWN_ALTITUDE = 60
export const SPAWN_INITIAL_SPEED = 200   // units/s initial clockwise tangential velocity
export const SPAWN_SAFE_ARC_DEG = 30     // degrees around spawn angle kept clear of hazards

// Food
export const INITIAL_FOOD_COUNT = 3
export const FOOD_RADIUS = 8             // collision radius
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

// Camera
export const CAMERA_SMOOTHING = 0.12
export const CAMERA_BASE_ZOOM = 0.49    // px per world unit at 480×270
export const CAMERA_MAX_ZOOM_OUT = 0.42 // minimum zoom (zoomed out furthest)
export const INTERNAL_WIDTH = 480
export const INTERNAL_HEIGHT = 270

// Performance
export const TARGET_FPS = 60
