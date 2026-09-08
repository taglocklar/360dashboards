// The television, and the one trick the whole room is built on.
//
// The dashboard is a DOM tree - that is not a limitation to work around, it is
// the project: packages/runtime renders XUI scenes into elements with the
// console's own measured transforms on them. So the picture on this set is the
// REAL dashboard, live, at 60 Hz, in a CSS3DRenderer layer, and the WebGL room
// is composited on top of it with a hole cut where the glass is.
//
//   WebGL canvas    bezel, cabinet, room, glare        alpha-composited
//         |                                            over
//   CSS3D layer     .room-screen -> .xui-viewport -> the dashboard
//
// The hole is a mesh in the WebGL scene whose material writes rgba(0,0,0,0)
// with blending DISABLED. NoBlending means the fragment REPLACES what is in
// the framebuffer rather than mixing with it, so the pixels of the glass end
// up fully transparent and the browser shows the DOM through them. It still
// writes depth, so anything the room puts in front of the television - a
// controller on the table, the edge of the couch - occludes the picture
// correctly, and anything behind it is depth-rejected.
//
// What this costs: no post-processing shader can touch the picture, because
// the picture is never in the framebuffer. Every CRT artefact on the glass is
// therefore a CSS or SVG filter on the DOM (see crt.ts), and only the
// reflections and the glare - which live in FRONT of the glass - are WebGL.
import * as T from 'three';
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { buildCrt, type Crt } from './crt';
import { STAND } from './props/stand';
import { buildStartup, type Startup } from './startup';
import { PX, SCREEN, SCREEN_PX } from './constants';

/** Cabinet of a 34" widescreen HD CRT. A set this size is 100 kg of glass and
 *  it should look like it: the depth is not styling, it is why the thing sits
 *  on a stand of its own and why the room is arranged around it. */
const CAB = { w: 0.94, h: 0.63, d: 0.60 } as const;
/** Bezel widths around the picture. The bottom is thicker than the top - that
 *  asymmetry is the single most recognisable thing about a CRT's face. */
const BEZEL = { top: 0.075, side: 0.094, bottom: 0.132 } as const;

export interface TvScreen {
  group: T.Group;
  /** The element the dashboard mounts into: 1280x720 CSS px of screen, inside
   *  the tube's own warm-up wrapper. */
  host: HTMLElement;
  /** The warm-up. The room steps it; nothing else touches the picture. */
  crt: Crt;
  /** The console's own startup animation, which is the picture until the
   *  dashboard is. */
  startup: Startup;
  /** The CSS3D node the renderer positions. */
  css: CSS3DObject;
  /** true once the picture is live and the glass is a hole. */
  readonly on: boolean;
  /** true once the authored television has replaced the stand-in box. */
  readonly modelLoaded: boolean;
  setOn(on: boolean): void;
  dispose(): void;
}

