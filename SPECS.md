# Jormungandr – game specification

## 1. Project overview

**Jormungandr** is a retro, rustic, pixel-art endless arcade game for desktop and mobile. The player controls the world serpent as it flies around a small solid globe, eats biological matter, grows longer, and eventually risks colliding with its own body.

The game takes inspiration from **Flappy Bird** and **Snake**, but its defining mechanic is movement around a **circular planet** using only two directional controls.

The design goal is to create a game that is immediately understandable, mechanically distinctive, and highly replayable.

---

## 2. Core design principle – the 80/20 rule

This project must be built using a strict **80/20 approach**.

That means:

* identify the **smallest possible playable version** that delivers most of the value
* build and test the **core mechanic first**
* postpone anything that does not directly prove the game is fun
* avoid polishing, feature expansion, and content growth until the core loop is clearly working

### 80/20 interpretation for this project

The **20% of features** that should provide **80% of the game’s value** are:

* movement around a **solid globe**
* **left / right / both** control system
* constant gravity pulling the serpent downward
* food pickups at different altitudes
* delayed growth after eating
* collision with planet surface, scenery, and own body
* one-hit death
* score based on foods eaten
* instant restart

If these elements are fun, the game is viable.

If these elements are not fun, no amount of extra art, lore, planets, progression, or polish will save it.

### What is explicitly out of scope for the first playable version

The following must **not** be prioritised in the first build:

* multiple planets
* unlock systems
* story or lore screens
* advanced menu systems
* app-store deployment
* cosmetic upgrades
* multiple food types with special effects
* enemies beyond basic scenery hazards
* visual polish beyond readability
* advanced sound systems
* analytics, accounts, cloud saves, or live ops features

---

## 3. High concept

You are **Jormungandr**, the world serpent, flying around a small planet. As you eat biological matter, your body grows longer after a short delay. The longer you become, the more of the world you occupy, and the more dangerous your own movement history becomes. A single collision with terrain or your own body ends the run.

The fantasy is not simply “a flying snake”. The core fantasy is:

**wrap the world in your own body without crashing into it.**

---

## 4. Game pillars

### Pillar 1 – simple controls, expressive movement

The game must be playable with only two inputs while still allowing precision and mastery.

### Pillar 2 – self-created danger

The player’s success creates future risk. Growth is both reward and threat.

### Pillar 3 – strong spatial identity

The globe is not decoration. The circular world is central to the gameplay.

### Pillar 4 – retro, rustic presentation

The game should feel visually simple, readable, and grounded in stylised pixel-art mythic imagery.

### Pillar 5 – ruthless scope discipline

At every step, prefer the version that proves the core loop with the least work.

---

## 5. Core gameplay loop

1. Spawn as a small serpent near the globe
2. Move around the world using left and right controls
3. Collect biological matter floating at various altitudes
4. Grow longer after a short delay
5. Avoid terrain and your own body
6. Survive for as long as possible
7. Increase score through length
8. Die instantly on collision
9. Restart immediately and try again

---

## 6. Controls

Controls are **planet-relative**. "Left" always means counter-clockwise + away from the surface. "Right" always means clockwise + away from the surface. This is consistent regardless of where on the globe the serpent is.

### Mobile

* **left half of screen pressed** = counter-clockwise + outward thrust
* **right half of screen pressed** = clockwise + outward thrust
* **both halves pressed** = pure outward thrust (straight away from planet)
* **no press** = no thrust, serpent falls toward the planet

### Desktop

* keyboard support required from the first playable version
* recommended default mapping:

  * **A / left arrow** = counter-clockwise + outward thrust
  * **D / right arrow** = clockwise + outward thrust
  * pressing both together = pure outward thrust

### Control goals

* controls must feel readable and consistent at every position on the globe
* the serpent should feel slightly weighty, not twitchy
* both-button input must feel intentional and reliable
* movement must be easy to learn but difficult to master

---

## 7. Movement and physics

### Planet model

* the world is a **solid globe**
* gravity pulls the serpent toward the **centre of the globe**
* the serpent flies around the outside of the planet

### Movement model — decided

The serpent has **no automatic forward speed**. It does not orbit at a constant rate. It moves entirely from inertia, gravity, and player-applied thrust.

This is a deliberate departure from Flappy Bird, where forward movement is automatic and the player manages only altitude. In Jormungandr, the player simultaneously manages **altitude** (stay off the surface, stay below the ceiling) and **orbital position** (choose which direction around the globe to travel). Left and right thrust apply in opposite orbital directions, so the player's directional choice shapes their route around the globe.

