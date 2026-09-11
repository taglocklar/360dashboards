// The living room, on a bare `/`.
//
// This is the gate on the one trick the whole route is built out of: the
// dashboard is a live DOM tree in a CSS3D layer, and the WebGL room in front
// of it has a HOLE punched through the television's glass. Every assertion
// below is about that hole, the sequence that opens it, and the wheel that
// changes what is behind it.
//
//   1. A bare `/` is the room, and the room is the DEFAULT - the launcher it
//      replaced is gone, and nothing that a judge or a screenshot gate opens
//      (?build=, ?gallery, ?scene=) may get a television in front of it.
//   2. The dashboard really is mounted inside the television: its viewport is
//      a descendant of the CSS3D layer's screen element, not of #app.
//   3. The set starts COLD. The glass is a mirror, no quadrant of the ring of
//      light is lit, and the console's boot animation has not played - if it
//      had, the viewer would arrive at a dashboard that has, as far as anyone
//      watching can tell, never booted.
//   4. The power button runs the sequence, in order and on the clock: ring,
//      relay, line, bloom, boot. Stepped by hand under &manual, so every one
//      of these is a frame count and not a wait.
//   5. The console's startup animation plays on the tube BEFORE the dashboard,
//      and hands over the way a real console does: the animation, then exactly
//      50 ms of black, then the dashboard's own boot range. It is the one part
//      of the sequence that cannot be hand-stepped - a <video> runs on its own
//      clock - so it is checked on the wall clock, and `&manual` skips it so
//      every other assertion in this file stays a frame count.
//   6. The wheel swaps the build IN PLACE and leaks nothing. The live-
//      singleton census is the check that matters: one viewport, one input
//      router, one audio context, one clock, however many dashboards this page
//      has had.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';

/** The room's own budget.
 *
 *  The triangles are almost all TWO objects: the authored Xbox 360 on the shelf
 *  is 186,732 of them and the controller on the table another 26,560, against
 *  about 9,000 for the entire rest of the room. It
 *  is kept at full detail deliberately - it is the thing the whole route asks
 *  you to walk up to and press - and it costs nothing measurable: the room
 *  holds 16.6 ms a frame at 1600x900 at devicePixelRatio 2, which is vsync and
 *  not the GPU. The number to watch is DRAWS, which is what a room full of
 *  separate little props would blow, and the model contributes exactly one. */
const MAX_DRAWS = 240;
const MAX_TRIS = 300000;

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

mkdirSync(OUT, { recursive: true });
let browser;

async function load(url, w = 1280, h = 720) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 20000 }).catch(() => {});
  return { page, pageErrors, consoleErrors };
}

/** Step the room's clock by hand. Both clocks: the room's rAF and the
 *  dashboard's own 60 Hz timeline are separate, and only the room's warm-up is
 *  under test here. */
const step = (page, frames) => page.evaluate((n) => {
  for (let i = 0; i < n; i++) window.__roomApi.step(1 / 60);
  return window.__room();
}, frames);

