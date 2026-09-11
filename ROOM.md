# The living room

`/` is a 2008 front room. A 34" widescreen CRT stands on a media console, an
Xbox 360 sits on the shelf under it, and the camera is on the couch. Press the
console's power button and the ring of light sweeps, the tube warms up, and the
dashboard boots on it.

The dashboard on that television is the REAL one. Not a video, not a texture,
not a screenshot: the same `packages/runtime` DOM tree, at 60 Hz, focusable,
with the same input router and the same measured canvas -> framebuffer
transform it has on the flat route. Everything in this file exists to keep that
true.

## The one trick

```
  WebGL canvas    cabinet, bezel, room, glare        <- alpha-composited over
  picture layer   .room-screen > .crt-picture > .xui-viewport > the dashboard
```

The television's glass is a mesh in the WebGL scene whose material is
`opacity: 0` with `blending: NoBlending`. Blending disabled means the fragment
REPLACES the framebuffer instead of mixing into it, so those pixels end up
`rgba(0,0,0,0)` and the browser shows the DOM through them. It still writes
depth, so anything the room puts in FRONT of the set occludes the picture
correctly, and anything behind it is depth-rejected.

Two consequences, and they are the whole shape of the code:

- **No shader can touch the picture**, because the picture is never in the
  framebuffer. Every CRT artefact on the glass is a CSS or SVG filter on the
  DOM (`app/room/crt.ts`, and the `.crt-face` rule in `app/styles.css`).
- **Anything in front of the glass CAN be WebGL**, because additive blending
  over an already-transparent pixel composites onto whatever the browser shows
  there. That is how the reflection of the window and the lamp gets onto the
  screen (`glareTexture()` in `app/room/screen.ts`).

### The picture is placed by a homography, not by CSS3DRenderer

The dashboard used to be a `CSS3DObject` inside three's `CSS3DRenderer`, which
places things by building a `transform-style: preserve-3d` camera element
carrying `perspective(Npx) translateZ(Npx) matrix3d(camera...)` and letting the
browser do the perspective divide.

**That is painted wrongly on iOS**, where every browser is WebKit, Chrome
included. Measured on an iPhone 15 at 393x659: the screen element's LAYOUT box is
exactly right - `getBoundingClientRect` agrees with Chrome to the pixel - while
the PAINTED result is **0.767 of the correct width and 0.588 of the correct
height, anchored at its bottom-left**. The dashboard sat low in the tube with its
bottom cut off. Moving the perspective off the transform function list and onto
the parent as the CSS `perspective` property fixed the horizontal axis exactly
and left the vertical exactly as wrong, so there was no small change to
`CSS3DRenderer` that rescued it.

`app/room/project.ts` replaces it. The picture is ONE flat rectangle, so its four
corners are projected with the same camera the WebGL room uses, and those four
points define a **homography** from the element's own 1280x720 box to the quad
the glass occupies. A homography is expressible as one transform on the element
itself - so there is no perspective ancestor, no `preserve-3d`, and no renderer.
It is exact rather than an affine approximation: the trapezoid an off-axis
camera makes is carried by the perspective terms. Pointer events still land,
because the browser inverts the transform for hit-testing the same way.

**How it is SPELLED matters, and this cost a round (2026-09-11).** The obvious
encoding is a single `matrix3d` with the perspective in its fourth row (`m14`,
`m24`), and that is what shipped. Chrome's GPU rasteriser paints that wrongly:
the blades came out sliced into horizontal bands, shifted and missing, and the
bands moved with the pointer parallax, so it read as flicker - locally and in
prod, and on any non-zero w term (measured down to 1e-7, a hundredth of a pixel
of trapezoid). Under `--disable-gpu-rasterization` or software compositing the
same page was pixel-clean, and nothing in the subtree changed it: not blend
modes, filters, `will-change`, `isolation`, or flattening. What Chrome does
handle is the `perspective(d)` FUNCTION followed by a matrix with a z-row and no
w-row of its own, so `project.ts` factors the same homography as
`perspective(d) * M` with `M` putting the point at `z = -d(Gx + Ky)`: the
divide is then by exactly `1 + Gx + Ky`, the homography's own `w`. `d` is
arbitrary (1000 px; it only sets how many px of z the plane tilts through) and
it is not the camera's focal length. Verified clean on Chrome's GPU path and in
the iOS Simulator.