Without input, gravity and damping will reduce the serpent's speed and pull it toward the surface. The serpent must be actively flown.

**Critical feel test:** the serpent should feel like it is flying through space with satisfying momentum — not hovering and fighting gravity tick-by-tick. If playtesting shows the game feels like a hover correction loop rather than expressive orbital flying, the first fix is to reduce the damping value, not to add automatic forward speed.

### Input model

Controls are **planet-relative**, not screen-relative.

* left input applies thrust at 45° between counter-clockwise tangent and radial-outward
* right input applies thrust at 45° between clockwise tangent and radial-outward
* both inputs apply pure radial-outward thrust (straight away from planet centre)
* releasing input removes thrust and allows gravity to dominate

"Away from the planet surface" always means the same thing regardless of where on the globe the serpent is. Pressing left at the bottom of the planet pushes the serpent counter-clockwise and outward — never toward the surface.

### Physics goals

* the serpent should feel alive but heavy enough to seem substantial
* motion should reward rhythm and anticipation rather than frantic tapping
* the player should be able to recover from small mistakes but not from major misjudgements

### First-build recommendation

Use simple arcade-style movement rather than realistic physics. The first implementation should optimise for feel, readability, and controllability.

---

## 8. Camera

### Camera model – decided

The camera uses a **surface-level follow** model. The planet is much larger than the screen. The player never sees the whole globe at once — the planet reads as a **curved horizon** below and around the serpent.

This is the correct model for this game. A zoomed-out globe view (planet centered, serpent tiny) was considered and rejected: readability of terrain, body, and food all degrade too much at that scale. The round-world fantasy is delivered through the curved horizon and orbital movement, not by showing the whole planet.

A centered globe view may be used on **title and game-over screens**, where gameplay readability is not required.

### First-playable camera requirement

* landscape view
* camera follows the head of the serpent
* planet appears as a large curved surface — only a portion is visible at any time
* planet is not centered on screen; the head is
* enough surrounding space must be visible for planning movement
* the head must remain easy to identify at all times

### Recommendation

Start with a close-to-medium follow camera, then allow slight zooming out as the serpent length increases.

### 80/20 rule note

Do not build a sophisticated camera system initially. Only solve for:

* basic readability
* enough reaction time
* clear view of upcoming terrain and body position

---

## 9. Player character – Jormungandr

### Functional requirements

* begins small at run start
* consists of a head plus a smooth trailing body
* only the **head** can trigger death collisions
* the body follows smoothly behind the head
* body length increases after a short delay when food is consumed

### Readability requirements

Three distinct contrast relationships must be maintained simultaneously:

**Head vs body:** The head must be visually distinct from the body. This is essential because only the head collides.

Suggested methods:
* larger sprite
* brighter eye
* horn or crest silhouette
* stronger contrast than the body

**Body vs terrain:** The serpent body must remain legible when overlapping or passing near scenery hazards. Contrast must be maintained through **value** (light/dark difference) and/or **silhouette** — not colour hue alone. A body that is distinguishable from terrain only by hue will be invisible to players with colour vision deficiency and will also fail in low-contrast rendering environments. Use outline, brightness difference, or texture difference as the primary distinguishing mechanism.

**Body vs background:** The body must remain visible against the background sky and planet surface at all altitudes. The background palette must be chosen with body contrast in mind, not independently. Same rule applies: value and silhouette first, hue second.

### Growth behaviour

* each food pickup is added to a pending growth queue
* when food is eaten, a **visual pulse** (a bulge or brightened segment) immediately begins travelling from the head toward the tail
* when that pulse reaches the tail, the tail extends
* the pulse is the player's primary signal that growth is coming and when to expect it
* this prevents the "unfair tail extension" feeling — players can see where the danger is about to materialise
* growth should appear clearly enough that the player understands it happened intentionally

---

## 10. Collision rules

### Death conditions

The run ends immediately if the serpent’s head collides with:

* the planet surface
* scenery
* its own body

The serpent cannot land or rest on the planet. Any surface contact is immediately fatal.

### Non-lethal body behaviour

* the body itself does not take damage
* body-to-scenery overlap does not matter unless later design changes require it
* body contact with the planet surface does not matter in the first version
* only head contact matters in the first version

### 80/20 rule note

Keep collision logic simple in the first build. Use forgiving, predictable collision shapes where possible.

---

## 11. Food and growth

### Food behaviour

* food represents **biological matter**
* food appears at different altitudes around the globe
* collecting food is the primary way to increase score and difficulty

### Growth rules

