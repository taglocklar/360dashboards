// The living room: two renderers over one camera, and a clock that drives both.
//
// Layer order in the page (see the `.room` block of app/styles.css):
//
//   .room  > .room-css3d   the CSS3DRenderer's layer, holding the dashboard
//          > canvas.room-gl  the WebGL room, ON TOP, with a hole in the glass
//
// The canvas takes no pointer events. Everything - a click on the console's
// power button, a drag, a tap on the picture - lands on `.room` or on the
// dashboard's own element underneath, and the room raycasts from there. That
// is what keeps the dashboard's real input path (InputRouter, Touch.ts) intact
// inside a 3D scene it knows nothing about.
import * as T from 'three';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { CAMERA, ROOM, SCREEN } from './constants';
import { buildShell } from './props/shell';
import { buildScreen } from './screen';
import { buildStand } from './props/stand';
import { buildCouch, buildLamp, buildRug, buildTable, buildWallDressing, buildWindow, type Prop } from './props/furnishings';
import { WARMUP } from './crt';

export interface RoomOptions {
  /**
   * Called once, when the DASHBOARD should take over the tube.
   *
   * That is after the console's startup animation and its measured 50 ms of
   * black - not at a fixed moment in the warm-up. Where there is no animation
   * to play (`startup: false`, `manual`, or a missing or undecodable file) it
   * falls back to WARMUP.boot, so a route can never hang behind a black tube
   * waiting for a video that is not coming.
   *
   * The room does not know what a dashboard is; main.ts hands it a
   * shell.boot().
   */
  onPictureLive?: () => void;
  /** Where public/ is, for the startup animation's source. */
  base?: string;
  /** Play the console's startup animation. Off for `&startup=off`, and off in
   *  `manual`, where a <video> element's own clock is not steppable and would
   *  make every gate a race. */
  startup?: boolean;
  /** Build no AudioContext and play no sound: `&mute`. */
  muted?: boolean;
  /** Do not run a wall clock: render only when step() is called. What the
   *  smoke suite uses, the same way `&manual` freezes the dashboard's own
   *  60 Hz clock. */
  manual?: boolean;
}

export interface Room {
  /** Where the dashboard mounts: 1280x720 CSS px on the television's glass. */
  screenHost: HTMLElement;
  /** Press the console's power button: the ring of light sweeps, the tube
   *  warms up, the camera pushes in and onPictureLive fires. Idempotent while
   *  a sequence is already running. */
  setPower(on: boolean): void;
  readonly powered: boolean;
  /** Arrive already on and already settled, with no sequence to play. What
   *  every screenshot gate and every deep link wants. */
  snapPowered(): void;
  /** Advance by exactly this many seconds and draw once. Deterministic. */
  step(dt: number): void;
  /**
   * Change what is plugged into the television.
   *
   * The picture collapses back to the line it opened out of, `swap` runs
   * against a dark tube, and the tube blooms again onto whatever `swap` left
   * behind. That is what a CRT does when the input changes, and it is why the
   * wheel can put a different dashboard on the same set without the room
   * blinking out and coming back.
   *
   * Concurrent calls are refused rather than queued: two of these interleaved
   * would run one swap's bloom over the other's collapse.
   */
  changeInput(swap: () => Promise<void>): Promise<boolean>;
  /** The element the wheel and anything else that is OURS is mounted into:
   *  over the room, never inside the CSS3D layer. */
  overlay: HTMLElement;
  dispose(): void;
  /** What the smoke suite asserts on. */
  report(): RoomReport;
}