export function buildScreen(base: string, manager: T.LoadingManager): TvScreen {
  const group = new T.Group();
  group.name = 'television';
  const owned: (T.Material | T.BufferGeometry)[] = [];
  const keep = <X extends T.Material | T.BufferGeometry>(x: X): X => { owned.push(x); return x; };

  // --------------------------------------------------------------- cabinet
  // An authored Magnavox CRT/DVD/VHS combo (public/room/crt-tv.glb; NOTICE says
  // whose). It is the one model in this room that needed NO measure-and-fit
  // block: it was built against the room's own constants, so its y=0 is the
  // stand's top face, its z=0 IS THE GLASS PLANE - not the cabinet face - and
  // its +Z is the couch. Placing it is one position at scale 1.
  //
  // What arrives with it and is checked below: `sculptRuntime.screenOpening
  // .roomAssert`, the five numbers the model was cut against. If SCREEN or
  // STAND ever move, the aperture stops matching the picture and the failure is
  // silent and visual - a hairline of room around the dashboard, or a cropped
  // edge. One comparison at load time turns that into a console warning.
  const standIn = new T.Group();
  group.add(standIn);
  let tvLoaded = false;

  // The box and four bars that used to BE the television, kept as the stand-in
  // behind the loader's silent error path - the same shape the console and the
  // controller use. A missing or undecodable file leaves a set of roughly the
  // right size rather than a picture floating in mid air.
  const shellMat = keep(new T.MeshStandardMaterial({ color: 0x22242a, roughness: 0.42, metalness: 0.06 }));
  const cabinet = new T.Mesh(keep(new T.BoxGeometry(CAB.w, CAB.h, CAB.d)), shellMat);
  cabinet.position.set(0, SCREEN.y + (BEZEL.bottom - BEZEL.top) / 2, SCREEN.z - CAB.d / 2);
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  standIn.add(cabinet);

  const bezelMat = keep(new T.MeshStandardMaterial({ color: 0x2b2e35, roughness: 0.34, metalness: 0.08 }));
  const bezelZ = SCREEN.z + 0.004;
  const bar = (w: number, h: number, x: number, y: number) => {
    const m = new T.Mesh(keep(new T.BoxGeometry(w, h, 0.012)), bezelMat);
    m.position.set(x, y, bezelZ);
    m.castShadow = true;
    standIn.add(m);
  };
  const outerW = SCREEN.w + BEZEL.side * 2;
  bar(outerW, BEZEL.top, 0, SCREEN.y + SCREEN.h / 2 + BEZEL.top / 2);
  bar(outerW, BEZEL.bottom, 0, SCREEN.y - SCREEN.h / 2 - BEZEL.bottom / 2);
  bar(BEZEL.side, SCREEN.h, -(SCREEN.w + BEZEL.side) / 2, SCREEN.y);
  bar(BEZEL.side, SCREEN.h, (SCREEN.w + BEZEL.side) / 2, SCREEN.y);

  new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).load(
    `${base}room/crt-tv.glb`,
    (gltf) => {
      const tv = gltf.scene;
      tv.position.set(0, STAND.h, SCREEN.z);
      tv.traverse((n) => {
        const mesh = n as T.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Already OPAQUE on every material in this export, and asserted on the
        // exported bytes - but this is four lines and it is exactly the failure
        // that made the Xbox's front shell see-through.
        for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as T.Material[]) {
          mat.transparent = false;
          mat.depthWrite = true;
          mat.side = T.FrontSide;
          mat.alphaTest = 0;
          mat.needsUpdate = true;
        }
      });
      assertOpening(tv);
      group.add(tv);
      standIn.visible = false;
      tvLoaded = true;
    },
    undefined,
    () => { /* no model: the box and bars stay, and they are the right size */ },
  );

  // ------------------------------------------------------------- the glass  // ------------------------------------------------------------- the glass
  // The face of a CRT is CONVEX. Even a late flat-ish tube bulges a couple of
  // centimetres, and that bulge is what makes the reflection of a window bend
  // across it - which is, from a couch, the single most recognisable thing
  // about the object. So the glass is not a plane: it is a plane whose middle
  // is pushed forward, and the off-state mirror and the glare both use it.
  // ONE plane, two materials, swapped by setOn():
  //
  //   off - a dark mirror. A CRT with no beam is not black; it is a slightly
  //         green grey that reflects the room, which is why a dark living
  //         room has a rectangle of window in it.
  //   on  - the hole. opacity 0 + NoBlending = the fragment REPLACES the
  //         framebuffer with rgba(0,0,0,0) instead of blending into it.
  const glassGeo = keep(bulged(SCREEN.w, SCREEN.h, 0.019));
  const offMat = keep(new T.MeshStandardMaterial({ color: 0x15181a, roughness: 0.08, metalness: 0.55 }));
  const holeMat = keep(new T.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: T.NoBlending }));
  const glass: T.Mesh<T.BufferGeometry, T.Material> = new T.Mesh(glassGeo, offMat);
  glass.position.set(0, SCREEN.y, SCREEN.z + 0.001);
  glass.renderOrder = 1;
  group.add(glass);

  // ------------------------------------------------------------- the glare
  // What the room leaves ON the glass. This is the one thing that HAS to be
  // WebGL: it lives in front of the picture, and additive blending over a hole
  // that has already been punched to rgba(0,0,0,0) composites correctly onto
  // whatever DOM the browser shows through it. Draw it after the hole
  // (renderOrder) and never write depth, or it punches its own.
  const glareMat = keep(new T.MeshBasicMaterial({
    map: glareTexture(),
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    opacity: 0.5,
  }));
  const glare = new T.Mesh(keep(bulged(SCREEN.w, SCREEN.h, 0.019)), glareMat);
  glare.position.set(0, SCREEN.y, SCREEN.z + 0.0025);
  glare.renderOrder = 3;
  group.add(glare);

  // ------------------------------------------------- the DOM on the glass
  // 1280x720 CSS pixels, scaled by PX metres-per-pixel so that the plane is
  // exactly the size of the picture. The dashboard mounts INSIDE this element
  // and never learns it is in a room.
  const host = document.createElement('div');
  host.className = 'room-screen';
  host.style.width = `${SCREEN_PX.w}px`;
  host.style.height = `${SCREEN_PX.h}px`;
  const crt = buildCrt(host);
  // Between the picture and the veil: the startup animation is UNDER the
  // line's white and the glass, and over the dashboard.
  const startup = buildStartup(host, base);
  host.insertBefore(startup.layer, crt.picture.nextSibling);
  crt.addToPicture(startup.layer);
  const css = new CSS3DObject(host);
  css.position.set(0, SCREEN.y, SCREEN.z + 0.001);
  css.scale.setScalar(PX);
  host.style.visibility = 'hidden';

  let on = false;
  return {
    group,
    host: crt.picture,
    crt,
    startup,
    css,
    get on() { return on; },
    get modelLoaded() { return tvLoaded; },
    setOn(next: boolean) {
      if (next === on) return;
      on = next;
      glass.material = next ? holeMat : offMat;
      // Hidden rather than removed: the dashboard behind it keeps its layout,
      // its fonts and its timeline, so power-on is instant instead of a mount.
      host.style.visibility = next ? 'visible' : 'hidden';
      // Off: stop the animation AND re-arm it, so powering the console back on
      // plays it again rather than cutting straight to the dashboard.
      if (!next) { startup.skip(); startup.rearm(); }
      // A lit tube washes its own reflection out: the glare is what you see on
      // a DARK screen, and leaving it at full strength over a picture reads as
      // a dirty screen rather than as glass.
      glareMat.opacity = next ? 0.17 : 0.5;
      if (!next) crt.reset();
    },
    dispose() { startup.dispose(); crt.dispose(); for (const o of owned) o.dispose(); },
  };
}