* food is consumed by head contact
* growth occurs after a short delay, not instantly
* each food item adds a fixed amount of body length in the first version

### Design purpose

Food serves three roles:

* reward
* route-planning prompt
* difficulty escalation mechanism

### First-build simplification

Use a single food type with a single effect: growth.

No special powers, no buffs, no penalties.

---

## 12. Scenery and hazards

### First playable version

Scenery should be simple, readable, and mostly surface-anchored.

Examples:

* rocky spires
* cliffs
* jagged outcrops

### Function

Scenery exists to:

* create route pressure
* force altitude decisions
* combine with body growth to create traps

### 80/20 rule note

Do not add multiple hazard systems in the first prototype. Scenery plus self-collision is enough to prove the game.

---

## 13. Score and failure

### Score

* score equals **foods eaten**
* this serves as a proxy for length, since each food adds a fixed body increment
* foods eaten is the canonical metric shown to the player and stored as best score
* true geometric length is a tuning question deferred to after the prototype

### Failure

* one hit = death
* death should be immediate and readable
* restart should be fast

### First-build recommendation

After death, show a minimal game-over state with:

* foods eaten this run
* best foods eaten
* restart prompt

---

## 14. Art direction

### Style

* retro
* rustic
* pixelated
* more advanced than strict NES-style presentation
* mythic but not overly grand or ornate

### Art direction intent

The game should **not** be visually constrained to authentic NES limitations. Instead, it should use **modern pixel art** that keeps a retro, rustic feel while allowing richer backgrounds, stronger animation, better lighting contrast, and more expressive environments.

The visual target is:

* clearly pixelated
* readable at a glance
* richer and more atmospheric than true NES-era visuals
* stylised rather than minimal for its own sake

### Visual priorities for version 1

* clear head silhouette
* readable body shape
* clear terrain contrast
* simple but attractive food sprites
* effective atmospheric background layers
* enough visual detail to make the world feel distinctive without cluttering gameplay

### Visual non-priorities for version 1

* cinematic transitions
* very large quantities of unique assets
* heavy effects that reduce clarity
* detail that interferes with gameplay readability

### First planet visual target

A simple world with retro-rustic mythic atmosphere, such as:

* dark sea tones
* rough stone landforms
* muted sky
* sparse Norse-inspired visual motifs
* richer pixel-art backdrops than an authentic 8-bit look

---

## 15. Audio direction

### Target feel

* retro
* rustic
* restrained
* atmospheric rather than bombastic

### Version 1 audio scope

* one basic background loop
* one eat sound
* one death sound
* simple UI sounds if needed

### 80/20 rule note

Audio should support the experience without becoming its own production track in the early phase.

---

## 16. Platforms and technical direction

### Target platforms

* desktop browser
* mobile browser
* iOS app packaging later
* Android app packaging later

### Recommended stack

* **TypeScript**
* **Phaser 3**
* **Vite** as the dev server and bundler
* **Capacitor** for iOS and Android packaging later

### Why this stack

* one codebase for web and mobile
* fast iteration in the browser
* strong support for 2D rendering and input
* sensible path from browser prototype to native app packages
* TypeScript reduces avoidable bugs as the codebase grows

### 80/20 rule note

The first milestone should be a browser-playable prototype. Mobile packaging comes later.

### Technical architecture

The project should be treated as a **single-player client-side game**.

For the first version:

* no backend
* no accounts
* no cloud save
* no online features
* no analytics unless explicitly needed later

This keeps the first build fast, cheap, and easy to test.

### Runtime model

* Phaser runs the main game loop, rendering, input handling, collisions, and scene management
* the game should run as a standard web app first
* Capacitor can later wrap the web build for iOS and Android
* local browser storage can be used later for best score and settings if needed

### Rendering approach

Use Phaser's default rendering pipeline unless a specific problem forces a change.

For version 1:

* prioritise crisp pixel-art rendering
* use simple sprites and lightweight background layers
* avoid shader-heavy effects and rendering complexity

### Input model

The game should support a single shared input abstraction so gameplay code does not care whether input came from keyboard or touch.

Recommended high-level input actions:

* `leftHeld`
* `rightHeld`

Derived gameplay states:

* left only
* right only
* both
* neither

This avoids duplicating logic between desktop and mobile.

### Recommended code structure

A lean structure is preferable. Example:

* `src/main.ts` – bootstraps Phaser
* `src/game/config.ts` – game config, resolution, scaling, tuning values
* `src/game/scenes/BootScene.ts` – preload minimal assets
* `src/game/scenes/GameScene.ts` – core gameplay loop
* `src/game/scenes/UIScene.ts` – score, game-over overlay later if needed
* `src/game/entities/SerpentHead.ts`
* `src/game/entities/SerpentBody.ts`
* `src/game/entities/Food.ts`
* `src/game/entities/Hazard.ts`
* `src/game/systems/InputSystem.ts`
* `src/game/systems/MovementSystem.ts`
* `src/game/systems/GrowthSystem.ts`
* `src/game/systems/CollisionSystem.ts`
* `src/game/systems/SpawnSystem.ts`
* `src/game/utils/math.ts`
* `src/game/types.ts`

### Recommended data model

Keep data structures simple.

Examples:

* serpent head position and velocity
* body sample points or trailing segments
* pending growth queue
* food spawn positions
* hazard definitions
* score and run state

### Body implementation recommendation

For the first prototype, the serpent body should be implemented as a **smooth trail sampled from recent head positions**, rather than a complex physics chain.

Reason:

* simpler to implement
* easier to tune
* better fit for the intended smooth body feel
* cheaper than full joint simulation

Suggested approach:

* store recent head positions as a **ring buffer (circular array) of fixed size** — record every frame position, not just spaced samples; pre-allocate the buffer at startup; do not grow it dynamically
* ring buffer size: **4096 entries** — sufficient for ~68 seconds of continuous play at max speed (520 units/s, 60 fps, 8.7 units/frame); older entries are overwritten as the ring advances; this keeps memory usage constant across session length
* reconstruct body points at fixed spacing (12 units) by walking the ring buffer backwards from the current tail pointer, not by using raw frame positions
* extend visible trail length when growth resolves
* use those body points both for rendering and self-collision checks

**Critical implementation risk — the gap problem:** At high velocity (up to 520 units/s at 60 fps), the head moves up to ~8.7 units per frame — well under the 12-unit sample spacing. However, if frame rate drops or velocity spikes, consecutive frame positions could exceed sample spacing, creating gaps. The ring buffer above prevents this: body segments are always placed at fixed distances along the accumulated path, regardless of frame timing.

**Collision requirement:** Self-collision must treat the body as a series of **capsules** (line segments with radius) between consecutive body sample points, not as isolated point checks. A point-only check allows the head to pass through a body segment if the gap between sample points is wider than the head radius.

This is likely the highest-value technical decision in the project.

### Movement implementation recommendation

Do not begin with realistic force simulation.

Instead, implement a tuned arcade movement model:

* inward gravity toward planet centre
* directional thrust from input
* capped velocity if needed
* optional mild damping only if tuning requires it

The aim is game feel, not realism.

### Collision implementation recommendation

For version 1:

* use a simple collision shape for the head, such as a circle
* scenery can use circles or simple polygons depending on convenience
* self-collision can begin by checking head overlap against body sample points excluding a short safe zone near the neck

This is sufficient for proving the mechanic.

### Coordinate model

Represent the planet as:

* a centre point
* a radius

Most gameplay calculations can be expressed relative to that centre:

* radial direction
* tangent direction
* altitude above planet surface

This should make spawning, movement, hazard placement, and camera reasoning much simpler.

### Food spawning logic

For the first playable build, food can spawn by:

* choosing an angle around the globe
* choosing an altitude band
* rejecting positions that intersect terrain or the head

**Frustum-aware spawning:** Do not spawn food or hazards within a minimum angular distance of the head's current position that would place them just off the visible screen edge. Because screen width varies with device aspect ratio (the "fit to height" scaling decision), use a fixed **angular buffer of at least 25°** ahead of the head as an off-screen spawn exclusion zone. This prevents obstacles appearing with insufficient reaction time on narrower viewports.

No advanced ecosystem logic is needed.

### Difficulty progression logic

Version 1 should keep progression extremely simple.

Preferred first method:

* difficulty increases mainly through player growth
* optional small increase in scenery density after score thresholds

Do not build a complex difficulty director early.

### Save data

Do not build a save system initially.

At most, store:

* best length
* audio on/off setting later if added

Use local storage only after the prototype is already fun.

### Performance targets

The game should be designed to run comfortably on mid-range phones and ordinary laptops.

Practical rules:

* keep object counts modest
* reuse objects where possible
* avoid unnecessary per-frame allocations
* avoid expensive body simulation
* keep shaders and post-processing out of the first build

### Resolution and scaling

The game is landscape-first.

**Scaling strategy – decided:** scale to fit height, allow wider screens to reveal more world horizontally. No letterboxing on the sides. Black bars on top and bottom only if the screen is too wide for the aspect ratio to fill vertically without distortion (rare in practice).