export interface RoomReport {
  powered: boolean;
  /** Camera pose, so a suite can prove the push-in ran without a screenshot. */
  camera: { x: number; y: number; z: number; fov: number };
  /** 0 at the couch, 1 at the glass. */
  pushed: number;
  /** Seconds since the power button, or -1 with the set off. */
  warm: number;
  /** How many quadrants of the ring of light are lit. */
  ring: number;
  /** The console's startup animation: idle, playing, black (the measured cut),
   *  done, skipped, or unavailable (no file, or the browser cannot decode it). */
  startup: string;
  /** Whether the controller's own ring and logo are lit. */
  padLit: boolean;
  /** Whether the shelf is holding the authored Xbox 360 or the stand-in box.
   *
   *  A FACT, not a statistic. The obvious way to ask is "are there more than
   *  150,000 triangles in the last frame", and that is wrong: `draws` and
   *  `tris` are read off the renderer's last render, and under `&manual` the
   *  room renders once at build time - before a model fetched over the network
   *  can possibly have arrived. It would have said "stand-in" forever. */
  console: 'model' | 'stand-in';
  /** Draw calls and triangles in the last frame: the room's budget. */
  draws: number;
  tris: number;
  /** The hole is only a hole when the picture is on. */
  glass: 'mirror' | 'hole';
}

/** What the smoke suite drives. `step` is the whole reason `&manual` exists:
 *  a warm-up measured in wall-clock seconds is a flake, and a warm-up stepped
 *  by a fixed dt is a frame number. */
export interface RoomApi {
  report(): RoomReport;
  step(dt: number): void;
  setPower(on: boolean): void;
  snapPowered(): void;
  /** Press the power button the way a click on the console does, without one:
   *  what a suite uses when it does not want to compute where the console is
   *  on screen. */
  press(): void;
  /** Where the ring of light is, in CLIENT pixels. A touch suite taps this: it
   *  is the only honest way to test that a finger on the console turns it on,
   *  and it moves with the camera so it cannot be hard-coded. */
  powerPoint(): { x: number; y: number };
  /** The same, for the controller on the table - the OTHER thing a press of
   *  power can land on. */
  padPoint(): { x: number; y: number } | null;
}
declare global { interface Window { __room?: () => RoomReport; __roomApi?: RoomApi } }

