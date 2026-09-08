# 360dashboards

The real Xbox 360 dashboards, running in a browser. Not a redesign: every
scene, texture, string, sound and animation curve comes from the original
dashboard binaries, decoded by the tools in this repo and rendered by a
TypeScript reimplementation of the XUI runtime.

Two dashboards run: **Blades, build 6770** (the last Blades release, 2008)
and **NXE 9199**, each offline with no profile and no disc, which is the
state the reference captures are in. **Metro 17559**, the last Xbox 360
dashboard, is extracted, parsed and cross-checked through the same pipeline
(XUR v8, XUS v2, XUIZ v3); its runtime is not built yet.

All three are the RETAIL builds. The devkit images in the archive are used
only to prove the decryption: they carry the same dashboard behind a
different key, and their decrypted basefiles are compared byte for byte
against the retail ones.

`PLACEHOLDERS.md` is the honest list of everything on screen that is not the
original, and `LICENSE` and `NOTICE` say what is whose.

## Run it

```
npm install
npm run extract     # Blades 6770; needs the archive + a built xex1tool, see below
npm run extract -- --build 9199   # NXE 9199 (same pipeline, its own registry and counts)
npm run extract -- --build 17559  # Metro 17559 (XUR v8; no runtime yet)
npm run dev         # http://localhost:5173 is the LIVING ROOM: a 2008 front
                    # room, a 34" CRT, and an Xbox 360 on the shelf under it.
                    # Press the console's power button. See ROOM.md.
                    # /?build=6770 opens Blades directly, /?build=9199 opens NXE
npm test            # parser + container unit tests (+ corpus tests for every extracted build)
npm run smoke       # headless-Chrome suites against the dev server
```

Every tool takes `--build 6770|9199|17559` (or `DASH_BUILD=9199`); the
default is Blades 6770. `tools/builds.ts` is the one table of builds, archive
paths and twins.