/**
 * A rectangle whose middle is pushed forward: the face of a picture tube.
 *
 * The bulge is a product of two parabolas rather than a sphere cap, because a
 * tube's corners come back almost to the bezel plane while its middle stands
 * proud - a spherical cap pushes the corners forward too and the bezel then
 * has to be modelled around a dome.
 */
function bulged(w: number, h: number, depth: number): T.PlaneGeometry {
  const g = new T.PlaneGeometry(w, h, 28, 18);
  const p = g.attributes['position'] as T.BufferAttribute;
  const hw = w / 2;
  const hh = h / 2;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / hw;
    const v = p.getY(i) / hh;
    p.setZ(i, depth * (1 - u * u) * (1 - v * v));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/**
 * What the room leaves on the glass, drawn once into a canvas.
 *
 * Two sources, both from addLights() in Room.ts: the window on the right wall,
 * which lands as a soft parallelogram up and left of centre because the set
 * faces the couch and the glass is convex; and the lamp behind the seat, which
 * lands as a small hot blob low and right. Everything else is the sheen of the
 * anti-glare coating, which is why the whole thing sits on a faint gradient
 * instead of on black.
 */
function glareTexture(): T.CanvasTexture {
  const W = 512;
  const H = 288;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);

  // The coating's sheen: brightest at the top, where the ceiling is.
  const sheen = g.createLinearGradient(0, 0, 0, H);
  sheen.addColorStop(0, 'rgba(150,168,196,0.30)');
  sheen.addColorStop(0.45, 'rgba(90,102,124,0.08)');
  sheen.addColorStop(1, 'rgba(60,66,80,0.13)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, W, H);

  // The window. Bent, because the glass it is lying on is bent.
  g.save();
  g.filter = 'blur(11px)';
  g.fillStyle = 'rgba(176,200,238,0.72)';
  g.beginPath();
  g.moveTo(W * 0.09, H * 0.10);
  g.quadraticCurveTo(W * 0.30, H * 0.30, W * 0.40, H * 0.19);
  g.lineTo(W * 0.34, H * 0.03);
  g.quadraticCurveTo(W * 0.22, H * 0.0, W * 0.09, H * 0.10);
  g.closePath();
  g.fill();
  g.restore();

  // The lamp, low and right, small and hot.
  g.save();
  g.filter = 'blur(16px)';
  const lamp = g.createRadialGradient(W * 0.79, H * 0.74, 2, W * 0.79, H * 0.74, W * 0.11);
  lamp.addColorStop(0, 'rgba(255,214,164,0.75)');
  lamp.addColorStop(1, 'rgba(255,214,164,0)');
  g.fillStyle = lamp;
  g.fillRect(0, 0, W, H);
  g.restore();

  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}


/**
 * Check the television still fits the room it was cut for.
 *
 * The model carries the five numbers it was built against in
 * `userData.sculptRuntime.screenOpening.roomAssert`. If the room's constants
 * move and the model does not, the aperture stops matching the picture - and
 * that failure is silent and purely visual: a hairline of room showing around
 * the dashboard, or a cropped edge. Nothing in the suite compares pixels, so
 * nothing would catch it.
 *
 * One comparison at load time makes it a console warning instead.
 */
function assertOpening(tv: T.Object3D): void {
  const rt = (tv.userData as { sculptRuntime?: { screenOpening?: { roomAssert?: Record<string, number> } } })
    .sculptRuntime ?? (tv.children[0]?.userData as { sculptRuntime?: { screenOpening?: { roomAssert?: Record<string, number> } } } | undefined)?.sculptRuntime;
  const want = rt?.screenOpening?.roomAssert;
  if (!want) return;
  const have: Record<string, number> = {
    screenW: SCREEN.w, screenH: SCREEN.h, screenY: SCREEN.y, screenZ: SCREEN.z, standH: STAND.h,
  };
  const off = Object.keys(want)
    .filter((k) => k in have && Math.abs(want[k]! - have[k]!) > 1e-4)
    .map((k) => `${k}: model was cut for ${want[k]}, room now says ${have[k]}`);
  if (off.length) {
    console.warn(`[room] the television no longer fits its aperture -\n  ${off.join('\n  ')}`);
  }
}