This is safe for gameplay: the main threat axis is altitude (vertical), not horizontal. Wider screens gaining a wider field of view is a minor advantage, not a fairness problem. Do not try to hide or equalise this.

Technical goals:

* fit height to screen height at all times
* allow horizontal extent to vary with screen width
* do not letterbox or pillarbox horizontally
* preserve pixel-art crispness — scale by integer multiples where possible, otherwise use nearest-neighbour
* Phaser `ScaleManager` mode: `FIT` with `autoCenter` is the starting point; adjust if pixel clarity suffers

### Development workflow

Recommended sequence:

1. run as a local browser game
2. tune controls and growth feel in browser first
3. test touch controls in mobile browser
4. only then add Capacitor shell for device packaging

### Testing priorities

The first testing pass should focus on feel and readability, not completeness.

Test questions:

* can players understand the controls immediately?
* does the serpent feel heavy but responsive?
* is the head always readable?
* does growth create satisfying pressure?
* does self-collision feel fair?
* is the camera giving enough planning information?

### Dependency discipline

Apply the 80/20 rule to dependencies as well.

For version 1, avoid adding libraries unless they clearly remove major work.

Prefer:

* Phaser
* TypeScript
* Vite
* Capacitor later

Avoid adding extra state, physics, UI, animation, or utility frameworks unless a real need appears.

### Suggested initial deliverable

The first technical deliverable should be:

* one Phaser scene
* one planet
* one serpent
* one food type
* one scenery type
* keyboard and touch input
* score and restart

That is enough to validate the game.

## 17. Content roadmap beyond the first version

These are valid future features, but only after the core loop is proven.

### Future feature set

* multiple planets
* genuinely different environmental behaviours per planet
* unlock progression
* visual themes and alternate palettes
* richer scenery types
* additional biological matter types
* more advanced audio
* menu and profile systems
* achievements or run history
* thin atmosphere mechanic: thrust efficiency degrades and gravity increases in the 180–220 unit altitude band, replacing the hard ceiling death with a soft push-back zone (deferred from v1 — adds complexity for a rare edge case)

### Planets as later progression

New planets should be meaningfully different, not mere reskins.

Possible variations:

* gravity feel
* scenery layout style
* visibility
* environmental hazards
* pacing

---

## 18. Scope priorities

### Must-have for first playable prototype

* one globe
* gravity toward centre
* left / right / both control system
* falling with no input
* head plus smooth body
* food pickups
* delayed growth
* planet surface collision
* scenery collision
* self-collision
* score based on foods eaten
* death and restart

### Should-have after prototype is fun

* improved camera tuning
* stronger placeholder art
* simple audio
* basic save of best score
* responsive scaling across devices

### Nice-to-have later

* multiple planets
* unlocks
* richer hazards
* menus and settings
* polish effects
* mobile packaging

---

## 19. Key production question

The entire first phase exists to answer one question:

**Is flying a growing serpent around a small globe fun enough to carry the game?**

All production choices should serve that question.

If a task does not help answer that question, it is probably not part of the 20%.

---

## 20. Milestone plan

### Milestone 1 – core prototype

Goal: prove the mechanic

Deliverables:

* movement around globe
* controls working on keyboard and touch
* food spawning
* body growth delay
* scenery hazards
* self-collision
* score and restart

Success criterion:

* the game is fun to replay even with placeholder visuals

### Milestone 2 – first complete playable slice

Goal: make one polished-enough planet

Deliverables:

* improved visuals
* tuned camera
* tuned difficulty curve
* audio basics
* stronger game-over loop

Success criterion:

* the game feels coherent and ready for outside playtesting

### Milestone 3 – expansion

Goal: add variety only after the core works

Deliverables:

* second planet
* distinct environmental behaviour
* progression structure
* early mobile packaging

---

## 21. Development guardrails

During development, the following questions should be asked repeatedly:

1. Does this improve the core loop directly?
2. Is this part of the 20% that provides most of the value?
3. Can we test the same idea more simply?
4. Are we polishing before proving fun?
5. Are we adding content before tuning the mechanic?

If the answer suggests unnecessary expansion, cut or postpone the feature.

---

## 22. V1 frozen spec – default implementation values

This section exists so an implementation agent does not need to guess the most important defaults.

These values are not claimed to be final forever. They are the **starting defaults for the first playable build** and may later be tuned through playtesting.

### Design intent for these defaults

* prioritise responsiveness over realism
* keep the first world small enough that the body becomes relevant quickly
* allow generous readability before difficulty rises
* make the build fast to implement and easy to tune

