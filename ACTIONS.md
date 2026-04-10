# Jormungandr – agentic build plan

## How to use this file

Execute phases in order. Complete each phase fully before starting the next. After Phase 6 (full game loop), run the 80/20 gate — stop and report if the mechanic is not fun. Do not polish before proving fun.

All design decisions are in `SPECS.md`. All frozen defaults and the config table are in `CLAUDE.md`. Do not re-litigate decided choices.

---

## Phase 1 – Project scaffold

**Goal:** browser opens a blank Phaser canvas.

1. Initialise a Vite + TypeScript project (`npm create vite@latest`)
2. Install Phaser 3 (`npm install phaser`)
3. Create the folder structure exactly as specified in `CLAUDE.md`
4. Create `src/game/config.ts` — populate every constant from the `CLAUDE.md` config table; no magic numbers anywhere else in the codebase. **Note:** use `DAMPING = 0.15` and `THRUST_ANGLE_DEG = 60` — SPECS.md overrides the CLAUDE.md table on these two values.
5. Create `src/game/types.ts` — define `Vec2`, `InputState`, `BodySample`, `GameState` as needed
6. Create `src/game/utils/math.ts` — implement: `radialUnit(pos, centre)`, `tangentUnit(radial, clockwise)`, `distanceSq(a, b)`, `lerpVec2(a, b, t)`, `angleToVec2(rad)`, `vec2ToAngle(v)`
7. Bootstrap a single Phaser scene in `main.ts` that confirms Phaser is running

**Done when:** `npm run dev` opens a blank Phaser canvas with no console errors.

---

## Phase 2 – Input system

**Goal:** unified `leftHeld` / `rightHeld` booleans available to all game code.

1. Create `src/game/systems/InputSystem.ts`
2. Bind keyboard: A / left-arrow → `leftHeld`, D / right-arrow → `rightHeld`
3. Bind touch: left half of screen → `leftHeld`, right half → `rightHeld`; both halves → both true
4. Expose `getInputState(): InputState` returning `{ leftHeld, rightHeld }`; derive `leftOnly`, `rightOnly`, `both`, `neither` inside callers, not here
5. Add `R` key binding for restart (fires a Phaser event; game loop listens for it)

**Done when:** `console.log(getInputState())` in the game loop correctly reflects keyboard and touch input simultaneously.

---

## Phase 3 – Planet, serpent head, physics

**Goal:** a serpent head flies around a circular planet under gravity and player thrust.

1. Render the planet as a filled circle (centre at world origin, radius `PLANET_RADIUS`) in `GameScene.ts`
2. Create `src/game/entities/SerpentHead.ts` — stores `position: Vec2`, `velocity: Vec2`
3. Spawn head at bottom of planet (`angle = Math.PI/2` below centre), altitude `SPAWN_ALTITUDE`, initial velocity `SPAWN_INITIAL_SPEED` clockwise-tangential
4. Each frame, in order:
   - Compute `radial = radialUnit(head.position, planetCentre)`
   - Apply gravity: `velocity += radial.scale(-GRAVITY) * dt`
   - If input held: compute thrust vector using planet-relative model (see `CLAUDE.md` architecture section); apply to velocity
   - Apply damping: `velocity *= (1 - DAMPING * dt)`
   - Enforce minimum tangential speed: if `|tangentialComponent(velocity)| < MIN_TANGENTIAL_SPEED`, add a nudge of `MIN_TANGENTIAL_SPEED` in the current dominant tangential direction
   - Clamp: `|velocity| = min(|velocity|, MAX_SPEED)`
   - Integrate: `position += velocity * dt`
5. Render head as a coloured circle (placeholder)

**Planet-relative thrust implementation:**
```
radial = radialUnit(head.position, centre)          // outward unit vector
tangent = tangentUnit(radial, clockwise=true)        // for right; negate for left
angleRad = 60 * PI / 180                            // THRUST_ANGLE_DEG
thrustDir = tangent.scale(cos(angleRad)) + radial.scale(sin(angleRad))
velocity += thrustDir.scale(THRUST_DIAGONAL) * dt   // left or right
// both pressed: velocity += radial.scale(THRUST_RADIAL) * dt
```

**Done when:** head flies around the planet; gravity pulls it toward the surface; thrust pushes it outward and orbital; letting go causes the head to fall.

---

## Phase 4 – Camera

**Goal:** planet appears as a curved horizon below the head; head stays visible at all times.