Two things about the element are load-bearing and are in `app/styles.css`:
`.room-screen` is **absolutely positioned at the layer's origin** with
**`transform-origin: 0 0`**. A `relative` box or a centred origin moves the
picture off the hole.

**How this is gated.** Nothing else in the suite could have caught it: every
assertion about the hole is about the WebGL side, and the element's layout box
is correct even when the picture is painted somewhere else entirely. So
`smoke-room` asks the room for `screenFit()` - the quad the room projects the
glass to, and the box the browser gives the element - and requires them to agree
within 1.5 px. Verified to fail by perturbing one projected corner by 14 px.

That gate could not see the Chrome raster bug either - the box was right while
the pixels were wrong - so `smoke-room` also renders the lit screen twice, on
the GPU raster path everybody's Chrome uses and with
`--disable-gpu-rasterization`, and requires the two to agree (NCC >= 0.99).
Geometry is identical by construction, so disagreement is a raster bug and not
a tolerance. It reads 0.9998 on the `perspective()` form and 0.66 on the w-row
`matrix3d`.

## Routes

| URL | What you get |
|---|---|
| `/` | the room, cold set, camera on the couch |
| `/?room&build=9199` | the room with NXE plugged in (what the wheel writes) |
| `/?room&power=on` | arrive with a hot tube, no sequence and no startup animation |
| `/?room&startup=off` | the sequence, but straight to the dashboard |
| `/?room&mute&manual` | silent, and the room's clock stepped by hand |
| `/?room=off` | the bare 16:9 stage |
| `/?build=6770`, `/?blade=5`, `/?boot=none`, `/?gallery`, `/?scene=` | the bare stage |

The rule is blunt on purpose: **named `room`, or no parameters at all.**
Everything else is flat. Every suite and judge in this repo opens URLs like
`/?blade=5&zoom=1.5&mute&manual` with no `build=`, and a rule that read "flat
only when a route parameter says so" quietly turned all of them into living
rooms - which is a screenshot gate measuring a 328x2 picture against a
1920x1080 reference frame, and a nav gate reading "first load must play a boot
range, got null" because the room HOLDS the boot until the tube is warm.

## The television

`public/room/crt-tv.glb`, a Magnavox-style CRT/DVD/VHS combo built by the
img2threejs pipeline in this workspace. It is the only model in the room that
needed no measure-and-fit block, because it was authored against the room's own
constants: **its y=0 is the stand's top face, its z=0 is the GLASS PLANE - not
the cabinet face - and its +Z is the couch.** Placing it is
`tv.position.set(0, STAND.h, SCREEN.z)` at scale 1.

It carries the five constants it was cut against in
`sculptRuntime.screenOpening.roomAssert`, and `assertOpening()` compares them at
load. That check is cheap and worth it: if `SCREEN` or `STAND` move and the model
does not, the aperture stops matching the picture, and the failure is silent and
purely visual - a hairline of room around the dashboard, or a cropped edge.
Nothing in the suite compares pixels, so nothing else would catch it.

`SCREEN.z` is a LITERAL now and must stay one. It used to be derived as
`ROOM.back + 0.06 + CAB.d` from the procedural cabinet's 0.60 m depth; the
authored set is 0.640 deep and grows BACKWARDS from the same glass plane, so
re-deriving it would walk the picture 40 mm forward and take the camera poses,
the glow light and the whole aperture fit with it.