export function buildRoom(host: HTMLElement, opts: RoomOptions = {}): Room {
  const el = document.createElement('div');
  el.className = 'room';
  host.appendChild(el);

  const scene = new T.Scene();
  scene.background = new T.Color(0x0b0c0e);

  const camera = new T.PerspectiveCamera(CAMERA.idle.fov, 16 / 9, 0.05, 60);
  camera.position.set(...CAMERA.idle.pos);
  camera.lookAt(new T.Vector3(...CAMERA.idle.target));

  // ------------------------------------------------------------- renderers
  const gl = new T.WebGLRenderer({ antialias: true, alpha: true });
  // Opaque clear: the ROOM is solid and only the glass is allowed to be a
  // hole. A transparent clear would show the page's background everywhere the
  // room does not draw, which on a window wider than the room is the sides.
  gl.setClearColor(0x0b0c0e, 1);
  gl.setPixelRatio(Math.min(devicePixelRatio, 2));
  gl.toneMapping = T.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.05;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = T.PCFSoftShadowMap;
  gl.domElement.className = 'room-gl';
  el.appendChild(gl.domElement);

  // Ours, not the room's and not the dashboard's: the wheel lives here, over
  // both renderers, outside the CSS3D transform so it is a flat 2D corner of
  // the WINDOW rather than a poster on a wall.
  const overlay = document.createElement('div');
  overlay.className = 'room-overlay';

  const css = new CSS3DRenderer();
  css.domElement.className = 'room-css3d';
  el.appendChild(css.domElement);
  // The CSS layer is BENEATH the canvas in paint order but FIRST in the
  // document, so the canvas has to be moved back on top after it - and the
  // overlay after that, because it is the only thing here a pointer is meant
  // to be able to reach directly.
  el.appendChild(gl.domElement);
  el.appendChild(overlay);

  // ----------------------------------------------------------------- world
  const shell = buildShell();
  scene.add(shell.group);
  const base = opts.base ?? '';
  const tv = buildScreen(base);
  scene.add(tv.group);
  scene.add(tv.css);
  const stand = buildStand(base);
  scene.add(stand.group);

  const lights = addLights(scene);
  // The furniture. Built AFTER the lights, so the lamp and the window are put
  // exactly where their light already is - a shade with no bulb in it and a
  // bulb with no shade around it are the two halves of the same bug.
  // The table is held by name as well as in the list: the room does two things
  // with the controller on it, and both need a handle.
  const table = buildTable(base);
  const props: Prop[] = [
    buildRug(), buildCouch(), table, buildWallDressing(base),
    buildLamp(lights.lampPos), buildWindow(lights.windowPos),
  ];
  for (const p of props) scene.add(p.group);

  // -------------------------------------------------------------- the push
  // One scalar drives the whole move: 0 is the couch, 1 is the glass. Every
  // pose value is a lerp of it, so there is exactly one thing to ease and one
  // thing for a suite to read.
  let pushed = 0;
  let powered = false;
  // Seconds since the power button was pressed. -1 while the set is off, so
  // "has the sequence started" is one comparison and not a nullable.
  let warm = -1;
  let bootFired = false;
  let ringLit = 0;
  const playStartup = (opts.startup ?? true) && !opts.manual;
  // While an input change is running, step() must not also advance `warm`:
  // the collapse animates it downward and the two would fight.
  let swapping = false;
  let padLit = false;
  const idlePos = new T.Vector3(...CAMERA.idle.pos);
  const viewPos = new T.Vector3(...CAMERA.viewing.pos);
  const idleTarget = new T.Vector3(...CAMERA.idle.target);
  const viewTarget = new T.Vector3(...CAMERA.viewing.target);
  const tmpPos = new T.Vector3();
  const tmpTarget = new T.Vector3();
  // Pointer parallax, in the -1..1 box of the window.
  const lean = { x: 0, y: 0 };
  const leanTo = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    leanTo.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    leanTo.y = ((e.clientY - r.top) / r.height) * 2 - 1;
  };
  // onHover raycasts, so it cannot be built until the scene is; this forwards
  // to it once it is, and stays the identity the listener was added with so
  // dispose() can actually remove it.
  let onHoverRef: ((e: PointerEvent) => void) | null = null;
  const onMove = (e: PointerEvent) => (onHoverRef ?? onPointer)(e);
  el.addEventListener('pointermove', onMove);

  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  /** The most of the frame's width the picture is ever allowed to take. Only
   *  reached on a window narrower than 16:9; see applyCamera. */
  const MAX_FILL = 0.86;

  // ------------------------------------------------------- the power button
  // A click on the console presses power. The WebGL canvas takes no pointer
  // events (`.room-gl { pointer-events: none }`), so this listens on the room
  // itself and raycasts - which also means a click that lands on the DASHBOARD
  // never gets here, because the picture's own element is above the room in
  // the CSS3D layer and stops the event there.
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const hitsConsole = (e: PointerEvent): boolean => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    // The console is an authored model that arrives asynchronously, and a
    // raycast reads matrixWorld. Under the live clock the loop refreshes those
    // every frame; under `&manual` the room renders once at build time and the
    // model lands AFTER it, so its matrices were still identity and every tap
    // on the console missed. Cheap, and correct in both modes.
    scene.updateMatrixWorld(true);
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // The CONSOLE or the CONTROLLER. Reaching for the pad to turn the console
    // on is what anybody actually did, and a room where the only way to start
    // is to lean down and press the box is a room that reads as a puzzle.
    return ray.intersectObjects([...stand.hitTargets, ...table.padTargets], true).length > 0;
  };
  const onDown = (e: PointerEvent) => {
    if (!hitsConsole(e)) return;
    // A press on a console that is already on is a press on a console that is
    // already on. Holding it to power OFF is a four-second hold on the real
    // hardware and it is not what anyone came here to do.
    if (!powered) room.setPower(true);
  };
  const onHover = (e: PointerEvent) => {
    onPointer(e);
    el.style.cursor = !powered && hitsConsole(e) ? 'pointer' : '';
  };
  el.addEventListener('pointerdown', onDown);

  function applyCamera(): void {
    const k = ease(pushed);
    tmpPos.lerpVectors(idlePos, viewPos, k);
    tmpTarget.lerpVectors(idleTarget, viewTarget, k);
    // The lean fades out as the camera arrives: a head that keeps swaying
    // once you are reading the screen is motion sickness, not presence.
    const amp = CAMERA.parallax * (1 - k * 0.85);
    tmpPos.x += lean.x * amp;
    tmpPos.y -= lean.y * amp * 0.6;
    camera.position.copy(tmpPos);
    camera.lookAt(tmpTarget);
    let fov = CAMERA.idle.fov + (CAMERA.viewing.fov - CAMERA.idle.fov) * k;
    // Widen for a NARROW window.
    //
    // Both poses are framed for 16:9. A camera's fov is VERTICAL, so on a
    // window narrower than that the horizontal extent shrinks with the aspect
    // and the television grows out of the sides of the frame - on a phone held
    // upright the 0.75 m picture projected 999 px wide across a 393 px screen,
    // with a third of it off the left edge.
    //
    // So the pose fov is a MINIMUM, not a value: whatever it is, open the lens
    // far enough that the whole picture still lands inside MAX_FILL of the
    // frame's width. At 16:9 the required angle is always the smaller of the
    // two and nothing changes, which is why the desktop framing is untouched.
    const dist = Math.max(0.2, tmpPos.distanceTo(tmpTarget));
    const halfW = SCREEN.w / 2 / MAX_FILL;
    const needed = 2 * Math.atan(halfW / camera.aspect / dist) * (180 / Math.PI);
    fov = Math.max(fov, needed);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  function layout(): void {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // The framing depends on the aspect, so a resize is a re-frame.
    applyCamera();
    gl.setPixelRatio(Math.min(devicePixelRatio, 2));
    gl.setSize(w, h);
    css.setSize(w, h);
  }
  const onResize = () => layout();
  addEventListener('resize', onResize);
  visualViewport?.addEventListener('resize', onResize);
  layout();

  /** The ring of light, and the tube. Both are pure functions of `warm`. */
  function applyPower(): void {
    // Clockwise sweep, one quadrant every WARMUP.ringSweep, then steady.
    const lit = warm < 0 ? 0 : Math.min(4, Math.floor(warm / WARMUP.ringSweep) + 1);
    if (lit !== ringLit) {
      ringLit = lit;
      for (let q = 0; q < 4; q++) stand.ringSegments[q]!.emissive.setHex(q < lit ? 0x35d21a : 0x000000);
      // The pad's own ring comes up with the console's, because that is when a
      // wireless pad binds to it.
      padLit = lit > 0;
      table.setPadLit(padLit);
    }
    // The tube goes live part-way through the sweep, not at the press: there
    // is a relay between the button and the anode.
    tv.setOn(warm >= WARMUP.live);
    if (warm >= 0) tv.crt.setWarm(warm);
    if (!bootFired && warm >= WARMUP.boot) {
      bootFired = true;
      // The startup animation, then the dashboard. With no animation to play
      // the dashboard takes the tube right here, which is what every gate and
      // every deep link gets.
      if (playStartup) void tv.startup.play(opts.muted ?? false).then(() => opts.onPictureLive?.());
      else opts.onPictureLive?.();
    }
    // The picture is a light in the room. It comes up with the tube, and it
    // carries the overshoot: the first half second of a CRT lights a room
    // brighter than the next hour of it.
    lights.glow.intensity = warm < WARMUP.line ? 0 : 1.25 * Math.min(1.9, 1 + 1.2 * Math.exp(-(warm - WARMUP.line) * 2.4));
  }

  function step(dt: number): void {
    if (warm >= 0 && !swapping) { warm += dt; applyPower(); }
    // Exponential smoothing, framerate-independent: the same 1 - e^(-k t) the
    // rest of the codebase uses for a damped follow.
    const smooth = 1 - Math.exp(-9 * dt);
    lean.x += (leanTo.x - lean.x) * smooth;
    lean.y += (leanTo.y - lean.y) * smooth;
    const dur = powered ? CAMERA.pushIn : CAMERA.pullOut;
    const dir = powered ? 1 : -1;
    pushed = Math.min(1, Math.max(0, pushed + (dir * dt) / dur));
    applyCamera();
    gl.render(scene, camera);
    css.render(scene, camera);
  }

  let raf = 0;
  let last = 0;
  if (!opts.manual) {
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      step(dt);
    };
    raf = requestAnimationFrame(loop);
  } else {
    step(0);
  }

  onHoverRef = onHover;

  /** Walk `warm` to a value over a duration, on the wall clock. In `manual`
   *  there is no wall clock to walk on, so it arrives at once - a suite that
   *  wants the collapse steps it itself. */
  function walkWarm(to: number, seconds: number): Promise<void> {
    if (opts.manual) { warm = to; applyPower(); return Promise.resolve(); }
    const from = warm;
    const t0 = performance.now();
    return new Promise((done) => {
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
        warm = from + (to - from) * k;
        applyPower();
        if (k < 1) requestAnimationFrame(tick); else done();
      };
      requestAnimationFrame(tick);
    });
  }

  const room: Room = {
    overlay,
    screenHost: tv.host,
    get powered() { return powered; },
    setPower(on: boolean) {
      if (on === powered) return;
      powered = on;
      if (on) { warm = 0; bootFired = false; }
      else {
        warm = -1;
        ringLit = -1;
        // The set's own glow is a light in the ROOM, not a decal on the glass.
        // Left burning in front of a dark CRT it puts a specular dot on it that
        // reads as a dead pixel.
        lights.glow.intensity = 0;
        tv.setOn(false);
      }
      applyPower();
    },
    /** Skip the sequence: the tube is hot, the ring is lit, the camera is at
     *  the glass. The boot still fires, because a route that arrives powered
     *  still wants the console's own boot animation. */
    snapPowered() {
      powered = true;
      warm = WARMUP.settleTo + 1;
      ringLit = -1;
      pushed = 1;
      // A route that asks to arrive settled has asked to skip the animation
      // too: `&power=on` is what a screenshot gate opens, and six seconds of
      // logo is not what it came to measure. bootFired is set BEFORE
      // applyPower so the sequence's own hand-off cannot also fire.
      bootFired = true;
      tv.startup.skip();
      applyPower();
      applyCamera();
    },
    step,
    async changeInput(swap) {
      if (swapping || warm < 0) return false;
      swapping = true;
      try {
        // Back down to the line the picture opened out of. Faster than the
        // warm-up: a tube collapses in a snap and takes its time coming back.
        await walkWarm(WARMUP.line, 0.20);
        await swap();
        // Changing what is plugged in does not re-run the console's startup
        // animation: the console never turned off.
        tv.startup.skip();
        // The new dashboard is mounted behind a tube that is showing a line.
        // Re-arm and let step() bloom it in exactly as it did at power-on.
        bootFired = false;
        warm = WARMUP.line;
        applyPower();
        return true;
      } finally {
        swapping = false;
      }
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      visualViewport?.removeEventListener('resize', onResize);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      shell.dispose();
      tv.dispose();
      stand.dispose();
      for (const p of props) p.dispose();
      gl.dispose();
      el.remove();
      delete window.__room;
      delete window.__roomApi;
    },
    report() {
      const info = gl.info.render;
      return {
        powered,
        camera: { x: +camera.position.x.toFixed(4), y: +camera.position.y.toFixed(4), z: +camera.position.z.toFixed(4), fov: +camera.fov.toFixed(3) },
        pushed: +pushed.toFixed(4),
        warm: +warm.toFixed(3),
        ring: Math.max(0, ringLit),
        startup: tv.startup.state,
        console: stand.modelLoaded ? 'model' : 'stand-in',
        padLit,
        draws: info.calls,
        tris: info.triangles,
        // The glass is a hole when the TUBE is live, which is a relay's worth
        // of time AFTER the button. Reporting `powered` here said "hole" while
        // the screen was still a dark mirror.
        glass: tv.on ? 'hole' : 'mirror',
      };
    },
  };
  /** An object's world position, in client pixels. */
  function project(o: T.Object3D): { x: number; y: number } | null {
    scene.updateMatrixWorld(true);
    const v = new T.Vector3();
    o.getWorldPosition(v);
    v.project(camera);
    const b = el.getBoundingClientRect();
    return { x: b.left + ((v.x + 1) / 2) * b.width, y: b.top + ((1 - v.y) / 2) * b.height };
  }

  window.__room = () => room.report();
  window.__roomApi = {
    report: () => room.report(),
    step: (dt) => room.step(dt),
    setPower: (on) => room.setPower(on),
    snapPowered: () => room.snapPowered(),
    press: () => { if (!powered) room.setPower(true); },
    powerPoint: () => project(stand.ring)!,
    padPoint: () => (table.padTargets.length ? project(table.padTargets[0]!) : null),
  };
  return room;
}