### World defaults

* planet radius: **220 world units**
* playable altitude band above surface: **40 to 220 units**
* hard upper soft-limit trigger for food spawning: prefer spawning below **180 units** unless space is blocked
* initial hazard count: **6**
* initial food count target: **3 active food items**
* initial world theme: rocky sea-world with sparse Norse-inspired motifs

### Serpent defaults

* initial visible body length: **10 body samples** beyond the head
* body sample spacing: **12 world units**
* body width: **18 units** near the head, tapering to **10 units** near the tail
* head collision radius: **12 units**
* self-collision safe neck zone: ignore the first **8 body samples** behind the head
* growth per food: **+4 body samples**
* growth delay after eating: **350 ms**
* maximum body length for v1: **no explicit cap** unless performance requires one

### Movement defaults

These values are starting points and should be exposed in a tuning config.

**No constant forward speed.** The serpent does not move automatically. It moves only from inertia retained from previous thrust, opposed by gravity and damping. On each frame, apply: `velocity += gravity_vector * dt`, then `velocity += thrust_vector * dt` (if input held), then `velocity *= (1 - damping * dt)`, then clamp to max speed. There is no separate "forward speed" component. Orbital motion accumulates naturally from repeated directional thrust.

* gravity strength toward planet centre: **900 units/s²**
* left thrust vector: **planet-relative** — 60° from counter-clockwise tangent toward radial-outward, magnitude **1150 units/s²**
* right thrust vector: **planet-relative** — 60° from clockwise tangent toward radial-outward, magnitude **1150 units/s²**
* both pressed thrust vector: pure radial-outward (directly away from planet centre), magnitude **1250 units/s²**
* linear damping: **0.15 /s** — genuinely mild; retains ~86% velocity per second; preserves orbital momentum between thrusts
* maximum speed clamp: **520 units/s**
* minimum tangential speed floor: **80 units/s** — if the tangential component of velocity drops below this, apply a gentle tangential nudge in the current dominant orbital direction to prevent the hover-correction loop
* input model: **planet-relative, not screen-relative** — decided
* movement feel target: slightly heavy, controllable, arcade-like

**Thrust angle rationale:** At 45°, the radial component of left/right thrust is 1150 × sin(45°) ≈ 813 units/s² — insufficient to overcome gravity (900 units/s²) on a single button. At 60°, the radial component is 1150 × sin(60°) ≈ 996 units/s², which slightly overcomes gravity with one button and clearly overcomes it with both. This makes single-button thrust meaningful for altitude recovery, not just steering.

**Why planet-relative – decided:** "Left" always means counter-clockwise + away from the planet surface. "Right" always means clockwise + away from the planet surface. This keeps the muscle memory ("press = go away from danger") consistent regardless of where on the globe the serpent is. Screen-relative controls were considered and rejected: at the 6 o'clock position, screen-left thrust would angle toward the planet surface, which reads as a bug rather than a challenge.

**Implementation note:** At each frame, compute the radial-outward unit vector from planet centre to head position. Rotate 60° counter-clockwise from tangent for left thrust direction; 60° clockwise from tangent for right thrust direction. Both-pressed uses the radial-outward vector directly.

### Camera defaults

* landscape presentation only in v1
* camera follows head position
* camera smoothing: **medium**, approximately **0.12 interpolation** per frame-equivalent step
* base zoom: **~0.49 px per world unit** at 480×270 internal resolution — this places the planet diameter (440 units) at roughly 80% of screen height (216 px of 270 px), leaving visible sky above and reaction space ahead of the head
* dynamic zoom: yes, but mild — zoom out up to **15%** as body length increases, i.e. down to approximately **0.42 px per world unit**
* camera does **not** rotate with the planet
* screen stays visually stable for clarity

### Collision defaults

Three conditions kill the run immediately on head contact:

1. **Planet surface** — head altitude drops to zero (radial distance from planet centre equals planet radius)
2. **Scenery** — head circle overlaps a hazard shape
3. **Own body** — head circle overlaps any body capsule outside the safe neck zone

Above **220 units** altitude, the thin-atmosphere zone applies (thrust 20% effective) — not a kill condition. Above **300 units**, kill the run as a failsafe only.

Other collision rules:
* head uses simple circle collision (radius 12 units)
* food uses circle collision
* hazards use circles or simple convex shapes only
* self-collision treats the body as a series of **capsules** (line segments with radius) between consecutive sample points — not isolated point checks; a point-only check allows the head to pass through the body if sample spacing exceeds head radius
* self-collision excludes the first **8 body samples** behind the head (safe neck zone)
* no spawn invulnerability in normal play
* on restart, serpent respawns in a guaranteed safe region

