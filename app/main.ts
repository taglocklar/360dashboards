// Routes:
//   /                       the LIVING ROOM (app/room/): a 2008 front room, a
//                           34" widescreen CRT, and an Xbox 360 on the shelf
//                           under it. Press the console's power button and the
//                           ring of light sweeps, the tube warms up and the
//                           dashboard boots on it. The wheel in the top-left
//                           corner chooses which dashboard is plugged in.
//   ?room=off               the bare 16:9 stage instead, same as ?build=
//   &power=on               arrive with a hot tube and no sequence to play
//   /?build=6770            the Blades shell: dashmain plus every blade's
//                           panel scene, resting on the current blade
//   /?scene=<pack>/<path>   one scene
//   /?gallery               every scene in the manifest, as a contact sheet
//   &debug                  the inspector panel
//   &blade=N                drop onto blade N's rest state instead of booting
//   &boot=<range>           play a named boot range (default BootLive);
//                           &boot=none parks on DefaultTab without one
//   &frame=N                freeze every timeline scope at frame N (deterministic)
//   &play=<scope>:<a>-<b>   play a named-frame range on load; <scope> matches
//                           the tail of a scope id, <a>/<b> are frame names
//   &manual                 do not run the wall clock; the range sits on its
//                           opening frame until __dashApi.stepFrames() moves it
//                           (what the smoke suites use to stay deterministic)
//   &locale=de-de           patch the scene's strings from its .xus table
//   &mute                   build no AudioContext; cues are logged, not heard
//   &focus=N                focus list row N instead of the scene's default
//   &gradxf=k=v,...         override GRADIENT_TRANSFORM fields for the sweep
//   ?build=9199             serve NXE 9199 instead of Blades 6770. The same
//                           app serves both: the manifest, the class registry,
//                           the skin, the string tables, the audio bank and the
//                           viewport all take the build. The default is 6770
//                           and every route above behaves exactly as before.
//   &page=<pack>/<file>     (9199) host that 880x480 legacy page in the shell
//                           instead of the home strip
//   &channel=<id>           (9199) come up on that channel instead of the XML's
//                           own <defaultchannelid>
//   &iptv                   (9199 too) an IPTV provider is configured, so
//                           System Settings shows its eighth row
//   &avpack0                (9199) the AV pack is 0 (no HD cable): the Display
//                           and HDTV Settings pages take the code's AV-pack-0
//                           branch (switch art shown, labAVPackInfo written)
//
// On ?build=9199 the pad drives the strip: left/right move the PANEL cursor,
// up/down the CHANNEL cursor (the opposite axis assignment to Blades), A runs
// the focused slot's <onclick> and B pops the page stack. All of it is a
// per-frame integrator on the timeline's own 60 Hz clock, so &manual +
// __dashApi.stepFrames() reproduces any position exactly.
import {
  AssetIndex, loadScene, Skin, VisualScope, indexVisuals, renderScene, Viewport,
  createTelemetry, emptyReport, publish, startFpsMeter, mountInspector,
  NodeIndex, bindTimelines, TimelineEngine, xuiRegistry, refreshVisibility,
  InputRouter, Button, AudioBank, Strings, ListView,
  attachTouch, tapFocus, xuiHitsAt, elementsAt, isA, type TapResult,
  DEFAULT_LOCALE, isNativeLocale,
  BLEND_OVERRIDES, GRADIENT_TRANSFORM, FONT_FAMILY, parseBuild, setActiveBuild, activeBuild,
  type BuildId,
  type RenderCtx, type SceneReport, type DashTelemetry,
} from '@runtime/index';
import { NxeShell, type NxeReport } from '@dash/nxe/NxeShell';
import { BladeShell, OFFLINE, type ShellReport } from '@dash/blades/BladeShell';
import { DEFAULT_TAB } from '@dash/blades/tabs';
import { populateLists } from '@dash/blades/lists';
import { DEFAULT_BOOT } from '@dash/blades/boot';
import { buildRoom, type Room } from './room/Room';
import { buildWheel } from './room/wheel';
import { buildLoadingScreen } from './room/loading';
import { watchOrientation } from './orientation';
import type { NavDirection } from '@dash/blades/focus';

/** The hook the smoke suites drive; nothing in the runtime depends on it. */
interface DashApi {
  engine: TimelineEngine;
  /** The Blades shell, on the default route only. */
  shell?: {
    go(tab: number): boolean;
    left(): boolean;
    right(): boolean;
    seekRest(tab?: number): void;
    openLevel(): boolean;
    closeLevel(): boolean;
    /** A on the focused control: resolve its PressPath and push the scene. */
    press(): Promise<boolean>;
    /** Mount a page directly, the way a press resolves one. The gates use it to
     *  sweep every reachable page without walking the whole tree to each. */
    push(sceneId: string): Promise<boolean>;
    /** B: pop the top scene. */
    back(): boolean;
    move(dir: NavDirection): string | null;
    /** X or Y: the top scene's control carrying that PressKey. */
    pressKey(key: 'X' | 'Y'): Promise<boolean>;
    /** Left / Right: a NavLeft/NavRight move when the focused control authors
     *  one, the blade switch otherwise. */
    navLeft(): boolean;
    navRight(): boolean;
    boot(range?: string): boolean;
    /** Resolve once every load the shell started has finished. */
    idle(): Promise<void>;
    report(): ShellReport;
  };
  input: InputRouter;
  audio: AudioBank;
  /** Send one button press through the focus stack, as the pad would. */
  press(button: string): boolean;
  lists(): string[];
  focusList(id: string, index: number): string | null;
  setState(controlId: string, state: string): boolean;
  playRange(scopeId: string, from: string, to?: string): boolean;
  /** The NXE shell's report, on ?build=9199 only. */
  nxe?: () => NxeReport;
  /** The NXE shell's navigation, on ?build=9199 only. */
  nxeShell?: {
    /** The panel cursor, within the current channel. */
    left(): boolean;
    right(): boolean;
    /** The channel cursor. */
    up(): boolean;
    down(): boolean;
    /** A: the focused slot's <onclick>, or the focused row of a hosted page. */
    press(): Promise<boolean>;
    /** B: pop the page stack. */
    back(): boolean;
    /** X / Y: the hosted page's control bound by PressKey 0x5802 / 0x5803. */
    x(): Promise<boolean>;
    y(): Promise<boolean>;
    idle(): Promise<void>;
    report(): NxeReport;
  };
  /** Step exactly N timeline frames, synchronously, ignoring wall time. */
  stepFrames(n: number): void;
  scopeIds(): string[];
  /** Tear this mount down and build it again, the way a hot update does.
   *  The smoke suite drives it to prove nothing is left behind. */
  remount(): Promise<void>;
}
declare global { interface Window { __dashApi?: DashApi } }