1. Camera follows `head.position` each frame with lerp smoothing: `camPos = lerpVec2(camPos, head.position, CAMERA_SMOOTHING)`
2. Set zoom to `CAMERA_BASE_ZOOM` (0.49 px/world unit)
3. Camera does not rotate — world orientation is fixed
4. Scale mode: fit to screen height; allow width to vary (Phaser `ScaleManager.FIT` or equivalent with `autoCenter` vertical)

**Done when:** the serpent head stays on screen as it orbits; the planet reads as a curved surface below; the sky is visible above.

---

## Phase 5 – Surface collision and thin atmosphere

**Goal:** touching the planet surface kills the run; flying too high reduces thrust.

1. Each frame, compute `altitude = radialDistance(head.position, centre) - PLANET_RADIUS`
2. If `altitude <= 0`: call `triggerDeath()` (console log for now)
3. If `altitude > PLAYABLE_ALT_MAX` (220u): multiply thrust magnitude by `0.20` this frame only
4. If `altitude > 300u`: call `triggerDeath()` (safety failsafe; should be unreachable with thin atmosphere)
5. Add visual warning: at altitude 180–220u, shift sky background to a harsher tone (simple colour tween or palette swap)

**Done when:** head death on surface contact (console confirms); thrust weakens noticeably above 220u; sky shifts as warning.

---

## Phase 6 – Body trail and self-collision

This is the most technically important phase. Read `SPECS.md` §16 body implementation notes before coding.

**Goal:** a smooth body follows the head; self-collision kills the run.

1. Allocate a **ring buffer** of `Vec2` with size **4096** at scene start — pre-allocated, no dynamic growth
2. Each frame, write `head.position` into the ring buffer at the current write pointer; advance pointer modulo 4096
3. To reconstruct body: walk the ring buffer backwards from write pointer; accumulate path distance; place a `BodySample` every `BODY_SAMPLE_SPACING` (12u) units along the path until `INITIAL_BODY_SAMPLES` samples placed (grows later with food)
4. Render body: draw connected segments between consecutive samples; width interpolates from `BODY_WIDTH_HEAD` (18u) at sample 0 to `BODY_WIDTH_TAIL` (10u) at last sample
5. Self-collision: for each body capsule (pair of consecutive samples, radius = half body width at that position), check if `head circle` (radius `HEAD_COLLISION_RADIUS`) overlaps the capsule; skip the first `SAFE_NECK_SAMPLES` (8) samples
6. If self-collision detected: call `triggerDeath()`

**Capsule-circle overlap check:**
```
// Capsule defined by segment A→B with radius r_capsule
// Circle at P with radius r_head
closest = closestPointOnSegment(P, A, B)
overlap = distance(P, closest) < (r_capsule + r_head)
```

**Done when:** body follows head as a smooth trail; flying into own body kills the run; no visual gaps at high speed.

---

## Phase 7 – Food, growth, and score

**Goal:** eating food grows the serpent after a delay; score counts foods eaten.

1. Create `src/game/systems/SpawnSystem.ts` — implement 36-segment precomputation:
   - Divide globe into 36 × 10° segments
   - Mark each segment occupied if serpent body or hazard overlaps its altitude band
   - Pick randomly from free segments; place food at random angle + altitude within segment
   - If no free segments: accept fewer than `INITIAL_FOOD_COUNT` active items
2. Spawn `INITIAL_FOOD_COUNT` (3) food items at game start
3. Create `src/game/entities/Food.ts` — circle sprite, radius ~8u, at spawned position
4. Head-food collision: if `distance(head, food) < HEAD_COLLISION_RADIUS + FOOD_RADIUS`: consume food
5. On consume:
   - Increment `score`
   - Add entry to growth queue: `{ samplesRemaining: GROWTH_PER_FOOD, triggerTime: now + GROWTH_DELAY_MS }`
   - Begin growth pulse visual: animate a brightening/bulge travelling from head to tail over `GROWTH_DELAY_MS`; on pulse arrival at tail, extend visible body by `GROWTH_PER_FOOD` samples
   - Immediately spawn one replacement food item
6. Render score as `foods eaten: N` text in screen space (top corner)

**Done when:** eating food visibly extends the serpent after 350ms; score increments; growth pulse travels head-to-tail.

---

## Phase 8 – Scenery hazards

**Goal:** surface-anchored hazards create route pressure and kill on contact.