try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader'],
  });

  /* ------------------------------------------ 1. a bare `/` is the room */
  // No parameters at all, which is the only thing anyone types. The rule is
  // NAMED `room` or NO PARAMETERS: every other suite and every judge in this
  // repo opens `/?blade=5&...` or `/?boot=none` with no build= and must still
  // get the bare stage, so this case and the flat cases below are one pair.
  {
    const { page } = await load('/');
    const m = await page.evaluate(() => ({ room: !!window.__room, wheel: !!window.__wheel }));
    check(m.room, 'a bare / did not build the room');
    check(m.wheel, 'a bare / has no wheel');
    await page.close();
  }

  {
    const { page, pageErrors, consoleErrors } = await load('/?room&mute&manual');
    check(pageErrors.length === 0, `?room: page errors: ${pageErrors.join(' | ')}`);
    check(consoleErrors.length === 0, `?room: console errors: ${consoleErrors.join(' | ')}`);
    const m = await page.evaluate(() => ({
      room: !!window.__room,
      wheel: !!window.__wheel,
      launcher: !!window.__launcher,
      dash: window.__dash && { build: window.__dash.build, scene: window.__dash.scene, errors: window.__dash.errors },
      // Is the dashboard really inside the television?
      inScreen: !!document.querySelector('.room-css3d .room-screen .crt-picture .xui-viewport .xui-stage'),
      strayViewport: !!document.querySelector('#app > .xui-viewport'),
    }));
    check(m.room, '?room: no room was built');
    check(m.wheel, '?room: the wheel is missing, so there is no way to choose a dashboard');
    check(!m.launcher, 'bare /: the launcher is still being built - it was retired when the wheel replaced it');
    check(m.inScreen, 'bare /: the dashboard is not inside the television - the CSS3D screen element has no viewport under it');
    check(!m.strayViewport, 'bare /: a viewport was mounted straight onto #app as well as onto the glass');
    check(m.dash && m.dash.build === '6770', `bare /: the default build is ${m.dash && m.dash.build}`);
    check(m.dash && m.dash.errors.length === 0, `?room: ${m.dash && m.dash.errors.join(' | ')}`);

    // The console on the shelf is an authored model that is fetched, decoded,
    // and then cut into five geometry groups so its own ring of light can be
    // lit a quadrant at a time. Every one of those steps fails SILENTLY - the
    // room simply keeps the stand-in box - so the room reports which it is
    // holding, as a fact. Do NOT infer this from `tris`: that is read off the
    // renderer's last render, and under `&manual` the room renders once at
    // build time, before anything fetched over the network can have arrived.
    // By the time the page says it is READY, the room must be the real room.
    // Every prop is built twice - a stand-in of the right size, then the
    // authored model - so a route that reveals before the models land shows a
    // white box on a shelf, a white slab on a table and a grey cabinet, and
    // then three pops. The loading screen exists to make that impossible, and
    // these three assertions are what say it still does.
    const built = await page.evaluate(() => ({
      room: window.__room(),
      loading: !!document.querySelector('.room-loading'),
      pad: window.__roomApi.padPoint() !== null,
    }));
    check(built.loading === false, 'the loading screen is still on the page after ready');
    check(built.room.console === 'model', 'ready with the stand-in box on the shelf, not the Xbox');
    check(built.room.tv === 'model', 'ready with the stand-in cabinet, not the television');
    check(built.pad, 'ready with no controller on the table');

    // The room's DRESSING - the shelves, the plushies, the table clutter. All
    // of it is procedural, so unlike the models and the posters there is no
    // fetch that can prove it arrived: an exception thrown halfway through
    // buildGamerShelf() would leave a room that still renders, still passes
    // every assertion above, and is simply empty again. The merged meshes are
    // named, so ask for them by name.
    const dressing = await page.evaluate(() => {
      const want = ['shelf-soft', 'shelf-hard', 'clutter-soft', 'clutter-hard'];
      const found = [];
      // The room hangs its scene off the canvas element's own three objects, so
      // walk what is actually rendering rather than a module-level handle.
      const seen = new Set(want);
      const walk = (o) => { if (seen.has(o.name)) found.push(o.name); o.children.forEach(walk); };
      walk(window.__roomApi.scene());
      return { found, want };
    });
    for (const w of dressing.want) {
      check(dressing.found.includes(w), `the room is missing its "${w}" dressing`);
    }

    // THE PICTURE IS ON THE HOLE.
    //
    // The dashboard is a DOM element placed by a homography onto the rectangle
    // the WebGL glass occupies (app/room/project.ts). Nothing else in this file
    // can tell whether it LANDED there: every assertion about the hole is about
    // the WebGL side, and the element's own layout box is correct even when the
    // picture is painted somewhere else entirely - which is precisely how iOS
    // put the dashboard low in the tube with its bottom cut off while Chrome
    // looked perfect.
    //
    // So compare the two directly: the quad the room projects the glass to, and
    // the box the browser gives the element. The element's box is the axis-
    // aligned bounds of that quad, so they must agree to within a pixel.
    const fit = await page.evaluate(() => window.__roomApi.screenFit());
    const xs = fit.quad.filter((_, i) => i % 2 === 0);
    const ys = fit.quad.filter((_, i) => i % 2 === 1);
    const want = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    const off = want.map((v, i) => Math.abs(v - fit.box[i]));
    check(Math.max(...off) <= 1.5,
      `the picture is not on the hole: projected ${want.map((v) => v.toFixed(1))} vs element ${fit.box.map((v) => v.toFixed(1))}`);
    check(fit.box[2] > 20 && fit.box[3] > 10, `the picture collapsed: ${fit.box.join(',')}`);

    // The room's own served assets. A missing one is silent in three.js too -
    // the prop keeps its fallback material and the scene renders fine - so a
    // deploy that dropped them would look right in every screenshot until
    // somebody leaned in.
    //
    // The STATUS IS NOT THE TEST, and for a long time this check thought it
    // was. Vite's dev server answers an unknown path with the SPA fallback:
    // `GET /room/nope.glb` returns **200 text/html**, the contents of
    // index.html. So a check that only asserted "200" could never fail, for any
    // asset, and it did not - deleting a file and re-running it passed. What
    // separates a served asset from the fallback is the CONTENT TYPE, so that
    // is what is asserted: 200, and anything but html.
    const assets = await page.evaluate(() => Promise.all(
      ['room/covers/halo3.jpg', 'room/covers/mw2.jpg', 'room/wall-art.svg',
       'room/posters/gears2.jpg', 'room/posters/bioshock.jpg', 'room/posters/fallout3.jpg',
       'room/posters/left4dead.jpg',
       'room/xbox360-startup.mp4', 'room/xbox360.glb', 'room/xbox360-controller.glb',
       'room/crt-tv.glb']
        .map((u) => fetch(u, { method: 'HEAD' })
          .then((r) => `${u} ${r.status} ${(r.headers.get('content-type') || '?').split(';')[0]}`)
          .catch((e) => `${u} FAILED ${e.message}`))));
    for (const a of assets) {
      check(/ 200 /.test(a) && !/ text\/html$/.test(a), `room asset: ${a}`);
    }
    await page.close();
  }

  /* ---------------------------- the flat routes stay flat, with no room */
  // Every shape of URL the rest of the board opens. `/?boot=none` and
  // `/?blade=5&zoom=1.5` carry no build= at all and MUST still be flat: that
  // is the case that broke smoke-nav, smoke-blades and smoke-boot at once.
  for (const url of ['/?build=6770&blade=2&mute', '/?room=off&mute', '/?gallery&mute',
                     '/?boot=none', '/?blade=5&zoom=1.5&mute&manual', '/?scene=dashmain/dashmain.xur']) {
    const { page } = await load(url);
    const m = await page.evaluate(() => ({ room: !!window.__room, gl: !!document.querySelector('.room-gl') }));
    check(!m.room, `${url}: a living room was built on a route a gate measures`);
    check(!m.gl, `${url}: a WebGL canvas is in front of the console's output`);
    await page.close();
  }

  /* ------------------------------------------------- 2. the cold set */
  {
    const { page } = await load('/?room&mute&manual');
    const cold = await page.evaluate(() => ({
      room: window.__room(),
      // The shell is parked on its rest state, NOT booted.
      shell: window.__dashApi.shell.report(),
    }));
    check(cold.room.powered === false, 'cold: the set was already on');
    check(cold.room.glass === 'mirror', `cold: the glass is "${cold.room.glass}"`);
    check(cold.room.ring === 0, `cold: ${cold.room.ring} quadrants of the ring were lit`);
    check(cold.room.warm === -1, `cold: warm is ${cold.room.warm}, so a sequence is already running`);
    check(cold.room.pushed === 0, `cold: the camera is ${cold.room.pushed} of the way in before the power button`);
    check(cold.room.draws <= MAX_DRAWS, `cold: ${cold.room.draws} draw calls, budget ${MAX_DRAWS}`);
    check(cold.room.tris <= MAX_TRIS, `cold: ${cold.room.tris} triangles, budget ${MAX_TRIS}`);

    /* --------------------------------------- 3. the power-on sequence */
    // Every number below is a frame count against app/room/crt.ts's WARMUP.
    await page.evaluate(() => window.__roomApi.press());
    const at = async (seconds) => step(page, 0).then(() => page.evaluate((s) => {
      // Rewind is not a thing: walk forward from wherever we are.
      while (window.__room().warm < s - 1e-6) window.__roomApi.step(1 / 60);
      return window.__room();
    }, seconds));

    const t0 = await step(page, 0);
    check(t0.ring >= 1, `press: the ring did not light at all (${t0.ring})`);
    check(t0.glass === 'mirror', 'press: the glass became a hole before the relay');

    const t02 = await at(0.24);
    check(t02.ring === 4, `t=0.24: ${t02.ring} quadrants lit, expected the sweep to be done`);
    check(t02.glass === 'mirror', 't=0.24: the tube went live before the relay at 0.30');

    const t04 = await at(0.34);
    check(t04.glass === 'hole', 't=0.34: the tube is still a mirror after the relay');

    const t05 = await at(0.50);
    const line = await page.evaluate(() => {
      const el = document.querySelector('.crt-picture');
      const m = /scaleY\(([\d.]+)\)/.exec(el.style.transform || '');
      return m ? Number(m[1]) : null;
    });
    check(line !== null && line < 0.02, `t=0.50: the picture is ${line} of full height - it should still be a line`);
    check(t05.pushed > 0 && t05.pushed < 1, `t=0.50: the camera push is ${t05.pushed}`);

    const t10 = await at(1.05);
    const open = await page.evaluate(() => {
      const el = document.querySelector('.crt-picture');
      const m = /scaleY\(([\d.]+)\)/.exec(el.style.transform || '');
      return m ? Number(m[1]) : null;
    });
    check(open !== null && open > 0.98, `t=1.05: the picture only opened to ${open}`);
    check(t10.ring === 4, `t=1.05: ${t10.ring} quadrants lit`);

    // The boot: the shell was parked before the press and is playing after it.
    const booted = await page.evaluate(() => window.__dashApi.shell.report());
    check(booted.tab !== undefined, 'the shell report has no tab');
    check(JSON.stringify(booted) !== JSON.stringify(cold.shell),
      'the console never booted: the shell report is identical before and after the power button');

    const settled = await at(2.4);
    check(settled.pushed === 1, `t=2.4: the camera is ${settled.pushed} of the way in`);
    await page.screenshot({ path: `${OUT}/room-on.png` });
    await page.close();
  }

  /* --------------------------------- 4. the console's startup animation */
  {
    const { page, pageErrors, consoleErrors } = await load('/?room&mute');
    const idle = await page.evaluate(() => window.__room());
    check(idle.startup === 'idle', `cold: the startup animation is "${idle.startup}"`);

    await page.evaluate(() => window.__roomApi.press());
    // It has to be PLAYING and it has to be the real clip: a layer that is
    // present but stalled at t=0 is what a missing or undecodable file looks
    // like, and the whole point of the fallback is that it does not hang.
    await page.waitForFunction(() => window.__room().startup === 'playing', { timeout: 8000 })
      .catch(() => check(false, 'the startup animation never started playing'));
    await page.waitForFunction(() => {
      const v = document.querySelector('.crt-boot-video');
      return v && v.currentTime > 0.5 && !v.paused;
    }, { timeout: 8000 }).catch(() => check(false, 'the startup video never advanced past 0.5 s'));

    const mid = await page.evaluate(() => {
      const v = document.querySelector('.crt-boot-video');
      return {
        room: window.__room(),
        w: v.videoWidth, h: v.videoHeight, dur: +v.duration.toFixed(2),
        muted: v.muted,
        // While it is playing the dashboard must NOT be showing through.
        covered: !document.querySelector('.crt-boot').hidden,
        // And the animation is the picture, so the tube's own transform is on
        // it as well - not just on the dashboard underneath.
        xf: document.querySelector('.crt-boot').style.transform,
      };
    });
    check(mid.w === 1280 && mid.h === 720, `the startup clip is ${mid.w}x${mid.h}, not the console's output size`);
    check(Math.abs(mid.dur - 5.81) < 0.1, `the startup clip is ${mid.dur}s, expected 5.81`);
    check(mid.muted === true, '&mute did not mute the startup animation');
    check(mid.covered, 'the dashboard is visible underneath while the startup animation is playing');
    check(/scaleY/.test(mid.xf), `the tube's transform is not applied to the startup layer ("${mid.xf}")`);
    check(mid.room.glass === 'hole', `the glass is "${mid.room.glass}" while the animation plays`);

    // The hand-off: black, with the layer still opaque over the dashboard.
    const black = await page.evaluate(() => new Promise((done) => {
      const seen = [];
      const tick = () => {
        const s = window.__room().startup;
        if (s === 'black') {
          const el = document.querySelector('.crt-boot');
          seen.push({
            hidden: el.hidden,
            bg: getComputedStyle(el).backgroundColor,
            vis: getComputedStyle(document.querySelector('.crt-boot-video')).visibility,
            t: performance.now(),
          });
        }
        if (s === 'done' || s === 'unavailable' || s === 'skipped') return done({ end: s, seen });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    check(black.end === 'done', `the startup animation ended as "${black.end}"`);
    check(black.seen.length > 0, 'the 50 ms cut to black between the animation and the dashboard never happened');
    for (const f of black.seen) {
      check(f.hidden === false, 'the black layer was hidden during the cut, so the dashboard showed through it');
      check(f.bg === 'rgb(0, 0, 0)', `the cut is ${f.bg}, not black`);
      check(f.vis === 'hidden', 'the last video frame is still visible during the cut');
    }
    if (black.seen.length > 1) {
      const ms = black.seen[black.seen.length - 1].t - black.seen[0].t;
      // Measured at 50 ms (3 frames at 60 fps). A setTimeout cannot be exact,
      // so this is a sanity band, not the measurement.
      check(ms < 200, `the cut to black lasted ${Math.round(ms)} ms, and it is 50 ms on a real console`);
    }

    // And only NOW does the dashboard boot.
    await page.waitForFunction(() => window.__room().startup === 'done', { timeout: 5000 });
    const after = await page.evaluate(() => ({
      hidden: document.querySelector('.crt-boot').hidden,
      shell: window.__dashApi.shell.report(),
    }));
    check(after.hidden === true, 'the startup layer is still on screen after the hand-off');
    check(pageErrors.length === 0, `startup: page errors: ${pageErrors.join(' | ')}`);
    check(consoleErrors.length === 0, `startup: console errors: ${consoleErrors.join(' | ')}`);
    await page.screenshot({ path: `${OUT}/room-startup-done.png` });
    await page.close();
  }

  /* ------------------- the controller is the other power button */
  {
    const { page } = await load('/?room&mute');
    await page.waitForFunction(() => window.__room().console === 'model', { timeout: 20000 })
      .catch(() => check(false, 'pad: the console model never loaded'));
    const cold = await page.evaluate(() => ({ r: window.__room(), pad: window.__roomApi.padPoint() }));
    // A 360's pad is dark until the console it is bound to comes on, and that
    // is the whole reason the ring is a number the room owns rather than a
    // baked emissive.
    check(cold.r.padLit === false, 'the controller was lit before the console was on');
    check(cold.r.powered === false, 'the set was on before anything was clicked');
    check(!!cold.pad, 'the controller does not project to a screen point, so nothing can click it');
    if (cold.pad) {
      check(cold.pad.x > 0 && cold.pad.y > 0, `the controller projects off screen at ${cold.pad.x},${cold.pad.y}`);
      // Reaching for the PAD to turn the console on is what anybody actually
      // did; a room whose only start is to lean down and press the box reads
      // as a puzzle.
      await page.mouse.click(cold.pad.x, cold.pad.y);
      await page.waitForFunction(() => window.__room().powered, { timeout: 5000 })
        .catch(() => check(false, 'a click on the controller did not press power'));
      await page.waitForFunction(() => window.__room().padLit, { timeout: 5000 })
        .catch(() => check(false, "the controller's own ring never lit with the console's"));
    }
    await page.close();
  }

  /* ------------------------- the wheel can turn the console off again */
  {
    const { page } = await load('/?room&mute');
    await page.waitForFunction(() => window.__room().console === 'model', { timeout: 20000 });
    await page.evaluate(() => window.__roomApi.press());
    await page.waitForFunction(() => window.__room().startup === 'done', { timeout: 20000 })
      .catch(() => check(false, 'power cycle: the set never finished coming on'));

    await page.click('.wheel-hub');
    const label = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.wheel-spoke')].find((e) => /Power/.test(e.querySelector('b').textContent));
      return el ? el.querySelector('b').textContent : null;
    });
    // The label is the ACTION, not the state.
    check(label === 'Power off', `with the set on, the wheel offers "${label}"`);
    await page.evaluate(() => [...document.querySelectorAll('.wheel-spoke')]
      .find((e) => /Power/.test(e.querySelector('b').textContent)).click());
    await page.waitForFunction(() => !window.__room().powered, { timeout: 5000 })
      .catch(() => check(false, 'the wheel did not turn the console off'));

    const off = await page.evaluate(() => window.__room());
    check(off.glass === 'mirror', `off: the glass is "${off.glass}"`);
    check(off.ring === 0, `off: ${off.ring} quadrants of the ring are still lit`);
    check(off.padLit === false, 'off: the controller is still lit');
    // Re-armed, not spent: a power CYCLE shows the startup animation the second
    // time as well as the first, because the console did.
    check(off.startup === 'idle', `off: the startup animation is "${off.startup}", so it cannot play again`);

    await page.evaluate(() => window.__roomApi.press());
    await page.waitForFunction(() => window.__room().startup === 'playing', { timeout: 10000 })
      .catch(() => check(false, 'the startup animation did not replay on the second power-on'));
    await page.close();
  }

  // Two routes must skip it: a gate that asked to arrive settled, and anyone
  // who has seen it enough times.
  for (const [url, why] of [['/?room&power=on&mute', '&power=on'], ['/?room&startup=off&mute', '&startup=off']]) {
    const { page } = await load(url);
    if (why === '&startup=off') await page.evaluate(() => window.__roomApi.press());
    await new Promise((r) => setTimeout(r, 900));
    const m = await page.evaluate(() => ({ room: window.__room(), hidden: document.querySelector('.crt-boot').hidden }));
    check(m.room.startup !== 'playing', `${why}: the startup animation is playing anyway`);
    check(m.hidden === true, `${why}: the startup layer is on screen`);
    check(m.room.powered === true, `${why}: the set is not on`);
    await page.close();
  }

  /* ------------------------------------------- 5. the wheel swaps in place */
  {
    const { page, pageErrors, consoleErrors } = await load('/?room&power=on&mute');
  /* ------------------------ the picture is PAINTED where it is placed */
  // screenFit() above proves the element's box sits on the hole. It cannot
  // prove the PIXELS do: Chrome's GPU rasteriser painted a `matrix3d` whose
  // perspective lived in its w-row with the blades sliced into horizontal
  // bands, shifted and missing - and every box, every transform string and
  // every layout query was correct while it did. The same page with GPU
  // rasterisation off was pixel-clean. So that is the test: render the lit
  // screen twice, on the GPU raster path everybody's Chrome uses and on the
  // CPU path, and require them to agree. Geometry is identical by
  // construction, so anything below 0.99 is a raster bug, not a tolerance.
  {
    const url = '/?room&power=on&mute';
    const clipOf = async (page) => {
      const fit = await page.evaluate(() => window.__roomApi.screenFit());
      const [x, y, w, h] = fit.box;
      return { x: Math.ceil(x) + 2, y: Math.ceil(y) + 2, width: Math.floor(w) - 4, height: Math.floor(h) - 4 };
    };
    // &power=on skips the startup animation, so "settled" is lit and not
    // playing - not 'done', which only a played animation reaches.
    const settle = (page) => page.waitForFunction(
      () => window.__room().powered && window.__room().startup !== 'playing' && window.__room().console === 'model',
      { timeout: 20000 }).then(() => new Promise((r) => setTimeout(r, 800)));
    const { page: gpu } = await load(url, 1600, 900);
    await settle(gpu);
    const clip = await clipOf(gpu);
    await gpu.screenshot({ path: `${OUT}/room-raster-gpu.png`, clip });
    await gpu.close();

    const cpuBrowser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader', '--disable-gpu-rasterization'],
    });
    const cpu = await cpuBrowser.newPage();
    await cpu.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    await cpu.goto(`${BASE}${url}`, { waitUntil: 'networkidle0' });
    await cpu.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 20000 }).catch(() => {});
    await settle(cpu);
    const clip2 = await clipOf(cpu);
    check(clip2.x === clip.x && clip2.width === clip.width, `raster: the two browsers placed the picture differently (${JSON.stringify(clip)} vs ${JSON.stringify(clip2)})`);
    await cpu.screenshot({ path: `${OUT}/room-raster-cpu.png`, clip });
    await cpuBrowser.close();

    const a = readPng(`${OUT}/room-raster-gpu.png`);
    const b = readPng(`${OUT}/room-raster-cpu.png`);
    const c = compare(a, b, { x: 0, y: 0, w: clip.width, h: clip.height });
    check(c.ncc >= 0.99,
      `raster: GPU and CPU rasterisation disagree on the picture (ncc ${c.ncc.toFixed(4)}, mad ${c.mad.toFixed(2)}) - the transform on .room-screen is being painted wrongly; see app/room/project.ts`);
  }

    const before = await page.evaluate(() => ({ w: window.__wheel(), build: window.__dash.build }));
    check(before.w.open === false, 'the wheel is open before anything opened it');
    // Three dashboards and one action. The action is not a dashboard and must
    // not be counted as one, or "which builds does this thing run" stops being
    // answerable from the report.
    const builds = before.w.spokes.filter((s) => s.kind !== 'power');
    check(builds.length === 3, `the wheel offers ${builds.length} dashboards`);
    check(builds[2].disabled === true, 'Metro is offered as selectable, and it has no runtime');
    check(before.w.spokes.some((s) => s.kind === 'power'), 'the wheel has no way to turn the console off');
    check(before.build === '6770', `the wheel starts on ${before.build}`);
    // A CLOSED wheel shows nothing but its hub. The disabled spoke is the one
    // that escapes: `.wheel-spoke:disabled` outranks the `opacity: 0` that
    // hides a closed wheel, so Metro sat on top of the hub at 42% forever.
    const shut = await page.evaluate(() => [...document.querySelectorAll('.wheel-spoke')]
      .map((e) => ({ name: e.querySelector('b').textContent, o: Number(getComputedStyle(e).opacity) })));
    for (const sp of shut) check(sp.o === 0, `closed wheel: ${sp.name} is drawn at opacity ${sp.o}`);

    await page.click('.wheel-hub');
    const opened = await page.evaluate(() => window.__wheel().open);
    check(opened === true, 'the hub did not open the wheel');

    await page.evaluate(() => document.querySelectorAll('.wheel-spoke')[1].click());
    await page.waitForFunction(() => window.__dash && window.__dash.build === '9199', { timeout: 15000 })
      .catch(() => check(false, 'the wheel never swapped the build to 9199'));
    // The tube has to come back: a swap that leaves the picture collapsed is a
    // swap that looks like a crash.
    await page.waitForFunction(() => {
      const el = document.querySelector('.crt-picture');
      const m = /scaleY\(([\d.]+)\)/.exec(el.style.transform || '');
      return m && Number(m[1]) > 0.98;
    }, { timeout: 15000 }).catch(() => check(false, 'the picture never re-opened after the swap'));

    const after = await page.evaluate(() => ({
      build: window.__dash.build,
      scene: window.__dash.scene,
      hmr: window.__dash.hmr,
      errors: window.__dash.errors,
      wheel: window.__wheel(),
      search: location.search,
      room: window.__room(),
      inScreen: !!document.querySelector('.room-screen .crt-picture .xui-viewport'),
      viewports: document.querySelectorAll('.xui-viewport').length,
    }));
    check(after.build === '9199', `after the swap the build is ${after.build}`);
    check(after.scene === 'homepage/homepage.xur', `after the swap the scene is ${after.scene}`);
    check(after.errors.length === 0, `after the swap: ${after.errors.join(' | ')}`);
    check(after.wheel.changes.join(',') === '9199', `the wheel logged changes ${after.wheel.changes.join(',')}`);
    check(after.viewports === 1, `${after.viewports} viewports are in the document after one swap`);
    check(after.inScreen, 'after the swap the new dashboard is not inside the television');
    // The census. This is the assertion that catches a swap leaking a shell.
    check(after.hmr.mounts === 2, `the census says ${after.hmr.mounts} mounts after one swap`);
    check(after.hmr.viewports === 1, `${after.hmr.viewports} live viewports after one swap`);
    check(after.hmr.inputRouters === 1, `${after.hmr.inputRouters} attached input routers after one swap`);
    check(after.hmr.audioContexts === 1, `${after.hmr.audioContexts} open audio contexts after one swap`);
    check(after.hmr.clocks === 1, `${after.hmr.clocks} running clocks after one swap`);
    // A refresh has to land back in the room, not on the flat stage.
    check(/[?&]room(=|&|$)/.test(after.search), `the wheel wrote "${after.search}", which does not come back to the room`);
    check(after.room.powered === true, 'the set went off during the swap');
    check(pageErrors.length === 0, `swap: page errors: ${pageErrors.join(' | ')}`);
    check(consoleErrors.length === 0, `swap: console errors: ${consoleErrors.join(' | ')}`);
    await page.screenshot({ path: `${OUT}/room-nxe.png` });
    await page.close();
  }
} finally {
  if (browser) await browser.close();
}

if (fails.length) {
  console.error(`smoke-room FAIL (${fails.length})`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('smoke-room PASS');