const params = new URLSearchParams(location.search);
const host = document.getElementById('app')!;

/**
 * Where a dashboard's `.xui-viewport` is appended.
 *
 * `#app` on every flat route, and the television's glass on `?room` - a
 * 1280x720 element projected onto the glass (app/room/screen.ts). The three mount
 * functions below append to THIS and never to `host`, which is the whole of
 * what putting the dashboard in a living room costs the dashboard: the shells,
 * the Viewport, the focus chains, the cues and the touch gestures are the same
 * code either way, and none of them learns where they are.
 */
let mountHost: HTMLElement = host;

/**
 * True on `?room`: the console's boot animation is HELD until the tube is warm.
 *
 * A dashboard mounted in a living room must not have booted already by the time
 * the viewer presses the power button - which is exactly what happens if the
 * shell boots on mount, because a black tube hides it and you arrive at a home
 * screen that has, as far as anyone watching can tell, never booted. So the
 * room route parks the shell on its rest state and the ROOM calls boot(), from
 * app/room/crt.ts's WARMUP.boot.
 */
let deferBoot = false;

/* ------------------------------------------------------------- the mount */

/**
 * Everything ONE run of main() created that a second run must not inherit.
 *
 * main() runs at module scope, and a Vite dev server re-executes this module on
 * every hot update. Without a teardown, each reload appended a SECOND viewport
 * to `#app`, attached a SECOND InputRouter to the window, and started a second
 * rAF clock and a second AudioContext - so one key press drove two shells, both
 * of which were still in the document. That is what stacked the Blades
 * metapane's descriptions on a dev server that had been up for hours: the
 * descriptions were not accumulating in one pane, there were N panes.
 *
 * So the module owns a disposer list, `teardown()` runs it, and
 * `import.meta.hot` is wired to it. `__dashApi.remount()` is the same path, and
 * it is what the smoke suite drives - a leak that only a human notices after an
 * afternoon of editing is not a leak anyone will find, so it has a test.
 */
const disposers: (() => void)[] = [];

/**
 * The DASHBOARD's own disposers, which outlive nothing.
 *
 * A page can hold one room and, over its life, several dashboards: the wheel
 * swaps Blades for NXE on the same television without rebuilding the living
 * room around it. So there are two scopes. The room, the rotate watch and the
 * page furniture go in `disposers` and are torn down once; a dashboard's
 * viewport, input router, audio bank and clock go in `dashDisposers` and are
 * torn down every time the input changes.
 *
 * The mount functions do not know which they are in: `onDispose` pushes onto
 * whichever scope is OPEN, and mountDashboard() opens the dashboard scope
 * around its dispatch. That is what keeps blades(), nxe(), single() and
 * gallery() identical on both routes.
 */
const dashDisposers: (() => void)[] = [];
let sink = disposers;
function onDispose(fn: () => void): void { sink.push(fn); }

/** Last in, first out: the clock stops before the shell it drives goes away. */
function runDisposers(list: (() => void)[]): void {
  while (list.length) {
    const fn = list.pop()!;
    try { fn(); } catch (err) { console.error(err); }
  }
}

export function teardown(): void {
  runDisposers(dashDisposers);
  runDisposers(disposers);
  sink = disposers;
  host.replaceChildren();
  mountHost = host;
  delete (window as { __dashApi?: DashApi }).__dashApi;
  delete document.body.dataset['ready'];
}

/** How many times main() has run in this page. Reported, so a suite can prove
 *  it really did remount rather than measure the first mount twice. */
let mounts = 0;

function boot(): void {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    const b = document.createElement('div');
    b.className = 'banner';
    b.textContent = msg;
    host.appendChild(b);
    const t = window.__dash;
    if (t) t.errors.push(msg);
    console.error(err);
  });
}
boot();

// A hot update replaces this module: tear the old mount down first, then let
// the new copy of main() run. Every module the app imports propagates its
// update up to this one, so the whole app is rebuilt from a clean page rather
// than layered on top of the last one.
if (import.meta.hot) {
  import.meta.hot.dispose(() => teardown());
  import.meta.hot.accept();
}

async function main(): Promise<void> {
  // The rotate-to-landscape ask, on EVERY route: the room, both dashboards,
  // the single-scene view and the gallery. It builds nothing at all unless a
  // HANDHELD is being held upright, so a desktop window of any shape never sees
  // it (app/orientation.ts).
  const rotate = watchOrientation(document.body);
  onDispose(rotate.dispose);

  // ?blend=5:screen - sweep a candidate BlendMode mapping against the frames.
  for (const spec of params.getAll('blend')) {
    const [n, css] = spec.split(':');
    if (n && css) BLEND_OVERRIDES.set(Number(n), css);
  }
  // ?gradxf=direction=texture,rotation=-1,... - sweep the fill-transform model
  // (tests/smoke/sweep-gradient.mjs). Every key is a field of GRADIENT_TRANSFORM.
  for (const kv of (params.get('gradxf') ?? '').split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (!k || v === undefined || !(k in GRADIENT_TRANSFORM)) continue;
    (GRADIENT_TRANSFORM as unknown as Record<string, unknown>)[k] = k === 'rotation' ? Number(v) : v;
  }
  // The build is chosen BEFORE anything loads: it picks the manifest, the class
  // registry every .xur is parsed with, and the canvas -> framebuffer view.
  const { build, error } = parseBuild(params.get('build'));
  // ?room mounts the dashboard on a television in a 2008 living room instead of
  // on the page (app/room/). The dashboard is not told: the only thing this
  // route changes is which element its viewport is appended to, and the gallery
  // and single-scene views - which are contact sheets, not a console - stay
  // flat. `?room=off` is the escape hatch back to the bare 16:9 stage.
  let room: Room | null = null;
  const wantsRoom = wantsTheRoom();
  let loading: ReturnType<typeof buildLoadingScreen> | null = null;
  if (wantsRoom) {
    deferBoot = params.get('blade') === null && params.get('boot') !== 'none';
    // Up before the room is, and down only once the room is REAL. Every prop
    // here is built twice - a stand-in of the right size, then the authored
    // model that replaces it - so without this the first second of the room is
    // a white box on a shelf, a white slab on a table and a grey cabinet,
    // followed by three pops as the real things land.
    loading = buildLoadingScreen(host);
    onDispose(() => loading?.dispose());
    const r = buildRoom(host, {
      onProgress: (done, total) => loading?.setProgress(done, total),
      manual: params.has('manual'),
      base: import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/',
      // The console's startup animation - the sphere, the X, the wordmark -
      // plays on the tube before the dashboard's own boot range. `&startup=off`
      // skips it, and so does `&manual`, where a <video> element's clock is not
      // steppable and would make every gate a race.
      startup: params.get('startup') !== 'off',
      muted: params.has('mute'),
      // The dashboard takes the tube when the CONSOLE is done with it: after
      // the startup animation and its measured 50 ms of black. That is the
      // whole sequence - press power, the ring of light sweeps, the tube
      // blooms open onto an animation that is already running, the wordmark
      // settles, black, and then the dashboard's own boot range.
      onPictureLive: () => {
        if (deferBoot) window.__dashApi?.shell?.boot(params.get('boot') || undefined);
        // The pad belongs to the dashboard again now that there is a dashboard
        // to look at.
        window.__dashApi?.input.pop('room-power');
      },
    });
    room = r;
    mountHost = r.screenHost;
    onDispose(() => r.dispose());
    // The wheel replaces the launcher: the choice of dashboard is a control in
    // the room, not a page in front of it. It swaps the build in place, so the
    // living room it is standing in never rebuilds.
    const wheel = buildWheel(r, build, async (next) => {
      deferBoot = true;
      await mountDashboard(next);
    });
    onDispose(wheel.dispose);
  }
  const telemetry = await mountDashboard(build);
  if (room) {
    // The dashboard is mounted; wait for the ROOM's own models and textures
    // before showing any of it. `whenLoaded` always resolves - a failed asset
    // still ends its item, and a request that never answers is capped - so
    // this cannot trap anyone on the loading screen.
    await room.whenLoaded;
    await loading?.finish();
    startRoom(room);
  }
  // AFTER the route: publish() replaces the telemetry's errors with the
  // scene report's, so a message pushed before it would vanish.
  if (error) telemetry.errors.push(error);
  rotate.refresh();
  document.body.dataset['ready'] = 'true';
}