`npm run extract` expects two things that are NOT in git (they are Microsoft's):

1. `vendor/archive/` — a sparse clone of
   https://github.com/thedev0ps/Xbox-360-Dashboard-Archive:
   `node --import tsx tools/fetch-archive.ts` checks out every build in
   `tools/builds.ts` and its twins (`Blades/Retail/6770`, `Blades/Devkit/6719
   (7776.0 XDK)`, `NXE/Retail/9199`, `NXE/Devkit/9199 (11626.0 XDK)`,
   `Metro/V2/Retail/17559`). Passing paths replaces that list (the tool calls
   `sparse-checkout set`).
2. `vendor/idaxex/xex1tool/build/xex1tool` — emoose's XEX tool:
   `tools/build-xex1tool.sh` (needs `brew install cmake ninja`).
3. Optional, for the genuine typeface: the console's `xenonclatin.xtt` and
   `xenonjklatin.xtt` (ripped from a system update; one public source is
   the Kaceydotme/Convection-Font-for-Xbox-360 release) placed in
   `reference/fonts/xtt/`. `tools/xtt2ttf.py` decodes them; without them
   text falls back and PLACEHOLDERS.md says so.

A fourth input is optional and local: `reference/` holds the video captures
of real consoles that the fidelity measurements are taken against, cut into
frames. It is not in git (it is other people's video and Microsoft's
artwork), and the suites that need it say so and skip when it is absent;
`reference/frames/*-README.md` records which capture each set came from, its
true frame rate and its calibration.

Everything derived from the archive lives under `extracted/<build>/` (the raw
dump, not in git) and `public/assets/<build>/` (the served tree, which is in
git so the site builds from a clone alone; NOTICE says whose that material
is). `npm run extract` reproduces the whole dump and asserts the expected counts (`fixtures/expected-<build>.json`,
including the TOC entry count read from the packs themselves), so a partial
dump cannot pass.

## Controls

A controller works through the Gamepad API with the standard mapping. Without
one, the keyboard maps as: Enter = A, Esc or Backspace = B, X = X, Y = Y,
Q/E = LB/RB (the blade switch), arrows or WASD = d-pad (up and down walk the
scene's own NavUp/NavDown chain; left and right walk a NavLeft/NavRight where
the focused control authors one - 35 scenes in the build do, among them the
clock spinners, the Arcade pages and the media source picker; none of the five
blade pages does, so at home that axis is the blade switch too - A presses
the focused control, B goes back a page, X and Y go to the control carrying
that `PressKey`), Tab = Guide (a no-op, see PLACEHOLDERS.md).

On the System blade the settings pages are driven by console state
(`dashboards/blades/settingsModel.ts`): each option page arrives on the row
of its current value, A writes the setting and pops the page the way
`XuiSceneNavigateBack` does, and the parent's "Current Setting" follows. The
state starts where the reference console's stills put it (every Console
Settings row's value is in `reference/frames/6717/f0053-f0066`), and what no
frame or file settles - the daylight-saving bit, the Family Settings block,
the xam message boxes behind Initial Setup and Background Downloads' Enable -
is left on the code's own failed-read path and reported in
`__dash.shell.hardwareState` / `dialogs`. Routes: `/` is the **living room** — a 2008 front
room built in `app/room/`, with a 34" widescreen CRT on a media console and an
Xbox 360 on the shelf under it, seen from the couch. It is somebody's room and
not a showroom: shelves of plushies, game posters on two walls, a rug with a
border on it, and a mug, a can and a bag of crisps on the table beside the pad.
All of that dressing is procedural and costs four draw calls between it, which
is what `props/kit.ts` is for. Press the console's power
button (click it, or A on the pad) and the ring of light sweeps, the tube warms
up, the camera leans in, and the console's own startup animation — the sphere,
the X, the XBOX 360 wordmark — opens out of the scanline before the dashboard
boots. Three things in that hand-off are measured off a capture of a real
console rather than chosen: the animation's 4.62 s length, the 50 ms cut to
black that follows it, and the fact that the 4.9 s the wordmark holds on real
hardware is the console reading the disc and not animation, so it is cut. The dashboard on
that set is the REAL one: the same DOM tree, at 60 Hz, in a its own DOM layer layer
that the WebGL room is composited over with a hole punched through the glass.
The wheel in the top-left corner chooses which dashboard is plugged in, and it
swaps the build in place without rebuilding the room around it. `ROOM.md` is
the whole of it: the trick, the sequence, the budgets, and the contract an
authored model of the console has to arrive on. Everything in that room is
OURS — no console material anywhere except the dashboard behind the glass — and
`PLACEHOLDERS.md` says so. The rule for which routes get a television is blunt:
**named `room`, or no parameters at all**; everything else is the bare 16:9
stage, so every gate and every judge below is measuring the console's output
and nothing else. `?room=off` says it out loud, `&power=on` arrives at a hot
tube, and `&manual` hands the room's clock to `window.__roomApi.step()`.
`?build=6770`
is the Blades dashboard — it BOOTS, playing `dashmain`'s own `BootLive`
range onto Xbox LIVE the way the console's boot dispatcher does (`&boot=<range>`
picks another of the fifteen, `&boot=none` parks on `DefaultTab`, `&blade=N`
drops straight onto a blade's rest state). `/?scene=<pack>/<file>.xur` renders
one scene, `/?gallery` renders every scene, `&debug` adds the inspector,
`&locale=de-de` applies a localized string table, `&mute` silences cues,
`&frame=N` freezes every timeline at frame N. The default view is the
console's 1280x720 output (the measured anisotropic mapping of the 1120x770
canvas, filling the window uniformly); `&design` shows the raw design canvas
instead.

`?build=9199` serves **NXE 9199** from the same app and the same runtime: the
manifest, the class registry, the skin, the string tables, the audio bank and
the canvas -> framebuffer view all take the build (`packages/runtime/src/build.ts`
is the one table of what differs). `?scene=` and `?gallery` take it too. The
NXE home page is not a scene - `homepage/homepage.xur` is three empty groups -
so `dashboards/nxe/` composes it from `homepage/emb_homepage.xml`, the three
`epix://` channel files and the thirty constants in `controlp/Variables.xur`,
and hangs each slot's `controlpack://PanelScene.xur` clone on a 3D line through
a measured perspective. `&page=<pack>/<file>` hosts an 880x480 Blades-era page
inside the NXE shell instead of the strip
(`&page=consoles/dashSysCslSet.xur` is Console Settings, eight rows from the
table at 0x92016a90). `&channel=<id>` picks another channel; `&hddvd`,
`&mediaroom`, `&live`, `&nowelcome` and `&iptv` flip the console-state
predicates the `<condition>` elements ask about. On that route the pad drives
the strip: left/right move the panel cursor and up/down the channel cursor (the
opposite axis assignment to Blades, and the file's own - `MobyPanelInput*` is
the horizontal axis), A runs the focused slot's `<onclick>` and B pops the page
stack. Navigation is a per-frame velocity integrator over the thirty constants
in `controlp/Variables.xur`, stepped on the timeline's own 60 Hz clock, so
`&manual` plus `__dashApi.stepFrames()` reproduces any position exactly. The
fold behind a page and the unfold in front of it are the same file's own
`From` / `BackTo` ranges (the `SceneTransitions` group animates four
variables the executable reads every frame) plus the executable's per-panel
cascade, both decoded; a channel change is a measured fade
(`dashboards/nxe/transitions.ts`, `physics.ts`, and the runtime README's
section). Rigs are mounted by distance every frame, so every slot of a channel
reaches the front with its scene. NXE scenes are 1280x720 and land 1:1 on the
output, so the Blades view transform does not apply to them - measured, see
`packages/runtime/README.md`.