1. Create `src/game/entities/Hazard.ts` — simple convex shape anchored to planet surface
2. At world generation, place `INITIAL_HAZARD_COUNT` (6) hazards:
   - Minimum `HAZARD_MIN_SPACING_DEG` (20°) angular separation between hazard centres
   - No hazard within `SPAWN_SAFE_ARC_DEG` (30°) of spawn corridor
   - Height `HAZARD_ALT_MIN`–`HAZARD_ALT_MAX` (30–90u), width 24–60u
3. Head-hazard collision: head circle overlaps hazard shape → `triggerDeath()`
4. Add hazard difficulty ramp in `SpawnSystem`: every `HAZARD_ADD_INTERVAL` (8) foods eaten, add 1 hazard up to `HAZARD_SOFT_MAX` (12)

**Done when:** hazards are visible on the surface; flying into one ends the run; new hazards appear as score grows.

---

## Phase 9 – Full game loop

**Goal:** play → die → see score → restart → play again. No console logs — real game states.

1. Replace all `triggerDeath()` console logs with a proper `DEAD` game state
2. On death: freeze all movement; stop spawning; show death flash (brief visual)
3. Show game-over overlay (can be a separate UIScene or a simple Phaser container):
   ```
   score: N
   best: N
   tap or press R to restart
   ```
4. Track `bestScore` in memory (not persisted yet)
5. R key / screen tap in DEAD state: full reset — head position, velocity, body ring buffer, food positions, hazard count, score; do not reset bestScore
6. Respawn serpent in the guaranteed safe corridor (no hazards within `SPAWN_SAFE_ARC_DEG`)
7. Dynamic camera zoom: as body length grows, reduce zoom toward `CAMERA_MAX_ZOOM_OUT` (0.42 px/unit) proportionally

**Done when:** the full loop runs without code errors; best score persists across restarts within the session.

---

## 80/20 gate — stop here and evaluate

Do not continue to Phase 10 without answering these questions by actually playing:

1. Is flying around the planet satisfying on its own?
2. Does eating food and watching the body grow create genuine tension?
3. Does self-collision feel fair — neither too forgiving nor surprising?
4. Does the game make you want to try again immediately after death?

**If yes to all:** continue to Phase 10.

**If no:** identify the specific failing element. Fix only that. Do not add content or art to compensate for a broken mechanic.

---

## Phase 10 – Readability pass

**Goal:** an unfamiliar player can immediately identify head, body, food, and hazards.

1. **Head sprite:** visually distinct from body — larger, brighter eye or glow, horn or crest silhouette; replace placeholder circle
2. **Body rendering:** value contrast (light/dark difference) and/or outline against background and terrain — not hue alone; body must remain readable when overlapping hazards
3. **Food sprite:** 16×16px pixel-art sprite; clearly distinguishable from terrain and body
4. **Hazard sprite:** surface-anchored rocky shape; strong silhouette against sky and planet surface
5. **Background:** 2 layers maximum — planet surface layer, sky layer; palette chosen so body contrast is guaranteed, not assumed

**Done when:** screenshot of mid-game play state is readable to someone who has not seen the game before.

---

## Phase 11 – Config exposure and first tuning pass

**Goal:** all tunable values are accessible without code changes; feel matches spec targets.

1. Confirm every value in the `CLAUDE.md` config table is a named constant in `config.ts` — no exceptions
2. Play-test against the tuning questions in `SPECS.md` §25
3. Key tuning priorities in order:
   - Does the serpent feel heavy but controllable? (adjust `DAMPING`, `THRUST_DIAGONAL`)
   - Does orbital momentum feel satisfying between thrusts? (adjust `MIN_TANGENTIAL_SPEED`)
   - Does the safe neck zone feel fair on tight turns? (adjust `SAFE_NECK_SAMPLES`)
   - Does growth pressure escalate at the right rate? (adjust `GROWTH_PER_FOOD`, `GROWTH_DELAY_MS`)
4. Document any values changed from defaults with a brief reason in a comment in `config.ts`

**Done when:** the game matches the feel targets in `SPECS.md` §7 and the core loop is demonstrably fun.

---

## What not to build (ever, in this phase)

- Audio (optional; add only after Phase 9 if time allows — one loop, one eat sound, one death sound)
- Title screen (skip in prototype; game boots straight to play)
- Save/persist (bestScore lives in memory only until the game is confirmed fun)
- Multiple planets, unlock systems, menus, cosmetics, analytics, backend
- Any library not already installed

If a feature is not in this file, it is not in scope.