/**
 * Build one dashboard into `mountHost`, replacing whatever was there.
 *
 * Everything a build owns is chosen here and nowhere else: the manifest, the
 * class registry every .xur is parsed with, the skin, the string tables, the
 * audio bank and the canvas -> framebuffer view. Calling it a second time with
 * a different build is what the wheel does, and the ONLY thing it leaves alone
 * is the room - which is why the television does not blink out and come back
 * when you change what is plugged into it.
 */
async function mountDashboard(build: BuildId): Promise<DashTelemetry> {
  runDisposers(dashDisposers);
  mountHost.replaceChildren();
  sink = dashDisposers;
  try {
    const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
    setActiveBuild(build);
    const assets = await AssetIndex.load(base, build);
    const telemetry = createTelemetry(assets.build);
    mounts += 1;
    onDispose(startFpsMeter(telemetry));
    await loadFont(assets.base + `assets/${build}/fonts/`, telemetry.placeholders);
    const skin = await Skin.load(assets, activeBuild().skin);
    if (params.has('gallery')) await gallery(assets, skin, telemetry);
    else if (params.has('scene')) await single(assets, skin, telemetry, params.get('scene')!);
    else if (build === '9199') await nxe(assets, skin, telemetry);
    else await blades(assets, skin, telemetry);
    // The live-singleton census belongs to the DASHBOARD, so it is taken here
    // and not once at the end of main(). A wheel swap builds a whole new
    // telemetry object, and leaving this to main() meant every count on it
    // read 0 after a swap - which is worse than wrong, because zero viewports
    // and zero routers is what a torn-down page looks like, so the one number
    // that would catch a swap leaking a viewport was reporting a clean sheet.
    syncHmr(telemetry);
    return telemetry;
  } finally {
    sink = disposers;
  }
}

/**
 * Is this route a living room, or a bare 16:9 stage?
 *
 * A bare `/` is the ROOM. That is the front door now: it used to be our own
 * launcher page, a 1280x720 menu you passed through on the way to a dashboard,
 * and the choice it offered has moved into the wheel in the room's top-left
 * corner (app/room/wheel.ts). Nobody should meet an Xbox 360 through a web
 * page.
 *
 * Everything the suites and the judges open is FLAT, and it stays flat:
 *
 *   /                     the room
 *   /?room&build=9199     the room, with NXE plugged in (what the wheel writes)
 *   /?room&mute&manual    the room, silent and hand-stepped (the suite)
 *   /?build=6770          the bare stage - every screenshot gate, every
 *                         measurement against a reference frame
 *   /?boot=none, /?blade=5, /?gallery, /?scene=, /?zoom=  the bare stage too
 *   /?room=off            the escape hatch, said out loud
 *
 * The rule is deliberately blunt: NAMED `room`, or NO PARAMETERS AT ALL.
 * Anything else is flat.
 *
 * The tempting rule - "flat only when a route parameter says so" - is wrong,
 * and wrong in a way that is invisible until the whole board runs. Every suite
 * and every judge in this repo opens URLs like `/?blade=5&zoom=1.5&mute&manual`
 * and `/?boot=none`, with no `build=` at all, because the default build has
 * always been Blades. Under that rule all of them silently became living
 * rooms: smoke-nav read "first load must play a boot range, got null" (the
 * room HOLDS the boot until the tube is warm), smoke-blades measured a 328x2
 * screenshot against a 1920x1080 reference, and smoke-boot's compositor budget
 * went over by the WebGL canvas nobody asked it to draw.
 */
function wantsTheRoom(): boolean {
  if (params.has('room')) return params.get('room') !== 'off';
  return params.size === 0;
}

/**
 * The room's opening state.
 *
 * The set is dark, the console is asleep, and the only thing that will wake it
 * is the power button - clicked on the console itself (app/room/Room.ts
 * raycasts it) or pressed as A on the pad, which is what a viewer with no
 * mouse and no idea that the console is clickable will try.
 *
 * While it is dark the dashboard MUST NOT hear the pad. It is mounted, parked
 * on DefaultTab, one hole-punch away from being visible - so an Enter that
 * both powers the console on and presses whatever control the shell is focused
 * on would open a page nobody asked for, behind a black tube, before the boot
 * animation has played. One layer on top of the input stack swallows the lot
 * until the picture is live.
 *
 * `&power=on` skips the whole sequence and arrives at a hot tube: what the
 * screenshot gates and any deep link into a page want.
 */