## On a phone

The whole thing works on a handheld, and it is the same page: no separate
mobile build, no second layout, nothing on screen that the console did not
draw. Three pieces make that true.

**The fit.** `index.html` asks for `viewport-fit=cover` and `.xui-viewport`
takes its four insets from `env(safe-area-inset-*)`, so on a notched phone in
landscape the 16:9 output is letterboxed inside the SAFE box rather than under
the notch. Heights are `100dvh` (the dynamic viewport, which follows a mobile
browser's retracting toolbar) with `100%` as the fallback, the page cannot
scroll or rubber-band (`overflow: hidden` plus `overscroll-behavior: none`),
and the runtime `Viewport` relayouts on `visualViewport` as well as on
`resize`. Measured: iPhone 15 Pro landscape 852x393@3x -> a 699x393 stage,
iPhone SE 667x375@2x -> 667x375, iPad 1024x768@2x -> 1024x576, no scroll on
any of them.

**The rotate ask.** A handheld held UPRIGHT gets our own overlay asking for
landscape (`app/orientation.ts`, styled in the `.rotate` block of
`app/styles.css`). It covers the room and
both dashboards, it is built and destroyed rather than hidden, and it goes as
soon as the device turns. Who sees it is decided by
`matchMedia('(orientation: portrait)')` AND a handheld test - a coarse primary
pointer and a longest edge of at most 1366 CSS px - so a desktop window that
merely happens to be tall never sees it, and no user-agent string is read
anywhere. Where `screen.orientation.lock` exists the overlay offers a button
that tries it inside the tap's own gesture, in a try/catch, and nothing depends
on it working.

**Touch.** `packages/runtime/src/input/Touch.ts` turns gestures into the SAME
`Button` values the pad sends and hands them to the same `InputRouter`, so the
shells, the focus chains, the cues and every gate are untouched and no
on-screen control is invented:

| gesture | what the pad gets |
| --- | --- |
| tap a row or a blade tab | the focus walks to it with real Up/Down (or LB/RB) presses |
| tap the focused row | A |
| swipe left / right | Blades: RB / LB. NXE: the panel cursor |
| swipe up / down | move focus one row (NXE: the channel cursor) |
| two-finger tap, or a swipe in from the right edge | B |

Two taps to commit is deliberate: a finger is 40 px wide and a mis-tap that
fires A is a page you did not ask for. A handled tap swallows the click the
browser would synthesize from it, so nothing double-fires. Every gesture is
recorded in `window.__dash.touch` with the button it sent.

`tests/smoke/smoke-mobile.mjs` is the gate: the three routes at those four
device sizes, no scroll, the stage inside the visual viewport and still 16:9,
the overlay present in portrait and absent in landscape and absent on a tall
desktop window, the taps and swipes asserted through `window.__dash`, and the
compositor budget at phone pixel ratios.

## Stack

- Vite 8 + TypeScript 5.6 strict. One runtime dependency, three.js, and only
  the living room uses it: every `?build=` route still loads no WebGL at all.
- Rendering: the DASHBOARD is DOM + CSS 3D transforms and inline SVG, always,
  on every route — that is the project, and the living room does not change it.
  The ROOM around it is three.js, and the two meet at a hole in the television's
  glass rather than at a texture (ROOM.md).
- Tests: node's built-in runner; smoke suites drive `puppeteer-core` against
  system Chrome and assert on `window.__dash`.
- License: GPL-3.0 (the XUR parser is a port of XUIHelper's V5 and V8
  readers).

## Architecture

```
vendor/archive/.../dash.xex ─xex1tool─▶ extracted/6770/basefile.exe (decrypted PE)
                                      └▶ extracted/6770/resources/<pack>   29 XUIZ packs
extracted/6770/resources/*  ─tools/unpack-xuiz.ts─▶ extracted/6770/xuiz/<pack>/{*.xur,*.png,*.xus,*.xma}
extracted/6770/basefile.exe ─tools/build-registry.ts──▶ packages/xur/extensions/6770/registry.json
extracted/6770/xuiz/**      ─tools/convert-audio.ts, build-manifest.ts─▶ public/assets/6770/{manifest.json,xuiz/,audio/}
```

The same chain runs for NXE with `--build 9199` (`extracted/9199/`,
`packages/xur/extensions/9199/registry.json`, `public/assets/9199/`) and for
Metro with `--build 17559` (36 resources: 35 XUIZ v3 packs, XUR v8 scenes,
XUS v2 string tables, Lua 5.1 bytecode apps, an XACT wave bank; LEARNINGS
"Metro 17559").

- `packages/xuiz` — the XUIZ resource-pack container and `.xus` string tables.
- `packages/xur` — the XUR v5 scene parser: header, STRN/VECT/QUAT/CUST/DATA
  sections, the mask-encoded property block, named frames and keyframe
  timelines; and (`parse8.ts`, behind the same `parseXur`) the XUR v8 reader
  for Metro: packed uints, a twelve-count header, FLOT/COLR pools, shared
  property and compound lists, NAME/KEYD/KEYP keyframes whose flag byte is
  read the way the console's decoder reads it. Browser-safe
  (Uint8Array/DataView only). Also `toXui()`, an XUIHelper-compatible XML
  emitter used only for cross-checking.
- `packages/runtime` — the browser XUI runtime (scene loader, DOM renderer,
  timeline engine, input, audio, strings, inspector).
- `dashboards/blades` — hand-written glue that lived in PowerPC code on the
  console: which scene loads, what buttons do, blade navigation.
- `dashboards/nxe` — the same for NXE 9199, where there is much more of it:
  the XML channel manifest and its `<condition>` predicates, the Epix
  path -> scene binding, the strip constants, the `XuiPerspectiveScene`
  projection, the velocity integrator and fold cascade the strip navigates on,
  the eight navigation cues (played by the glue, not by a timeline), the
  `PanelScene` reflection rig, the `LegendScene` hoist, the `DashBkgnd`/Aura
  background and the `LegacyControl` page stack.
- `tools/` — extraction and reverse-engineering tools (see LEARNINGS.md for
  what each one established).

### Where the dashboard UI actually lives

The dashboard's screens are not code. They are compiled XUI scenes (`.xur`)
embedded in `dash.xex` as 29 named resource packs (`dashmain`, `neon`,
`consoles`, `network`, ...), each an uncompressed `XUIZ` container of
scenes, PNG textures, XMA sounds and localized `.xus` string tables. The
loose `shrdres.xzp` holds the shared icons, sounds and Live strings. The
PowerPC code only decides which scene to show and what to do on a button.

### The class registry comes from the executable

XUR files store properties as bitmasks over each class's property list, in
declaration order, so parsing needs the exact per-build list. Rather than
trust a later build's XML, `tools/xui-propdefs.ts` reads the XUI class
registration code out of the decrypted `dash.xex` (each property record is
built in code: index, name pointer, XUI_PROP_TYPE) and
`tools/build-registry.ts --build <n>` turns that into `registry.json`,
binding each table to its class through the call graph (a registration
calls the function that builds its table and stores the result). For the
50 (6770) / 51 (9199) classes that own properties, name, order and type
come from the binary that shipped; for 17559 it is 313 classes, 70 with
tables, and the 69 classes its scenes use are all registered by its
`dash.xex` (XuiElement registers all 27 there, so no XuiTool tail is
needed). Exceptions are recorded in the registry itself: the scene files write four mask bytes for XuiElement (so XuiTool
knew 25-32 definitions) while both runtimes register 17; definitions 17-26
are taken from XuiTool's own list (XUIHelper's 9199 XML) and tagged
`origin: xuitool-xml` (the builder measures the mask-byte count from the
scenes); one banner class registered outside 6770's dash.xex is marked
`inferred`, and two classes 9199's scenes use but its dash.xex does not
register (XuiVideo, MediaScene) carry XuiTool's definitions with the scene
evidence spelled out. The parser checks every class's mask-byte count
against the registry, so a registry that is too short or too long fails
the sweep (the check proves the definition count to within its group of
eight, and only for classes that set at least one property somewhere in
the corpus). All 263 Blades and 311 NXE scenes parse to the last byte of
their data section with every declared count matching. Where XUIHelper's
hand-written 9199 XML and the 9199 binary disagree, the binary wins
(LEARNINGS.md, "NXE 9199").