### Difficulty defaults

The main difficulty driver is growth.

Additional ramp rules for v1:

* every **8 food collected**, add **1 hazard** up to a soft target of **12 hazards**
* food altitude variance may increase slightly with score
* no enemy AI in v1
* no timed disaster systems in v1

### Scoring defaults

* score shown to player: **foods eaten**
* best score persists locally once local save is added
* during very early prototype, persistence may be omitted

### Serpent spawn defaults

* spawn angle: **180° from top of planet** (i.e. bottom), or random in the first safe region
* spawn altitude above surface: **60 units**
* spawn initial velocity: **tangential to the planet surface, magnitude 200 units/s** (clockwise by default)
* the initial velocity prevents the serpent from immediately falling to the surface before the player has time to react
* spawn corridor is the **30° arc** around the spawn angle — no hazards placed here at world generation

### Food respawn defaults

* a new food item spawns **immediately** after one is collected, to maintain the target count of **3 active items**
* do not delay respawns — a sparse world removes route-planning pressure
* food spawn uses the same angle/altitude rules as initial placement

### Altitude boundary defaults

* the playable zone is **0 to 220 units** above the planet surface
* **no instant death at the upper boundary** — the hard-ceiling-as-death rule is removed; an invisible wall that kills feels like an engine limitation, not a mythic consequence
* at **180 to 220 units**: visual warning zone — sky shifts hue and/or darkens toward a harsh tone
* above **220 units**: **thin atmosphere zone** — thrust efficiency drops to **20%** of normal; gravity remains unchanged; the serpent will naturally decelerate and fall back into the play zone; no player action required to re-enter
* above **300 units**: safety hard-cap — run ends; this should only trigger if thrust somehow defeats the thin-atmosphere drag, which the numbers make effectively impossible; it exists as a failsafe, not a gameplay mechanic
* food does not spawn above **180 units** altitude

### World-unit to pixel ratio

* the camera zoom should be set so the planet diameter (**440 world units**) occupies roughly **80% of screen height**
* at a 480×270 internal resolution this means approximately **0.49 px per world unit** at the base zoom level
* this ratio is the reference; all other defaults (body width, head radius, food size) are already expressed in world units consistent with it

### Camera rotation note

The camera does not rotate with the planet. When the serpent orbits to the bottom of the globe, it will visually appear inverted relative to the screen. This is a deliberate choice — rotating the camera introduces complexity and can cause disorientation of its own kind. The player is expected to develop spatial awareness of the circular world. If testing shows strong confusion at the bottom arc, consider adding a subtle serpent-relative orientation indicator rather than rotating the camera.

### Spawn defaults

Food spawn rules — use the **segment precomputation approach**, not random-angle retry loops:

1. Divide the globe into **36 angular segments** of 10° each
2. At spawn time, mark each segment as **occupied** (serpent body or hazard present in the altitude band) or **free**
3. Collect all free segments, then pick one at random
4. Within the chosen segment, pick a random angle and altitude
5. If no free segments exist, accept fewer than 3 active food items — a very long serpent that has nearly filled the world is itself a near-win condition

This replaces the retry-loop approach. Random-angle retries fail at increasing rates as the serpent grows (70% occupation = 70% failure rate per attempt), causing frame hitches on mobile. The segment precomputation runs once per spawn event and is O(36) regardless of serpent length.

Hazard spawn rules:

* hazards are anchored to planet surface in v1
* hazard angular spacing should try to keep at least **20 degrees** between hazard centres initially
* hazard height range above surface: **30 to 90 units**
* hazard width range: **24 to 60 units**
* do not place a hazard directly in the initial spawn corridor

### Input defaults

#### Desktop

* `A` or left arrow = counter-clockwise + outward thrust
* `D` or right arrow = clockwise + outward thrust
* both together = pure outward thrust (radial-outward, away from planet centre)
* `R` = restart after death
* `Esc` = pause later, optional for v1 prototype

#### Mobile

* left half of screen held = counter-clockwise + outward thrust
* right half of screen held = clockwise + outward thrust
* both halves held = pure outward thrust (radial-outward, away from planet centre)
* no visible buttons required in first prototype
* show subtle translucent left/right touch zones only if testing shows confusion

### UX defaults

* game boots straight to play in the earliest prototype
* later first playable slice may add a minimal title screen
* on first launch, show a brief one-screen control hint
* game over screen should show:

  * `score: N` (foods eaten this run)
  * `best: N`
  * `tap or press R to restart`