The model contains no glass, hole, glare, scanlines, grille or vignette. Every
one of those is the room's own (see the trick above and `crt.ts`), and a
modelled copy would double the artefact. The procedural cabinet and its four
bezel bars are kept as the stand-in behind the loader's silent error path.

## Nothing is shown until it is real

Every prop in this room is built TWICE: a stand-in of the right size, and the
authored model that replaces it when it arrives. That is the right way round for
robustness - a failed fetch leaves a television rather than a hole - but it means
the first second of the room would be a white box on a shelf, a white slab on a
table and a grey cabinet, followed by three pops.

So one `THREE.LoadingManager` is shared by every model and texture the room
fetches, `room.whenLoaded` resolves when it drains, and `loading.ts` covers the
page until it does. `document.body.dataset.ready` is set AFTER that on this
route, so a screenshot taken the moment the page says it is ready is of the
finished room - which also removes a class of flake from the gates.

`whenLoaded` always resolves. An asset that 404s or will not decode still ends
its item on the manager, so the room opens with the stand-in in place of whatever
failed, which is exactly what the stand-ins are for; and a request that never
answers at all is capped at 12 seconds, so nobody is ever trapped on a loading
screen. The screen is REMOVED rather than hidden - a full-bleed element left in
the document is a compositor layer, and smoke-mobile counts those.

## The power-on sequence

Timed in seconds from the button, in `app/room/crt.ts`'s `WARMUP`. Under
`&manual` it is stepped by `window.__roomApi.step(dt)`, so every moment below
is a frame count and not a wait.

| t | what happens |
|---|---|
| 0.00 | the ring of light starts a clockwise sweep, one quadrant every 0.075 s |
| 0.30 | the relay: the tube goes live and the glass becomes a hole |
| 0.42 | the beam arrives before the vertical deflection does - one bright line across the middle |
| 0.44 | **the console's startup animation starts**, behind the line |
| 0.52 - 0.78 | deflection comes up and the line opens onto an animation already running |
| 0.78 - 1.53 | the beam limiter catches up and the overshoot decays |
| 0 - 1.60 | the camera dollies 2.96 m -> 1.45 m and the lens narrows 54 deg -> 25 deg |
| 5.06 | the XBOX 360 wordmark has settled; it holds |
| 6.25 | **50 ms of black** |
| 6.30 | the dashboard's own boot range (`BootLive`) |

The animation starts BEFORE the bloom, not after. A console starts the instant
the button is pressed and the television takes about a second to catch up, so
on real hardware the tube opens onto an animation that is already running.
Firing it after the bloom put a settled picture on screen for half a second and
then started it, which reads as a glitch.

### The startup animation

`public/room/xbox360-startup.mp4` — the sphere, the X flare, the pull back to
the ring, the XBOX 360 wordmark, and the chime. It is NOT from the archive and
cannot be: the animation lives in the console's flash, and no video container of
any type is in any of the three dumps. It is a capture of a real console,
re-encoded to H.264 at the console's own 1280x720 (the source was AV1, which
Safari and pre-M3 Macs will not decode). NOTICE and PLACEHOLDERS.md say whose it
is and what was cut.

It plays as a `<video>` in the picture layer, like everything else on this glass,
so the warm-up squashes, wobbles and over-brightens it exactly as it does the
dashboard — for those six seconds it IS the picture, and `crt.ts`'s `beam` list
is what makes one transform drive both.

Three things were MEASURED against `reference/video`'s capture of a real console
booting to blades (RUlH, 60 fps), rather than chosen:

- **The animation runs 4.62 s**, to the frame where the wordmark snaps in.
  Per-frame motion peaks at t=1.00 (the X flare) and t=4.50 (the ring) and is
  flat by t=4.75. Our clip settles at 4.62 s too, which is what says the capture
  is genuine and unstretched.