function startRoom(room: Room): void {
  if (params.get('power') === 'on') {
    room.snapPowered();
    if (deferBoot) window.__dashApi?.shell?.boot(params.get('boot') || undefined);
    return;
  }
  const router = window.__dashApi?.input;
  router?.push({
    id: 'room-power',
    onButton: (b) => { if (b === Button.A || b === Button.Start) room.setPower(true); },
    // A layer with no `consumes` swallows EVERY button, and this one only acts
    // on two. That made the cold room quietly different from the flat routes:
    // Tab is Guide, Guide is a documented no-op that records itself in
    // `__dash.placeholders`, and on `/` it recorded nothing at all until this
    // layer was popped seven seconds later. Take the two presses this layer is
    // for and let everything else fall through to the dashboard.
    consumes: (b) => b === Button.A || b === Button.Start,
  });
}

/** The live-singleton census. Every count is 1 on a healthy page, however many
 *  times the app has been mounted. */
function syncHmr(t: DashTelemetry): void {
  t.hmr = {
    mounts,
    viewports: Viewport.live.size,
    inputRouters: InputRouter.attached.size,
    audioContexts: AudioBank.open.size,
    clocks: liveClocks,
  };
}
let liveClocks = 0;

/** The console face is extracted from the ROM, so a miss is a real placeholder. */
async function loadFont(fontDir: string, placeholders: string[]): Promise<void> {
  try {
    // check() only answers for a face the page has already asked for, so load
    // it explicitly before gating first paint on it.
    await document.fonts.load(`16px ${FONT_FAMILY}`);
    await document.fonts.ready;
    if (!document.fonts.check(`16px ${FONT_FAMILY}`)) {
      placeholders.push(`font ${FONT_FAMILY}: ConvectionUI.ttf is not in ${fontDir}, falling back to a system sans`);
    }
  } catch {
    placeholders.push(`font ${FONT_FAMILY}: could not be checked`);
  }
}

/* ------------------------------------------------------------- the shell */

/**
 * The default route: the whole dashboard. dashmain is one scene carrying every
 * blade transition as a named range, so the shell composes (panels parented
 * into each blade's scContainer) and then only ever plays ranges.
 */
async function blades(assets: AssetIndex, skin: Skin, t: DashTelemetry): Promise<void> {
  const viewportHost = document.createElement('div');
  viewportHost.className = 'xui-viewport';
  mountHost.appendChild(viewportHost);
  const zoom = Number(params.get('zoom') ?? '1') || 1;
  const viewport = new Viewport(viewportHost, { consoleView: !params.has('design'), zoom });

  const report = emptyReport('dashmain/dashmain.xur');
  const nodes = new NodeIndex();
  const engine = new TimelineEngine();
  const strings = new Strings(assets);
  // ?locale= belongs to the SHELL, not to one scene: the driven dashboard is a
  // dozen files (dashmain, five blade panels, the banners, the tray strip and
  // every page a press opens) and a locale applied only to the first would
  // leave the rest in English. BladeShell.loadLocalized patches each one before
  // it renders and counts the patches, so `localePatches` is assertable.
  const locale = params.get('locale') ?? DEFAULT_LOCALE;
  t.locale = locale;
  const shell = await BladeShell.mount({
    assets, skin, nodes, engine, report, host: viewport.canvas, strings, locale,
    state: {
      ...OFFLINE,
      signedIn: params.has('signedin'),
      liveConnected: params.has('live'),
      iptv: params.has('iptv'),
      dashStyle: Number(params.get('style') ?? '0') || 0,
    },
    render: (root, ctx) => renderScene(root, ctx),
  });
  viewport.setCanvas({ w: report.canvas.w, h: report.canvas.h });

  // ?blade=N drops straight onto a blade's rest state (what the stills and
  // most of the smoke suites want). With no blade named, the console boots:
  // the dispatcher's cold-boot default is BootLive, landing on Xbox LIVE.
  // ?boot=<range> picks another of the fifteen; ?boot=none skips it.
  const blade = params.get('blade');
  const bootParam = params.get('boot');
  if (blade !== null) {
    const startTab = Number(blade);
    shell.seekRest(Number.isFinite(startTab) ? startTab : DEFAULT_TAB);
  } else if (bootParam === 'none' || deferBoot) {
    shell.seekRest(DEFAULT_TAB);
  } else {
    shell.boot(bootParam || DEFAULT_BOOT);
  }
  // ?hide=a,b - ablation, to find which element paints a region. AFTER the
  // seek: applyNow rewrites cssText wholesale and would wipe an inline hide.
  // Every later seek does the same, so this re-runs after runClock too -
  // ?frame=N with ?hide= used to render with nothing hidden at all.
  const applyHides = () => {
    for (const id of (params.get('hide') ?? '').split(',').filter(Boolean)) {
      for (const n of nodes.byId.get(id) ?? []) n.el.style.setProperty('display', 'none', 'important');
    }
  };
  applyHides();
  publish(t, report);

  const audio = AudioBank.index(assets, params.has('mute'));
  if (!params.has('mute')) audio.unlockOnGesture();
  audio.attach(engine);
  const input = installBladeInput(shell, t, audio, viewportHost);
  onDispose(() => { input.detach(); audio.close(); viewport.dispose(); });
  installApi(engine, t, input, audio, []);
  window.__dashApi!.shell = {
    go: (tab) => { const ok = shell.go(tab); syncShell(t, shell, audio); return ok; },
    left: () => { const ok = shell.left(); syncShell(t, shell, audio); return ok; },
    right: () => { const ok = shell.right(); syncShell(t, shell, audio); return ok; },
    seekRest: (tab) => { shell.seekRest(tab); syncShell(t, shell, audio); },
    openLevel: () => { const ok = shell.openLevel(); syncShell(t, shell, audio); return ok; },
    closeLevel: () => { const ok = shell.closeLevel(); syncShell(t, shell, audio); return ok; },
    press: async () => { const ok = await shell.press(); await shell.idle(); syncShell(t, shell, audio); return ok; },
    push: async (sceneId) => { const level = await shell.push(sceneId); await shell.idle(); syncShell(t, shell, audio); return level !== null; },
    back: () => { const ok = shell.back(); syncShell(t, shell, audio); return ok; },
    move: (dir) => { const id = shell.moveFocus(dir); syncShell(t, shell, audio); void shell.idle().then(() => syncShell(t, shell, audio)); return id; },
    pressKey: async (key) => { const ok = await shell.pressKey(key); await shell.idle(); syncShell(t, shell, audio); return ok; },
    navLeft: () => { const ok = shell.navLeft(); syncShell(t, shell, audio); void shell.idle().then(() => syncShell(t, shell, audio)); return ok; },
    navRight: () => { const ok = shell.navRight(); syncShell(t, shell, audio); void shell.idle().then(() => syncShell(t, shell, audio)); return ok; },
    boot: (range) => { const ok = shell.boot(range); syncShell(t, shell, audio); return ok; },
    idle: async () => { await shell.idle(); syncShell(t, shell, audio); },
    report: () => shell.report(),
  };
  // A metapane sub-scene is fetched, so the first report has to wait for it or
  // it would say "no scene" about one that is already on screen.
  await shell.idle();
  syncShell(t, shell, audio);
  runClock(engine, t);
  applyHides();

  if (params.has('debug')) mountInspector(host, shell.dashmain.root, viewport.canvas);
}