* restart should be near-instant
* pause can be omitted in the earliest prototype

### Audio defaults

* audio optional in earliest prototype
* first playable slice should include:

  * 1 background loop
  * 1 eat sound
  * 1 death sound
* placeholder audio is acceptable

### Art defaults

* modern pixel art, clearly pixelated, not authentic NES-limited art
* internal rendering target should favour crisp scale-up
* default internal resolution: **480 × 270** in landscape
* serpent head sprite target box: about **32 × 32 px**
* body visual built from repeated or procedural pixel-art segments
* food sprite target box: **16 × 16 px**
* hazard sprite target box: variable, roughly **32 × 64 px** to **64 × 96 px**
* backgrounds may use **2 to 3 layers** maximum in v1
* all art should be replaceable later without architecture changes

### Performance defaults

* target frame rate: **60 fps**
* must remain playable on ordinary laptops and mid-range phones
* avoid expensive per-frame allocations where practical
* avoid full physics-chain simulation for the body
* object pooling is optional in prototype, recommended if needed

---

## 23. Implementation assumptions the agent may make

This section defines where an implementation agent may safely choose defaults.

### The agent may choose

* placeholder art using simple pixel-art shapes
* placeholder audio or no audio in earliest prototype
* exact file names and folder layout, provided the structure stays lean
* exact rendering method for the body, provided it produces a smooth trailing serpent
* exact hazard shapes, provided they are readable and surface-anchored in v1
* whether to use one scene or two scenes initially, provided complexity remains low

### The agent should not improvise on

* core controls
* one-hit death
* solid globe gameplay
* delayed growth
* score being based on length / food collected in v1
* retro-rustic pixel-art direction
* browser-first implementation strategy
* strict 80/20 scope discipline

### The agent should prefer

* simplicity over elegance
* tunable constants over hard-coded magic values scattered through files
* placeholder assets over waiting on polished art
* readable collisions over visually exact collisions
* minimal dependencies

### The agent should avoid

* adding backend services
* introducing online features
* adding unnecessary libraries
* building content pipelines early
* over-engineering abstractions before the mechanic is proven

---

## 24. Asset scope for v1

This game should follow a minimal asset strategy.

### Required visual assets for earliest playable version

* 1 serpent head sprite
* 1 body segment style or procedural body rendering approach
* 1 food sprite
* 1 hazard sprite family with minor variation allowed
* 1 simple background set
* 1 bitmap-style or pixel-friendly font solution

### Optional early assets

* simple death flash
* simple eat effect
* simple menu backdrop

### Explicit asset non-goals for v1

* large enemy roster
* elaborate cutscenes
* bespoke art for multiple planets
* complex UI skinning
* high-volume animation work

The first version should prove the mechanic with a **micro asset list**.

---

## 25. Open tuning questions for later playtesting

These are not blockers for implementation. They are tuning questions to revisit after the first playable build exists.

* is the world too small or too large for satisfying self-collision pressure?
* is growth per food too punishing or too weak?
* should straight-up thrust be stronger than diagonal thrust by more than the starting value?
* should the camera zoom out more aggressively at high length?
* do players need visible touch-zone hints on mobile?
* are hazards best kept entirely surface-anchored, or should a later planet introduce floating hazards?
* should score later reflect true geometric length rather than foods eaten? (v1 uses foods eaten as the canonical metric)
* **input inversion at the bottom of the planet:** does playing at the 6 o'clock position feel confusing (CCW = visually rightward)? If yes, first intervention is a subtle on-screen orbital direction indicator, not camera rotation
* **safe neck zone vs tight turns:** 8 samples (96 units) may allow ghosting through the body on a tight U-turn at low speed, or prevent tight turns at high speed; if either is observed, consider linking safe zone length to current speed rather than a fixed sample count
* **minimum orbital speed floor:** is 80 units/s tangential minimum too intrusive or not enough to prevent hover-correction loops?
* **damping feel:** 0.15/s is the starting value; if the serpent feels too slidey and hard to position precisely, increase toward 0.3/s; if it still feels like a hover loop, reduce toward 0.05/s

---

## 26. Final statement

**Jormungandr** should be developed as a disciplined, mechanic-first project.

The game’s promise lies in a distinctive interaction:
**a growing serpent flying around a tiny world until its own success becomes its greatest danger.**

The 80/20 rule is not a side note – it is the production strategy.

Build the smallest version that captures that feeling.
Prove it is fun.
Then expand carefully.
