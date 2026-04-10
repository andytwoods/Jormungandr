# Jormungandr – Claude Code guide

## Project summary

Retro pixel-art arcade game. A serpent flies around a circular planet, eats food, grows longer, and dies on collision with terrain or its own body. Browser-first, no backend.

Full specification: `SPECS.md`

---

## Tech stack

- **TypeScript** – strict mode preferred
- **Phaser 3** – rendering, input, scene management, game loop
- **Vite** – dev server and bundler
- **Capacitor** – mobile packaging (deferred, not yet added)

## Dev commands

```bash
npm install        # install dependencies
npm run dev        # local dev server (Vite)
npm run build      # production bundle to dist/
npm run preview    # preview the production build locally
```

---

## Intended source structure

```
src/
  main.ts
  game/
    config.ts              # all tuning constants — see defaults below
    scenes/
      BootScene.ts
      GameScene.ts
      UIScene.ts           # score/game-over overlay (can be deferred)
    entities/
      SerpentHead.ts
      SerpentBody.ts
      Food.ts
      Hazard.ts
    systems/
      InputSystem.ts
      MovementSystem.ts
      GrowthSystem.ts
      CollisionSystem.ts
      SpawnSystem.ts
    utils/
      math.ts
    types.ts
```

Keep the structure lean. Don't add layers until they're needed.

---

## Architectural decisions already made

These are **frozen** — do not re-litigate them.

### Controls
Planet-relative, not screen-relative. "Left" always means counter-clockwise + away from surface. "Right" always means clockwise + away from surface. This is consistent at every position on the globe.

- `A` / left arrow → counter-clockwise + outward thrust (45° diagonal)
- `D` / right arrow → clockwise + outward thrust (45° diagonal)
- Both → pure radial-outward thrust
- Mobile: left/right screen halves mirror desktop

### Input abstraction
Two boolean states: `leftHeld`, `rightHeld`. Gameplay logic derives `leftOnly`, `rightOnly`, `both`, `neither` from those. Touch and keyboard feed the same abstraction.

### Movement model
No automatic forward speed. The serpent moves entirely from inertia, gravity, and player thrust. Each frame: apply gravity → apply thrust if held → apply damping → clamp speed.

### Camera model
Surface-level follow. Planet reads as a curved horizon. Camera follows the serpent head. Camera does **not** rotate with the planet (serpent appears inverted at the bottom — this is intentional).

### Body implementation
Smooth trail from a **high-resolution path buffer** of head positions. Body points are placed at fixed spacing (12 units) by walking the path buffer — not raw frame positions. This avoids gaps at high velocity. Self-collision treats body as **capsules** (line segments with radius), not point checks.

### Coordinate model
Planet = centre point + radius. All gameplay maths is expressed in radial/tangential terms relative to planet centre.

### Collision: what kills the player
Only the **head** can trigger death. Three death conditions:
1. Head altitude reaches zero (surface contact)
2. Head circle overlaps a hazard
3. Head circle overlaps a body capsule outside the safe neck zone
Body-to-terrain and body-to-surface contact are harmless in v1.

---

## Default tuning values (`config.ts`)

All of these must be named constants in `src/game/config.ts`, never magic numbers in logic files.

| Constant | Value |
|---|---|
| `PLANET_RADIUS` | 220 |
| `PLAYABLE_ALT_MIN` | 40 |
| `PLAYABLE_ALT_MAX` | 220 |
| `INITIAL_HAZARD_COUNT` | 6 |
| `INITIAL_FOOD_COUNT` | 3 |
| `BODY_SAMPLE_SPACING` | 12 |
| `BODY_WIDTH_HEAD` | 18 |
| `BODY_WIDTH_TAIL` | 10 |
| `HEAD_COLLISION_RADIUS` | 12 |
| `SAFE_NECK_SAMPLES` | 8 |
| `GROWTH_PER_FOOD` | 4 |
| `GROWTH_DELAY_MS` | 350 |
| `INITIAL_BODY_SAMPLES` | 10 |
| `GRAVITY` | 900 |
| `THRUST_DIAGONAL` | 1150 |
| `THRUST_RADIAL` | 1250 |
| `DAMPING` | 0.6 |
| `MAX_SPEED` | 520 |
| `SPAWN_ALTITUDE` | 60 |
| `SPAWN_INITIAL_SPEED` | 200 |
| `SPAWN_SAFE_ARC_DEG` | 30 |
| `FOOD_SPAWN_EXCLUSION_DEG` | 25 |
| `FOOD_MAX_ALTITUDE` | 180 |
| `HAZARD_ALT_MIN` | 30 |
| `HAZARD_ALT_MAX` | 90 |
| `HAZARD_MIN_SPACING_DEG` | 20 |
| `CAMERA_SMOOTHING` | 0.12 |
| `CAMERA_BASE_ZOOM` | 0.49 |
| `CAMERA_MAX_ZOOM_OUT` | 0.42 |
| `INTERNAL_WIDTH` | 480 |
| `INTERNAL_HEIGHT` | 270 |
| `TARGET_FPS` | 60 |
| `HAZARD_ADD_INTERVAL` | 8 |
| `HAZARD_SOFT_MAX` | 12 |

---

## 80/20 rule — scope discipline

**The core question to answer in v1:** is flying a growing serpent around a small globe fun enough to carry the game?

### In scope for v1
- One globe, gravity, left/right/both controls
- Serpent with head + smooth trailing body
- Food pickups, delayed growth, growth pulse visual
- Surface collision, scenery collision, self-collision
- Score = foods eaten, death, instant restart

### Explicitly out of scope for v1
- Multiple planets, unlock systems, story/lore
- Advanced menus, app-store deployment
- Cosmetic upgrades, multiple food types, special effects
- Enemies beyond surface scenery
- Backend, accounts, cloud saves, analytics
- Complex audio systems, elaborate transitions

### Ask this before adding anything
1. Does this improve the core loop directly?
2. Is this part of the 20% that delivers 80% of the value?
3. Can we test the same idea more simply?
4. Are we polishing before proving fun?

If the answer suggests scope creep, cut or postpone.

---

## What not to do

- Do not add libraries beyond Phaser, Vite, TypeScript (Capacitor later)
- Do not build a backend or any server-side feature
- Do not use screen-relative controls (planet-relative is decided)
- Do not add realistic physics simulation — arcade feel only
- Do not scatter magic numbers in logic files — all tuning values go in `config.ts`
- Do not add save/persist features until the prototype is already fun
- Do not add a complex camera system — follow head, no rotation, mild smoothing
- Do not add body-chain physics — smooth path buffer trail only
- Do not use point-only self-collision checks — use capsules