/**
 * The shoulder buttons switch the blade. Left/right on the d-pad walk the
 * focused control's NavLeft/NavRight when it authors one (35 scenes in the
 * build do: the arcade pages, the clock spinners, MediaSourceSelection) and
 * fall through to the blade switch when it does not - none of the five blade
 * pages authors either, so at home that axis is XuiTabScene's. Up/down walk
 * NavUp/NavDown; A presses the focused control, B goes back, X and Y go to
 * the control carrying that PressKey. A locked tab (a page is open) refuses
 * the switch. Start and Back are bound to nothing in this build: no scene
 * carries a PressKey for them and DashMainScene's key handler names only the
 * ones above.
 */
function installBladeInput(shell: BladeShell, t: DashTelemetry, audio: AudioBank, touchHost: HTMLElement): InputRouter {
  const router = new InputRouter();
  router.push({
    id: 'blades',
    onButton: (b) => {
      if (b === Button.LB) shell.left();
      else if (b === Button.RB) shell.right();
      else if (b === Button.Left) { shell.navLeft(); void shell.idle().then(() => syncShell(t, shell, audio)); }
      else if (b === Button.Right) { shell.navRight(); void shell.idle().then(() => syncShell(t, shell, audio)); }
      else if (b === Button.Up) { shell.moveFocus('Up'); void shell.idle().then(() => syncShell(t, shell, audio)); }
      else if (b === Button.Down) { shell.moveFocus('Down'); void shell.idle().then(() => syncShell(t, shell, audio)); }
      else if (b === Button.A) void shell.press().then(() => shell.idle()).then(() => syncShell(t, shell, audio));
      else if (b === Button.B) shell.back();
      else if (b === Button.X || b === Button.Y) void shell.pressKey(b).then(() => shell.idle()).then(() => syncShell(t, shell, audio));
      else if (b === Button.Guide) noteGuide(t);
      else return;
      syncShell(t, shell, audio);
    },
  });
  router.attach();
  // The same buttons, from a finger. Swiping LEFT carries the page left, which
  // is the NEXT blade, so it is RB; swiping UP carries the list up, which moves
  // focus DOWN. Nothing new appears on screen and the shell is not told.
  onDispose(attachTouch(router, {
    target: touchHost,
    tap: (x, y) => bladeTap(shell, router, x, y),
    swipeX: { left: Button.RB, right: Button.LB },
    swipeY: { up: Button.Down, down: Button.Up },
    back: Button.B,
    log: t.touch,
  }));
  return router;
}

/**
 * What one finger does on Blades.
 *
 * A tab that is not the current one is the blade switch, one shoulder press per
 * blade: dashmain authors only adjacent ranges (tabs.ts, `switchRange`), so a
 * jump is impossible on the console and impossible here.
 *
 * Anything else goes through `tapFocus`: the tap lands on the focused control
 * and it is A, or it lands on another control and the pad's focus WALKS to it
 * with real Up/Down presses - which is what makes each row's own Focus range
 * and its btn_Focus cue play, exactly as a d-pad would.
 */
function bladeTap(shell: BladeShell, router: InputRouter, x: number, y: number): TapResult {
  const hits = controlHits(x, y);
  const r = shell.report();
  const tab = tabUnder(x, y);
  if (tab !== null && tab !== r.tab && !r.tabsLocked && r.stack.length <= 1) {
    // Re-read the tab after every press instead of counting the steps out in
    // advance: the shell REFUSES a switch mid-transition, the way the console
    // does, and a fixed count would then land a blade short.
    walk(() => shell.report().tab, tab, (d) => router.press(d > 0 ? Button.RB : Button.LB));
    return 'focus';
  }
  if (!hits.length) return false;
  return tapped(tapFocus({
    x, y, ids: hits,
    focusId: () => shell.report().focusId,
    press: (b) => router.press(b),
  }));
}

/** tapFocus's verdict, in the touch module's vocabulary. */
function tapped(v: 'pressed' | 'moved' | null): TapResult {
  return v === 'pressed' ? 'press' : v === 'moved' ? 'focus' : false;
}