## Verification

- `node --import tsx tools/xur2json.ts --corpus extracted/6770/xuiz --strict`
  must print `XUR_PASS 263/263`; with `--corpus extracted/9199/xuiz
  --registry 9199`, `XUR_PASS 311/311`; with `--corpus extracted/17559/xuiz
  --registry 17559`, `XUR_PASS 363/363` (every v8 file carries the count
  header, so all 363 are checked against it).
- `node --import tsx tools/xur2xui.ts --diff extracted/6770/xuiz extracted/6770/xuihelper`
  compares our parse against XUIHelper's (built from source under .NET,
  batch-run by `tools/xuihelper-convert.sh <build>`) on every scene it can
  read: `XUIDIFF_PASS`; the same with `extracted/9199/... --registry 9199`
  and `extracted/17559/... --registry 17559` (363 identical). Every
  normalisation the diff applies is documented in the tool.
- `npm run smoke` runs twelve headless suites serially, including
  `smoke-gallery` (both builds: 263 + 311 scenes, zero unknown classes) and
  `smoke-nxe`, which measures the composed NXE home page and a hosted legacy
  page against their reference stills with the same detector run over both,
  re-derives the perspective fit from its own thirty-two landmarks, drives a
  scripted navigation path a 60 Hz frame at a time (Right/Left, Up/Down, seven
  Rights to "8 of 8", A into System Settings, A into Console Settings, B twice)
  gating the cue ticks, the fold ranges, the queue direction, the metapane text
  and the painted DOM per tick, then measures a channel change, an A, a B, a
  page-over-page swap and a passing panel against the 30 fps cuts of the
  reference captures with the same region traces (skipped, and said so, when
  `reference/frames/<capture>-30fps/` is absent), and mounts the app twice to
  prove the teardown leaves exactly one viewport, one input router, one clock
  and one audio bank.