/** Evening, one lamp on. The room is lit so that the television is the
 *  brightest thing in it the moment it comes on, which is the whole reason to
 *  build a room around a screen. */
function addLights(scene: T.Scene): { glow: T.PointLight; lampPos: readonly [number, number, number]; windowPos: readonly [number, number, number] } {
  // A RectAreaLight draws BLACK until its lookup textures are uploaded, and
  // the failure is silent: the light is in the scene, it has an intensity, and
  // it contributes nothing. One call, once, before any of them is built.
  RectAreaLightUniformsLib.init();
  // Sky/ground bounce, standing in for the global illumination we are not
  // paying for. Warm from the ceiling, cool from the floor.
  scene.add(new T.HemisphereLight(0xd8c9ae, 0x2a2018, 0.40));

  // The lamp, off to the left and behind the seat.
  const lampPos = [-1.62, 1.44, ROOM.back + 3.1] as const;
  const lamp = new T.PointLight(0xffc98c, 9, 7, 2);
  lamp.position.set(...lampPos);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0012;
  // A bare point light throws a hard-edged rectangle of television onto the
  // back wall, which reads as a stain rather than a shadow. A real 60 W bulb
  // under a shade is 0.1 m across and its penumbra at 2 m is enormous.
  lamp.shadow.radius = 7;
  scene.add(lamp);

  // A cold sliver from the window on the right wall, so the beige has
  // something to be beige against.
  const windowPos = [ROOM.w / 2 - 0.02, 1.42, ROOM.back + 2.0] as const;
  const window_ = new T.RectAreaLight(0x9fc2ff, 1.6, 1.2, 1.1);
  window_.position.set(...windowPos);
  window_.lookAt(0, 1.0, windowPos[2]);
  scene.add(window_);

  // The picture, as a light. Off while the set is off, which is what stops the
  // dark glass from carrying a specular highlight of a lamp that is supposed to
  // be INSIDE the television. setPower() raises it.
  // Not blue. A dashboard is mostly warm grey and green, and a set throwing
  // cyan across a beige room reads as a monitor, not a television.
  // Out in the ROOM, not on the bezel. Sitting it 0.25 m off the glass put the
  // light source inside the television's own frame, and the first thing a
  // point light does at 0.25 m is blow out whatever is nearest it - so the
  // charcoal bezel came out near white while the room behind stayed dark.
  const glow = new T.PointLight(0xbfd2e8, 0, 4.4, 2);
  glow.position.set(0, SCREEN.y, SCREEN.z + 0.75);
  scene.add(glow);

  return { glow, lampPos, windowPos };
}