/** The blade whose Tab<N> group the point is inside, or null. */
function tabUnder(x: number, y: number): number | null {
  for (const h of xuiHitsAt(x, y)) {
    const m = /^Tab([1-6])$/.exec(h.id);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * The CONTROL ids under a point, deepest first.
 *
 * A finger lands on a figure or a group as often as on a button, and a bare
 * `data-xui-id` chain would let a tap on the background walk the focus 24 rows
 * down a list. Only a XuiControl can take focus, so only a XuiControl counts as
 * something tapped.
 */
function controlHits(x: number, y: number): string[] {
  return xuiHitsAt(x, y).filter((h) => isA(h.className, 'XuiControl')).map((h) => h.id);
}

/**
 * The Guide button. PLACEHOLDERS.md says it is a no-op that records itself, so
 * it has to actually record itself: the guide panel is drawn by the console's
 * system software (xam.xex / xshell, in system flash) and no scene in the 29
 * packs or shrdres names it, so there is nothing in this archive to show.
 * Recorded once, not once per press, so a held button cannot flood the list.
 */
const GUIDE_PLACEHOLDER = 'Guide button: the guide panel is xam.xex/xshell, not in the dashboard archive - no-op';
function noteGuide(t: DashTelemetry): void {
  if (!t.placeholders.includes(GUIDE_PLACEHOLDER)) t.placeholders.push(GUIDE_PLACEHOLDER);
}

function syncShell(t: DashTelemetry, shell: BladeShell, audio: AudioBank): void {
  const r = shell.report();
  t.shell = r;
  t.focusId = r.focusId;
  t.locale = r.locale;
  t.localePatches = r.localePatches;
  t.input = window.__dashApi?.input.log.slice(-40).map((e) => ({ button: e.button, repeat: e.repeat, layer: e.layer })) ?? t.input;
  t.cues = audio.log.slice(-40).map((e) => ({ cue: e.cue, scope: e.scope, tick: e.tick, played: e.played }));
  t.lastCue = audio.log.length ? audio.log[audio.log.length - 1]!.cue : t.lastCue;
}

async function single(assets: AssetIndex, skin: Skin, t: DashTelemetry, id: string): Promise<void> {
  const viewportHost = document.createElement('div');
  viewportHost.className = 'xui-viewport';
  mountHost.appendChild(viewportHost);
  const zoom = Number(params.get('zoom') ?? '1') || 1;
  const viewport = new Viewport(viewportHost, { consoleView: !params.has('design'), zoom });

  const scene = await loadScene(assets, id);
  const report = emptyReport(id);
  report.unknownClasses.push(...scene.unknownClasses);

  // Strings are patched into the PARSED tree before it is rendered: en is the
  // literal already in the .xur, so only a real locale changes anything.
  const strings = new Strings(assets);
  const locale = params.get('locale') ?? DEFAULT_LOCALE;
  t.locale = locale;
  if (!isNativeLocale(locale)) {
    const patches = await strings.applyLocale(scene.root, xuiRegistry(), scene.pack, scene.path, locale);
    t.localePatches = patches.length;
    if (patches.length === 0) report.errors.push(`locale ${locale}: no table for ${scene.id}`);
  }

  const nodes = new NodeIndex();
  const ctx: RenderCtx = { assets, pack: scene.pack, visuals: new VisualScope(indexVisuals(scene.root), skin), report, nodes };
  viewport.mount(renderScene(scene.root, ctx));
  // The scene's own XuiCanvas decides the canvas; only the dashboard root is
  // 1120x770, and only that one gets the console's view transform.
  viewport.setCanvas({ w: report.canvas.w, h: report.canvas.h });
  publish(t, report);

  const engine = bindTimelines(nodes);
  const audio = AudioBank.index(assets, params.has('mute'));
  if (!params.has('mute')) audio.unlockOnGesture();
  audio.attach(engine);
  const filled = await populateLists(scene, ctx, nodes, engine, strings, locale);
  const lists = filled.lists;
  if (lists.length) {
    // The still route reproduces f0060, where the operator had scrolled to
    // Locale; the shell arrives on row 0 the way a fresh list does.
    const wanted = Number(params.get('focus') ?? String(filled.stillFocus));
    t.focusId = lists[0]!.focus(Number.isFinite(wanted) ? wanted : 0, 'InitFocus');
  }
  // The visibility snapshot inside renderScene measured the scene BEFORE the
  // lists were filled, so an empty lstSettings read as invisible. Retake it.
  refreshVisibility(viewport.canvas.firstElementChild as HTMLElement, report);
  publish(t, report);
  const input = installInput(engine, lists, t, audio, viewportHost);
  onDispose(() => { input.detach(); audio.close(); viewport.dispose(); });
  installApi(engine, t, input, audio, lists);
  runClock(engine, t);

  if (params.has('debug')) mountInspector(host, scene.root, viewport.canvas);
}

/** ?frame= and ?play= are the deterministic entry points; without either, the
 *  scene stays on the still frame the renderer chose and nothing ticks. */
function runClock(engine: TimelineEngine, t: DashTelemetry): void {
  const frame = params.get('frame');
  if (frame !== null && Number.isFinite(Number(frame))) engine.freeze(Number(frame));

  for (const spec of params.getAll('play')) {
    const m = /^(.*?):([^-]+)(?:-(.+))?$/.exec(spec);
    if (!m) { t.errors.push(`bad ?play= "${spec}"`); continue; }
    const [, wanted, from, to] = m;
    const scope = engine.all().find((s) => s.id === wanted || s.id.endsWith('/' + wanted) || s.obj.className === wanted);
    if (!scope) { t.errors.push(`?play= names no scope: "${wanted}"`); continue; }
    if (!engine.playRange(scope.id, from!, to)) t.errors.push(`?play= no named frame "${from}" in ${scope.id}`);
  }

  // ?frame= pins the engine outright, and ?manual hands the clock to the test
  // harness; either way nothing advances on its own.
  if (params.has('manual') || engine.frozenAt !== null) {
    t.timeline = { ...engine.report(), fps: 0 };
    return;
  }

  let last = performance.now();
  let stepped = 0;
  let window1s = last;
  let raf = 0;
  liveClocks += 1;
  const loop = (now: number) => {
    stepped += engine.tick(now - last);
    last = now;
    if (now - window1s >= 1000) {
      t.timeline = { ...engine.report(), fps: Math.round((stepped * 1000) / (now - window1s)) };
      stepped = 0; window1s = now;
    } else {
      t.timeline = { ...engine.report(), fps: t.timeline.fps };
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  // A clock that outlives its engine keeps a whole shell alive and stepping in
  // a page the user cannot see - the second half of the dev-server leak.
  onDispose(() => { cancelAnimationFrame(raf); liveClocks -= 1; });
}

function installApi(engine: TimelineEngine, t: DashTelemetry, input: InputRouter, audio: AudioBank, lists: ListView[]): void {
  window.__dashApi = {
    engine, input, audio,
    press: (b) => { const ok = input.press(b as Button); syncInput(t, input, audio); return ok; },
    lists: () => lists.map((l) => l.id),
    focusList: (id, i) => {
      const l = lists.find((x) => x.id === id);
      const f = l ? l.focus(i) : null;
      t.focusId = f;
      return f;
    },
    setState: (controlId, state) => { const ok = engine.setState(controlId, state); t.timeline = { ...engine.report(), fps: t.timeline.fps }; return ok; },
    playRange: (scopeId, from, to) => { const ok = engine.playRange(scopeId, from, to); t.timeline = { ...engine.report(), fps: t.timeline.fps }; return ok; },
    stepFrames: (n) => { for (let i = 0; i < n; i++) engine.step(); t.timeline = { ...engine.report(), fps: t.timeline.fps }; },
    scopeIds: () => engine.all().map((s) => s.id),
    remount: async () => { teardown(); await main(); },
  };
}

/* ------------------------------------------------------------- the NXE shell */

/**
 * ?build=9199. The NXE home page is not a scene: homepage/homepage.xur is three
 * empty groups, and NxeShell composes the channel queue and the panel strip out
 * of homepage/emb_homepage.xml, the epix:// channel files and
 * controlp/Variables.xur. &page=<pack>/<file> hosts a legacy 880x480 page in the
 * same shell instead.
 */
async function nxe(assets: AssetIndex, skin: Skin, t: DashTelemetry): Promise<void> {
  const viewportHost = document.createElement('div');
  viewportHost.className = 'xui-viewport';
  mountHost.appendChild(viewportHost);
  const zoom = Number(params.get('zoom') ?? '1') || 1;
  // consoleView is still the right flag: it just resolves to the IDENTITY view
  // transform on 9199, whose scenes are 1280x720 and land 1:1 (build.ts).
  const viewport = new Viewport(viewportHost, { consoleView: !params.has('design'), zoom });

  const report = emptyReport('homepage/homepage.xur');
  const nodes = new NodeIndex();
  const engine = new TimelineEngine();
  const strings = new Strings(assets);
  const locale = params.get('locale') ?? DEFAULT_LOCALE;
  t.locale = locale;

  const shell = await NxeShell.mount({
    assets, skin, nodes, engine, report, host: viewport.canvas, strings, locale,
    state: {
      page: params.get('page'),
      channel: params.get('channel'),
      iptv: params.has('iptv'),
      avPack0: params.has('avpack0'),
      // Every console-state predicate is a switch, because none of them can be
      // answered from this archive; the defaults are the offline/no-profile
      // state the 8955 capture is in (dashboards/nxe/epix.ts).
      liveTierNone: !params.has('live'),
      hdDvdInstalled: params.has('hddvd'),
      mediaroomEnabled: params.has('mediaroom'),
      showWelcomeChannel: !params.has('nowelcome'),
    },
    render: (root, ctx) => renderScene(root, ctx),
  });
  viewport.setCanvas({ w: report.canvas.w, h: report.canvas.h });
  await shell.idle();
  publish(t, report);
  t.nxe = shell.report();

  const audio = AudioBank.index(assets, params.has('mute'));
  if (!params.has('mute')) audio.unlockOnGesture();
  audio.attach(engine);
  // The eight navigation cues are named in a CODE table and played by the GLUE
  // (NXE_GLUE_SPEC §2.3), the opposite of the Blades rule where every cue is a
  // XuiSoundXAudio.File keyframe. So the shell gets the bank, not the engine.
  shell.attach(audio);
  const input = installNxeInput(shell, t, audio, viewportHost);
  onDispose(() => { input.detach(); audio.close(); shell.dispose(); viewport.dispose(); });
  installApi(engine, t, input, audio, []);
  const api = window.__dashApi!;
  api.nxe = () => shell.report();
  api.nxeShell = {
    left: () => nxeStep(shell, t, audio, () => shell.movePanel(-1)),
    right: () => nxeStep(shell, t, audio, () => shell.movePanel(1)),
    up: () => nxeStep(shell, t, audio, () => shell.moveChannel(1)),
    down: () => nxeStep(shell, t, audio, () => shell.moveChannel(-1)),
    press: async () => { const ok = await shell.press(); await shell.idle(); syncNxe(t, shell, audio); return ok; },
    back: () => nxeStep(shell, t, audio, () => shell.back()),
    x: async () => { const ok = await shell.pressKey('X'); await shell.idle(); syncNxe(t, shell, audio); return ok; },
    y: async () => { const ok = await shell.pressKey('Y'); await shell.idle(); syncNxe(t, shell, audio); return ok; },
    idle: async () => { await shell.idle(); syncNxe(t, shell, audio); },
    report: () => shell.report(),
  };
  syncNxe(t, shell, audio);
  runClock(engine, t);

  if (params.has('debug')) mountInspector(host, shell.home.root, viewport.canvas);
}

/**
 * NXE's pad. Left/right move the PANEL cursor and up/down the CHANNEL cursor -
 * the opposite axis assignment to Blades, where left/right switch the blade,
 * and it is the file's: `MobyPanelInput*` is named for the d-pad's horizontal
 * axis and `MobyChannelInput*` for the vertical [SPEC §2.3]. A is the focused
 * slot's `<onclick>`, B pops the page stack.
 */
function installNxeInput(shell: NxeShell, t: DashTelemetry, audio: AudioBank, touchHost: HTMLElement): InputRouter {
  const router = new InputRouter();
  router.push({
    id: 'nxe',
    onButton: (b) => {
      if (b === Button.Left) shell.movePanel(-1);
      else if (b === Button.Right) shell.movePanel(1);
      // UP moves to the channel drawn ABOVE the current one, which is the NEXT
      // channel in file order (NxeShell's QUEUE_ROWS header).
      else if (b === Button.Up) shell.moveChannel(1);
      else if (b === Button.Down) shell.moveChannel(-1);
      else if (b === Button.A) { void shell.press().then(() => shell.idle()).then(() => syncNxe(t, shell, audio)); }
      else if (b === Button.B) shell.back();
      // X and Y go to the hosted page's control bound by `PressKey` (0x5802 /
      // 0x5803: memory/DeviceSelector's legend_y "Device Options") (M4e).
      else if (b === Button.X || b === Button.Y) { void shell.pressKey(b === Button.X ? 'X' : 'Y').then(() => shell.idle()).then(() => syncNxe(t, shell, audio)); }
      else if (b === Button.Guide) noteGuide(t);
      else return;
      syncNxe(t, shell, audio);
    },
  });
  router.attach();
  // NXE's axes are the other way round to Blades: horizontal is the panel
  // cursor, vertical the channel cursor. The finger rule is the same one -
  // swipe the way you want the strip to travel.
  onDispose(attachTouch(router, {
    target: touchHost,
    tap: (x, y) => nxeTap(shell, router, x, y),
    swipeX: { left: Button.Right, right: Button.Left },
    swipeY: { up: Button.Down, down: Button.Up },
    back: Button.B,
    log: t.touch,
  }));
  return router;
}

/**
 * What one finger does on NXE.
 *
 * On a hosted page it is the same focus walk as Blades, against the page's own
 * rows. On the home strip there is no focus chain, there is a panel CURSOR, so
 * a tap on the front panel is A and a tap on any other panel walks the cursor
 * to it one Left/Right at a time - the strip's own velocity integrator does the
 * moving, so the motion is the console's.
 *
 * The tap finds its slot without the shell being asked anything: every panel
 * wrapper carries `data-nxe-screen`, the projected "x,y" the report prints for
 * that slot, so the nearest projected panel to the wrapper under the finger IS
 * the slot. Nearest rather than equal because the strip may have stepped a
 * frame between the paint and the read.
 */
function nxeTap(shell: NxeShell, router: InputRouter, x: number, y: number): TapResult {
  const r = shell.report();
  if (r.legacy) {
    const hits = controlHits(x, y);
    if (!hits.length) return false;
    return tapped(tapFocus({
      x, y, ids: hits,
      focusId: () => shell.report().legacy?.focusId ?? null,
      press: (b) => router.press(b),
    }));
  }
  const wrapper = elementsAt(x, y).find((e) => e.dataset?.['nxeScreen']);
  const key = wrapper?.dataset['nxeScreen'];
  if (!key) return false;
  const [px, py] = key.split(',').map(Number);
  if (px === undefined || py === undefined || !Number.isFinite(px) || !Number.isFinite(py)) return false;
  let slot = -1;
  let best = Infinity;
  r.panels.forEach((p, i) => {
    const d = Math.hypot(p.screen.x - px, p.screen.y - py);
    if (d < best) { best = d; slot = i; }
  });
  if (slot < 0) return false;
  const front = Math.round(r.motion.panel.target);
  if (slot === front) { router.press(Button.A); return 'press'; }
  walk(() => Math.round(shell.report().motion.panel.target), slot, (d) => router.press(d > 0 ? Button.Right : Button.Left));
  return 'focus';
}

/**
 * Step an integer cursor to `to`, one press at a time, re-reading it after
 * each. A press the shell refuses (a transition is running, or the cursor is
 * at the end of its range) leaves the value where it was, and that is the
 * signal to stop: a fixed step count would keep pressing into a wall.
 */
function walk(read: () => number, to: number, press: (dir: -1 | 1) => void, max = 16): void {
  for (let i = 0; i < max; i++) {
    const at = read();
    if (at === to) return;
    press(at < to ? 1 : -1);
    if (read() === at) return;
  }
}

function nxeStep(shell: NxeShell, t: DashTelemetry, audio: AudioBank, fn: () => boolean): boolean {
  const ok = fn();
  syncNxe(t, shell, audio);
  void shell.idle().then(() => syncNxe(t, shell, audio));
  return ok;
}

function syncNxe(t: DashTelemetry, shell: NxeShell, audio: AudioBank): void {
  t.nxe = shell.report();
  t.input = window.__dashApi?.input.log.slice(-40).map((e) => ({ button: e.button, repeat: e.repeat, layer: e.layer })) ?? t.input;
  t.cues = audio.log.slice(-60).map((e) => ({ cue: e.cue, scope: e.scope, tick: e.tick, played: e.played }));
  t.lastCue = audio.log.length ? audio.log[audio.log.length - 1]!.cue : t.lastCue;
}

/* ------------------------------------------------------------------- input */

/** One layer per scene: the top of the stack owns every press. */
function installInput(engine: TimelineEngine, lists: ListView[], t: DashTelemetry, audio: AudioBank, touchHost: HTMLElement): InputRouter {
  const router = new InputRouter();
  router.push({
    id: 'scene',
    onButton: (b) => {
      if (b === Button.Guide) { noteGuide(t); return; }
      const list = lists[0];
      if (!list) return;
      // Every cue below comes out of a visual's own File track: the row's
      // Focus frame carries btn_Focus.xma, its Press frame btn_Select.xma and
      // legend_B's Press frame btn_Back.xma. move() returns null when the
      // clamp absorbed it: nothing happened, so nothing plays, no state
      // re-entry and no cue. A held d-pad at the end of a list is silent on
      // the console too.
      if (b === Button.Down || b === Button.Up) {
        const moved = list.move(b === Button.Down ? 1 : -1);
        if (moved !== null) t.focusId = moved;
      } else if (b === Button.A) {
        const row = list.focusIndex;
        if (row >= 0) engine.setState(`${list.id}_item${row}`, 'Press');
      } else if (b === Button.B) {
        engine.setState('legend_b', 'Press');
      }
      syncInput(t, router, audio);
    },
  });
  router.attach();
  onDispose(attachTouch(router, {
    target: touchHost,
    tap: (x, y) => {
      const hits = controlHits(x, y);
      if (!hits.length) return false;
      return tapped(tapFocus({ x, y, ids: hits, focusId: () => t.focusId, press: (b) => router.press(b) }));
    },
    swipeX: null,
    swipeY: { up: Button.Down, down: Button.Up },
    back: Button.B,
    log: t.touch,
  }));
  return router;
}

function syncInput(t: DashTelemetry, input: InputRouter, audio: AudioBank): void {
  t.input = input.log.slice(-40).map((e) => ({ button: e.button, repeat: e.repeat, layer: e.layer }));
  t.cues = audio.log.slice(-40).map((e) => ({ cue: e.cue, scope: e.scope, tick: e.tick, played: e.played }));
  t.lastCue = audio.log.length ? audio.log[audio.log.length - 1]!.cue : t.lastCue;
}

async function gallery(assets: AssetIndex, skin: Skin, t: DashTelemetry): Promise<void> {
  const wrap = document.createElement('div');
  wrap.className = 'gallery';
  const h = document.createElement('h1');
  wrap.appendChild(h);
  host.appendChild(wrap);

  const ids = assets.scenePaths();
  h.textContent = `build ${assets.build} - ${ids.length} scenes`;

  for (const id of ids) {
    const report = emptyReport(id);
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.dataset['scene'] = id;
    const label = document.createElement('div');
    label.className = 'gallery-label';
    const frame = document.createElement('div');
    frame.className = 'gallery-frame';
    item.append(label, frame);
    wrap.appendChild(item);

    try {
      const scene = await loadScene(assets, id);
      report.unknownClasses.push(...scene.unknownClasses);
      const ctx: RenderCtx = { assets, pack: scene.pack, visuals: new VisualScope(indexVisuals(scene.root), skin), report };
      frame.appendChild(renderScene(scene.root, ctx));
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
    }
    label.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = id;
    label.appendChild(b);
    label.appendChild(summary(report));
    t.gallery.push(report);
  }
  publish(t, { ...emptyReport('(gallery)'), scene: '(gallery)' });
  t.gallery.forEach((r) => { t.objects += r.objects; t.controls += r.controls; });
}

function summary(r: SceneReport): HTMLElement {
  const bad = r.unknownClasses.length + r.unresolvedVisuals.length + r.missingImages.length + r.errors.length;
  const s = document.createElement('span');
  if (bad) s.className = 'bad';
  s.textContent = [
    `${r.objects} objects`,
    r.unknownClasses.length ? `unknown ${r.unknownClasses.join(',')}` : '',
    r.unresolvedVisuals.length ? `no visual ${r.unresolvedVisuals.join(',')}` : '',
    r.missingImages.length ? `missing ${r.missingImages.join(',')}` : '',
    r.errors.length ? `ERROR ${r.errors.join('; ')}` : '',
  ].filter(Boolean).join('  |  ');
  return s;
}