- **The hand-off is a cut to black, not a dissolve**: exactly three frames of
  video black (Y=16) at t=9.650, 9.667 and 9.683, with the wordmark on the frame
  before and `BootLive`'s first frame after. 50 ms, and `BLACK_MS` in `crt.ts`
  is that number.
- **The 4.9 s the wordmark holds after that on real hardware is LOAD TIME**, not
  animation — the console reading the dashboard off the disc. Ours is already
  loaded, so the clip is trimmed to a 0.9 s hold. The black is reproduced; the
  waiting is not.

It can always fail, and failing must never leave you behind a black tube: a
missing file, a codec the browser will not take, or a blocked autoplay all hand
straight over to the dashboard at `WARMUP.boot`, which is where it took the tube
before the animation existed. `__room().startup` reports which happened —
`playing`, `black`, `done`, `skipped`, `unavailable`. Autoplay is why the sound
is conditional rather than the picture: a press of the power button is a user
gesture, so a person hears the chime, and a scripted press falls back to a muted
clip rather than to no animation at all.

## The wheel

Top-left corner. It replaces the launcher, which was a web page you passed
through on the way to a dashboard - and once the dashboards run on a set in a
living room there is nowhere for a page like that to be.

Its hub is a COG, because a dial reads as a tuner and a cog is the one shape
everyone already knows opens the options. Its entries are laid out at equal
VERTICAL spacing on a circular arc - the y of each is a fixed step and the angle
is solved for it - because equal ANGLES on a quarter circle space the top pair
86 px apart and the bottom pair 55, which survives three entries and overlaps at
four. The spokes carry no `backdrop-filter`: it promotes each one to its own
compositor layer whether the wheel is open or shut, and a fourth entry took the
room to 25 layers against smoke-mobile's budget of 24.

The last entry is not a dashboard. **Power off** turns the console off from the
same place you choose what runs on it, so the way out is where the way around
is; its label is the action rather than the state, and powering back on replays
the startup animation, because a console does.

It swaps the build IN PLACE: the tube collapses back to its line, the other
dashboard is built behind it, and the tube blooms again. Nothing else in the
room moves. That works because `main.ts` has two disposer scopes - the room and
the page furniture in one, a dashboard's viewport, input router, audio bank and
clock in the other - and `mountDashboard()` opens the dashboard scope around
its dispatch. `window.__dash.hmr` is the census that proves it: one viewport,
one router, one audio context, one clock, however many dashboards the page has
had. `tests/smoke/smoke-room.mjs` asserts all five.

## What is authored where

Procedural, in code, to real furniture dimensions - `app/room/`:

| file | what |
|---|---|
| `constants.ts` | every measurement of the room, the set and the two camera poses |
| `Room.ts` | the two renderers, the camera, the lights, the power state machine |
| `screen.ts` | the television, the convex glass, the hole, the glare |
| `crt.ts` | the warm-up: the line, the bloom, the overshoot, the degauss wobble, and the measured 50 ms cut |
| `startup.ts` | the console's startup animation and its hand-off to the dashboard |
| `wheel.ts` | the corner control that chooses the dashboard |
| `loading.ts` | the screen you look at while the room is still boxes |
| `props/shell.ts` | floor, ceiling, four walls, baseboard |
| `props/stand.ts` | the media console, and the Xbox 360 socket (below) |
| `props/furnishings.ts` | couch, coffee table, controller, the two games, the woven rug, lamp, window and blinds, the posters and the framed print |
| `props/kit.ts` | how to put fifty small things in a room for the price of one draw call |
| `props/dressing.ts` | the wall shelves and the plushies on them, the table clutter, the stand's cubby |

## What is on the table

A controller and two games, and **no cable anywhere in the room**. The 360's pad
is wireless; the console's own mains lead went with the pad's, because it had
been authored for a console lying flat on the shelf and started from a point in
mid air once the model stood the console up.

The controller is a third party's model under CC-BY-SA-4.0 (NOTICE has the
attribution and, importantly, the note that ShareAlike is stricter than the
console model's plain CC-BY). Two things about it needed doing:

- **The shell repainted white**, and only the shell. Its body is a black
  texture, so a white `baseColorFactor` cannot lift it - the atlas itself is
  edited. The obvious rule is saturation ("a pixel with no colour in it is
  plastic"), and it is wrong: the thumbsticks and the d-pad are black too, and
  the whole pad went white. What separates them is that they are separate UV
  ISLANDS, and which island is which was read off a render of the model with
  the island map painted onto it - the shell is one big island plus its rim,
  back and top, while the sticks, the d-pad and the guide button are each their
  own. `scratchpad/gltf/islands.mjs` labels the atlas and writes the mask;
  `pad.mjs` repaints through it.
- **The material's fiction taken off it.** The export carried
  `KHR_materials_transmission` at `transmissionFactor: 1.0` (transmission is for
  glass - on a controller it makes the body a window), `alphaMode: BLEND` and
  `doubleSided` on opaque plastic, and `metallicFactor: 0.994`, which is a
  chrome controller.

**Standing it up straight is measured, and assuming cost two rounds.** The model
is not axis-aligned: its mesh node carries a rotation of (63.3, 4.2, -10.9)
degrees. "It is Z-up, so turn it -90 about X" gets the face roughly upward and
leaves the pad tilted **17.55 degrees off level**, which on a coffee table reads
as exactly what it is - a controller that will not lie down. And the first
attempt at that flip was paired with the wrong yaw, which lays the battery pack
face up instead; four candidates rendered side by side from the couch's own
angle settle that in one look, because the green guide logo is either showing or
it is not.

So the conversion measures it. It takes the AREA-WEIGHTED average normal of the
pad's face - area-weighted because a face is a few big triangles and a hundred
small ones around the buttons, and an unweighted average is a vote by
tessellation density rather than by surface - and rotates that vector onto +Y,
then sits the result on y=0 with its footprint centred. One trap inside that:
`flatten()` leaves a node's own transform on the node, so measuring the normal
off the raw POSITION data measures it in a space the scene never uses. It read
10.4 degrees where the world had 17.55, and reported the pad as
42.9 x 47.1 x 23.8 "metres". `clearNodeTransform` first.

The file therefore arrives Y-up, axis-aligned and resting on the origin -
0.1889 wide x 0.0878 thick x 0.1457 deep - and placing it in the room is a
position, one scale of 0.8205 onto the retail pad's 0.155 m width, and a yaw.

**The pad is the other power button.** A click on the controller starts the
console exactly as a click on the console does - reaching for the pad is what
anybody actually did, and a room whose only start is to lean down and press the
box reads as a puzzle. Its own ring and logo are DARK until the console comes
on, the way a wireless pad is dark until it binds to one; that is one number
(`setPadLit`) on the emissive map the model already carries, which is black
everywhere except the ring and the logo.

Then two game cases, stacked and offset: Halo 3 on top, Modern Warfare 2 under
it.
Each is a 190 x 135 x 14 mm DVD case - the one the console shipped in - in its
own translucent green, with the cover on the TOP face because it is lying flat.
That is one material out of the box's six, so the stack reads as green from the
side and as cover art from the couch.

Two things about the arrangement are not decoration. The top case is offset
30 mm across and 40 mm back as well as turned, because two cases squared up hide
the lower cover completely and nobody stacks anything squarely on a coffee
table. And everything on the table sits on its BACK half: from the couch the
table's near edge IS the bottom of the frame, so a prop on the near half is cut
in two by it, which is where the games were first put.

The covers load asynchronously and the case is built before they arrive, so a
cover that never loads leaves a plain green case rather than a hole. NOTICE and
PLACEHOLDERS.md record whose artwork it is and what was cropped.

## The Xbox 360 on the shelf

`public/room/xbox360.glb`, a third party's model under CC-BY-4.0. NOTICE credits
the author and lists every change made to the file. It STANDS in the stand's
cubby, which is how it is modelled and how most of them lived: the cubby is
0.40 m of clear height and the console is 0.309 m, so it goes in upright with
its front face looking straight out at the couch.

**Fitting it is four measured numbers**, in `XBOX` in `props/stand.ts`. The
model does not arrive on any contract - it has its own origin, its own scale and
no named nodes at all:

- **Bounds 0.16743 x 0.59154 x 0.51885**, walked vertex by vertex in world
  space. Do NOT read `geometry.boundingBox` here: GLTFLoader fills it from the
  accessor's min and max, which are in QUANTIZED units after the meshopt pass,
  and it reports a near-cubic 0.49 x 0.59 x 0.59 for an object that is
  obviously tall and thin.
- **One uniform scale, 0.522363**, which makes it 0.309 m tall and puts the
  other two axes at 0.0875 and 0.2711 against the retail casing's 0.083 and
  0.258. Within 5% on all three is what says the model is honest and the scale
  is one number and not three.
- **An origin offset**, because its origin is not its footprint centre.
- **+Z is its front face.**

### The console lights its own ring

The ring of light is real modelled geometry - a recessed annulus around a raised
disc - not a detail painted into the texture. An untextured, flat-shaded render
of the front face under a raking light shows the dish and its walls with no map
on the material at all, which is what settles it.

So nothing is laid over the model. `splitRing()` selects the annulus's triangles
by where they sit - a radial band 0.0205 to 0.0465 on the flat face at the ring,
no deeper than the dish - and rebuilds the mesh's index buffer into five
CONTIGUOUS runs, which is what a geometry group is: the body, then the four
quadrants clockwise from the top-left. Each quadrant gets a clone of the model's
own material and differs from it only in emissive, so it keeps the console's
colour, roughness and normal map.

Two traps in that, both of which cost a round:

- **The face is CONCAVE.** The z of the flat surface at the ring is 24 mm behind
  the neighbourhood's furthest-forward point, which is out at the edges.
  Measuring "how deep is this triangle" against the wrong plane threw the entire
  annulus away and selected nothing.
- **A centroid does not find the ring.** The vent grille is a few centimetres
  away and every one of its holes has walls whose normals look exactly like the
  dish's, so the centroid of "triangles whose normal is not facing the viewer"
  lands 46 mm off the ring. The verification render caught it immediately, which
  is the argument for drawing the classification in a colour rather than
  trusting the numbers.

### Cost

186,732 triangles, kept at FULL detail: it is the object the whole route asks
you to walk up to and press. It costs one draw call (the four meshes in the
export shared one material and were joined), and the room holds 16.6 ms a frame
at 1600x900 at devicePixelRatio 2 - which is vsync, not the GPU. It does not
cast a shadow: it stands in a cubby already inside the stand's own shadow, so
the shadow is invisible, and casting it means drawing all 186,732 triangles a
second time into the shadow map.

### Re-encoding it for the web

19.39 MB became **1.84 MB with no geometry loss at all**, because the size was
never the triangles. The Sketchfab export carried FIVE UV sets per vertex, all
byte-identical, with the material pointing at three different ones; plus vertex
tangents. Repointing the material at `TEXCOORD_0`, deleting the four copies and
the tangents, joining the four meshes, re-encoding the textures to WebP at the
same 1024x1024, and quantizing + `EXT_meshopt_compression` did the rest. The
source is `reference/models/` (not in git, like the video captures) and the
recipe is `scratchpad/gltf/lean.mjs`.

Loading it needs `MeshoptDecoder`, which ships with three
(`three/examples/jsm/libs/meshopt_decoder.module.js`).

## Dressing the room

The room started as a box with a television in it, and it read as one: beige
walls, an empty coffee table, and a rug three shades off the floor that nobody
could find the edge of. What it has now - two wall shelves of plushies, three
game posters, a mug and a can and a bag of crisps, a filed row of games in the
media console's empty cubby, and a rug with a border on it - is all in
`props/dressing.ts`, and it costs **four draw calls in total**.

That is the whole design, and it is in `props/kit.ts`. Built the obvious way, a
plushie is a mesh per ear, per eye, per paw: about 120 meshes and 120 draws
across four toys, for maybe 7,000 triangles. No GPU made this century would
notice the triangles; the DRAWS are what actually blows a frame budget. So each
little primitive gets its colour as a **vertex attribute**, its transform baked
into its vertices, and the whole pile is merged into one geometry drawn with one
material. Everything on the shelves is two meshes; everything on and under the
table is two more.

The cost of the trick is that everything in one kit shares a **surface** - one
roughness, one metalness - which is why there is a soft kit and a hard kit
rather than one big one. Felt and painted plastic do not reflect alike, and the
difference between them is most of what makes a plushie read as a plushie. Group
by material, not by object.

Three things learned by getting them wrong, in case they come up again:

- **A vertex colour is LINEAR.** It is multiplied into the material's colour
  before any output transform runs, so it has to be written through
  `Color.setHex()` rather than as raw bytes. Get it wrong and the clutter is
  washed out next to everything else in the room, and it looks like a lighting
  bug rather than a colour-space one.
- **The table is the horizon for anything on the floor.** A sightline from the
  couch grazes the tabletop at y 0.439, so a case dropped on the rug at z 0.06
  clears the floor by 26 mm and is, from the only angle anyone ever looks from,
  entirely behind the table. Work out where the table's silhouette actually
  falls before placing anything low.
- **A silhouette is not enough at 40 px.** The bag of crisps was a rounded red
  box and read as a brick. What makes a bag a bag at that size is the horizontal
  label band across it, not the shape.

The plushies are proportional rather than measured: every part is a fraction of
one overall height, so a big one and a little one are recognisably the same kind
of toy. Nothing in this file is randomised - every position, angle and colour is
a literal - because a room that reshuffles itself on reload is a room no
screenshot gate can check.

## Budgets and gates

`tests/smoke/smoke-room.mjs` holds the room to **240 draw calls and 300,000
triangles**, and asserts the hole, the cold set, every moment of the sequence,
the wheel's swap, the singleton census, that every served asset returns 200 and
that the procedural dressing is actually in the scene graph. It is on the board
in `tests/run-all.mjs`.

**The asset check asserts the content type, not the status, and it has to.**
Vite's dev server answers an unknown path with the SPA fallback: a `GET` for a
file that is not there returns **200 text/html**, the contents of `index.html`.
So the version of this check that only looked for "200" could not fail for any
asset - deleting a poster and re-running it passed. What separates a served
asset from the fallback is the content type. The same shape of mistake is worth
watching for anywhere else in this repo that a fetch is used to prove a file
exists.

Where the numbers go: about 187,000 of those triangles are the authored Xbox 360
and another 27,000 the controller, for one draw call each. The whole rest of the
room - shell, furniture, shelves, plushies, clutter, posters - is under 20,000
triangles and about 25 draws.

**Read the triangle number as SEVEN times the geometry, not two.** The room's
only shadow-casting light is a `PointLight`, and a point light's shadow map is a
CUBE: every casting mesh is drawn six more times, once per face. That is why one
1,800-triangle plushie put 13,000 triangles a frame on the counter the first
time it went in, and it is the whole explanation for a budget that otherwise
moves in steps nobody can account for. `Kit.build()` therefore defaults
`castShadow` to FALSE and it is turned on deliberately, for the things whose
shadow is doing work: a floating shelf board needs the dark line under it, a mug
on a table needs to be standing on the table, a toy three metres away on a shelf
does not.

The room is a box with furniture in it, not a game. If those budgets ever need
raising, something has been modelled that did not need to be.