- `tests/smoke/smoke-mobile.mjs` is the handheld gate: the room and both
  dashboards at iPhone 15 Pro (852x393@3x), iPhone SE (667x375@2x) and iPad
  (1024x768@2x) landscape plus one portrait case, with touch emulation on. It
  asserts no scroll in either axis, the stage inside the visual viewport and
  still the output's own aspect, the rotate overlay present in portrait and
  absent in landscape AND absent on a tall fine-pointer desktop window, a tap
  that focuses and a second tap that presses on both dashboards (through
  `window.__dash`, never pixels), a finger on the console's power button in the
  room — aimed at where the ring of light PROJECTS to on that device, not at a
  hard-coded corner — the swipe axes on both dashboards, B by two fingers, and
  the compositor budget at phone pixel ratios.
- `tests/smoke/smoke-room.mjs` is the living room's gate: that a bare `/` is the
  room and that every route a judge opens is NOT, that the dashboard really is
  mounted inside the television's screen element, that the set starts cold
  and unbooted, every moment of the power-on sequence as a frame count under
  `&manual` (ring, relay, line, bloom, boot, camera), the startup animation on
  the wall clock (it is a `<video>`, so it is the one thing here that cannot be
  hand-stepped) with its cut to black asserted opaque frame by frame, and the
  wheel's in-place build swap with the singleton census after it. ROOM.md is the prose version.
- `tests/smoke/smoke-nav.mjs` section 8 walks the settings pages: every
  Console Settings row's Current Setting against its own 6717 still, the
  option selects (arrival row, the write, the pop with its cue, the parent's
  line), the disabled Display row and its `btn_InactiveSelect`, the clock
  spinners, the rating lists, X/Y, and a painted-token gate on every page it
  reaches. Section 11 sweeps ALL 50 pages the drive reaches and gates two
  things on each: no painted authoring token, searched anywhere inside a
  caption (the old detector was anchored to a caption that is nothing but one
  token, and 19 of the corpus's 211 token controls carry theirs among other
  words - two of them on reachable pages), and no two visible controls
  painting at one authored design box unless the console draws them that way. Section 9 covers the page-level geometry and state: a pushed page's
  header measured in DESIGN pixels on three blades, the page underneath
  measured painted after every pop (against the blank state the suite produces
  on purpose, and against the console's own pop in [FRAME 8498
  f2173-f2181]), the 24-hour clock's hidden AM/PM and the year spinner's
  width, the Display page's hidden switch art, the media picker's two "Please
  wait" labels, `btn_Back` playing exactly where the page binds `PressKey`
  0x5841, and the Time Zone list driven by index through all its wraps.
  Section 10 covers the shell's own chrome: exactly one header and one legend set
  on every blade that pushes a page (the blade's own scene goes away on the
  push, the way `XuiSceneNavigateForward` hides the scene it came from),
  System Info's `edInfo` carrying `dashCSettingsStrings[545]` instead of the
  factory-reset screen's authored prose, LiveVision's three choosers drawing
  ONE value each (a list windows on the axis its template's scroll ends point
  along), and an origin sweep of all 40 System-blade pages with a gate that no
  page paints prose the console's code replaces.
- `PLACEHOLDERS.md` lists the only things on screen that are not the
  original: what the console pulled from Xbox Live, a profile, a disc or the
  hardware itself, each with the console's own offline behaviour and why it
  cannot be reproduced here.
- `LEARNINGS.md` records what the formats and the executables turned out to
  say, with the addresses and the measurements behind each finding.

### NXE 9199: every page the code can reach offline

The NXE shell reaches every page its executable can reach with no profile,
no disc and no network (`dashboards/nxe/pageFocus.ts`, `strip.ts`,
`codeLists9199.ts`, `navigation.ts`):

- A hosted page's rows are its own button controls (any `btn*`, `nav*`,
  `XuiButton`, radio button on the plate and enabled), its arrival focus is
  the scene's `DefaultFocus` / chain head / first row, Up/Down/Left/Right walk
  the authored NavUp/NavDown/NavLeft/NavRight chain, a real move sends
  `KillFocus` and `Focus`, A plays the row's own Press (`btn_Select.xma`) and B
  `legend_b`'s (`btn_Back.xma`). Fifty pages open under System Settings by
  input; every option list is filled from 9199's own tables (Display,
  Language, Locale, Time Zone, Remote Control, Pass code hints), and the lists
  that stay empty say why in `__dash.nxe.codeUnfilled`. A press that would
  write a setting on the console is recorded in `__dash.nxe.codePaths` and
  writes nothing here.
- The home slots: A on the Gamer Card opens the Sign In page (a Moby strip
  under one "Sign In" row, "1 of 2"); A on What's Hot, Xbox Basics, the five
  upsell slots and Games Library opens their root scene with its Rome strip
  (8 / 8 / 5 / 2 panels, `RomeOverlayScene`'s counter, the front panel's
  legend); the `EcNavTo*` bindings are read off the dispatcher's jump table
  at `.rdata` 0x92028ad0. Video / Music / Picture Library and Media Center
  build their page from device state on the console and stay refused with
  the case address. `&page=<root scene>` hosts a root directly.
- X and Y go to the page's control bound by `PressKey` 0x5802 / 0x5803
  (Storage Devices' "Device Options"); every `<...>` authoring token is
  cleared on every page - a token ANYWHERE inside a caption, not only a
  caption that is nothing but one ("<#> of <Total #>", "Uninstall
  <servicename>"), with the console rule that filled each recorded beside it; a whitespace or `Show=false` legend caption draws
  no entry.
- The legend leaves on A at `From` frame 95, not on the press: the
  `SceneTransitions/TransitionSubElements` variable holds a zero across the
  middle of each range and the legend, counter and queue captions are absent
  exactly while it is zero, so the two frames the shell uses are that
  plateau's two edges (95 on `From`, 205 on `BackTo`). Measured against the
  footage the legend now leaves within a 30 fps frame of the console's.
- `tests/smoke/smoke-nxe.mjs` walks all of it and measures Sign In against
  [FRAME Yrt f0268] and the Game Library strip against [FRAME Yrt f0396] and
  [FRAME Kpa f0300]. `SMOKE_NXE_ONLY=completeness` runs the walker alone and
  `=footage` the frame-by-frame comparisons; the board always runs everything.
