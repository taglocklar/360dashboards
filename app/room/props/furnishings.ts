// What is in the room besides the television.
//
// All in code, to real furniture dimensions, for the same reason the shell is:
// every one of these numbers wants to be tuned against a screenshot, and a
// room whose proportions are wrong is wrong in a way no amount of texture
// fixes. Each builder returns a Group positioned in room space, so any one of
// them can be swapped for an authored model later without moving anything
// else - the couch is at the couch's coordinates whoever built it.
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ROOM } from '../constants';
import { STAND } from './stand';

export interface Prop { group: T.Group; dispose(): void }

/** The coffee table knows about the controller on it, because the room does two
 *  things with it: a click on it presses power, and its guide ring is dark
 *  until the console is on. */
export interface TableProp extends Prop {
  /** What a pointer has to hit for the pad to count as the power button. */
  readonly padTargets: T.Object3D[];
  /** The ring and the logo on the pad's face. Dark until the console is on,
   *  the way a real one is: the pad's light comes up when it connects. */
  setPadLit(on: boolean): void;
}

/** A local material/geometry/texture ledger, so every builder disposes what it
 *  made. A texture is the one of the three that costs real memory if it is
 *  leaked, and the game covers are textures. */
type Owned = T.Material | T.BufferGeometry | T.Texture;
function ledger() {
  const owned: Owned[] = [];
  return {
    keep: <X extends Owned>(x: X): X => { owned.push(x); return x; },
    dispose: () => { for (const o of owned) o.dispose(); },
  };
}

/** A rounded box, which is the difference between furniture and packaging.
 *  three has no rounded box, and every real cushion, arm and table edge has a
 *  radius on it that catches the light. */
function soft(w: number, h: number, d: number, r = 0.05): T.BufferGeometry {
  // A low-segment sphere scaled to the box, clamped: cheap, and at these sizes
  // indistinguishable from a real fillet under a soft light.
  const g = new T.BoxGeometry(w, h, d, 3, 3, 3);
  const p = g.attributes['position'] as T.BufferAttribute;
  const half = [w / 2, h / 2, d / 2];
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)];
    for (let a = 0; a < 3; a++) {
      const lim = half[a]! - r;
      if (Math.abs(v[a]!) > lim) v[a] = Math.sign(v[a]!) * (lim + r * 0.72);
    }
    p.setXYZ(i, v[0]!, v[1]!, v[2]!);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/**
 * The couch, and the seat the whole thing is looked at from.
 *
 * It is BEHIND the camera at the idle pose - you are sitting on it - so almost
 * none of it is ever on screen. It is here anyway: it is the largest surface
 * in the room, it is what the lamp bounces off, and the moment the camera can
 * turn (or the pull-out overshoots) its absence is the thing you notice.
 */
export function buildCouch(): Prop {
  const { keep, dispose } = ledger();
  const group = new T.Group();
  group.name = 'couch';
  // A 2008 three-seat sofa: 2.10 across, 0.92 deep, 0.86 to the top of the
  // back, seat 0.44 off the floor.
  const W = 2.10, D = 0.92, SEAT = 0.44, BACK = 0.86, ARM = 0.62, ARMW = 0.20;
  const z = ROOM.back + ROOM.d - 1.05;

  const cloth = keep(new T.MeshStandardMaterial({ color: 0x6b6257, roughness: 0.94, metalness: 0 }));
  const add = (geo: T.BufferGeometry, x: number, y: number, zz: number) => {
    const m = new T.Mesh(keep(geo), cloth);
    m.position.set(x, y, zz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // Base, back, two arms.
  add(soft(W, SEAT, D, 0.04), 0, SEAT / 2, z);
  add(soft(W, BACK - SEAT + 0.10, 0.22, 0.06), 0, SEAT + (BACK - SEAT) / 2, z - D / 2 + 0.11);
  add(soft(ARMW, ARM, D, 0.07), -(W - ARMW) / 2, ARM / 2, z);
  add(soft(ARMW, ARM, D, 0.07), (W - ARMW) / 2, ARM / 2, z);
  // Three seat cushions, each a hair proud of the base and a hair apart.
  const cw = (W - ARMW * 2 - 0.06) / 3;
  for (let i = 0; i < 3; i++) {
    const c = add(soft(cw - 0.02, 0.14, D - 0.14, 0.05), -cw + i * cw, SEAT + 0.06, z + 0.03);
    // Nobody's cushions are square to each other.
    c.rotation.y = (i - 1) * 0.012;
  }
  return { group, dispose };
}

/**
 * The coffee table, and what is on it.
 *
 * This is the one piece of FOREGROUND in the idle shot: it sits 1.2 m in front
 * of the seat, low and wide, and it is what turns a photograph of a wall into
 * a photograph taken from somewhere.
 */
export function buildTable(base: string): TableProp {
  const { keep, dispose } = ledger();
  const group = new T.Group();
  group.name = 'coffee-table';
  const W = 1.10, D = 0.55, H = 0.42, z = 0.52;

  const oak = keep(new T.MeshStandardMaterial({ color: 0x4b3423, roughness: 0.48, metalness: 0.02 }));
  const top = new T.Mesh(keep(soft(W, 0.038, D, 0.014)), oak);
  top.position.set(0, H, z);
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);
  const shelf = new T.Mesh(keep(soft(W - 0.16, 0.026, D - 0.12, 0.012)), oak);
  shelf.position.set(0, 0.13, z);
  shelf.receiveShadow = true;
  group.add(shelf);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new T.Mesh(keep(new T.BoxGeometry(0.055, H, 0.055)), oak);
    leg.position.set(sx * (W / 2 - 0.06), H / 2, z + sz * (D / 2 - 0.06));
    leg.castShadow = true;
    group.add(leg);
  }

  // The controller, face up on the table: an authored model
  // (public/room/xbox360-controller.glb; NOTICE says whose and what changed),
  // repainted white to match the console.
  //
  // NO CABLE. The 360's pad is wireless, and the coiled lead that used to run
  // from here down to the console was the wired play-and-charge one.
  //
  // Fitting it, the same shape of measurement as the console's:
  //  - the file arrives ALIGNED: Y-up, axis-aligned, resting on y=0 with its
  //    footprint centred on the origin, because the conversion bakes that in
  //    (scratchpad/gltf/pad.mjs). So placing it here is a position and a yaw
  //    and nothing else.
  //
  //    That alignment is measured, not assumed, and assuming cost a round: the
  //    model's mesh node carries a rotation of (63.3, 4.2, -10.9) degrees, so
  //    the obvious "it is Z-up, turn it -90 about X" left the pad tilted 17.55
  //    degrees off level - which on a coffee table reads as exactly what it is,
  //    a controller that will not lie down. The conversion takes the
  //    area-weighted average normal of the pad's face and rotates THAT onto +Y.
  //  - MEASURED bounds after alignment: 0.1889 wide x 0.0878 thick x 0.1457
  //    deep, and SCALE 0.8205 puts the width on the retail pad's 0.155 m.
  const padZ = z - 0.05;
  const pad = new T.Group();
  pad.position.set(-0.20, H + 0.019, padZ);
  // Nobody sets a controller down square to the table either. 0.52 is the
  // casualness; the half turn that used to be added to it is gone, so the pad
  // is set down facing AWAY from the couch - put down mid-session and pushed
  // forward, rather than laid out facing you.
  pad.rotation.set(0, 0.52, 0);
  group.add(pad);

  // Until the model lands: a slab of the right footprint, so the table is not
  // momentarily bare and a failed fetch leaves something rather than nothing.
  const stub = new T.Mesh(
    keep(soft(0.155, 0.048, 0.104, 0.022)),
    keep(new T.MeshStandardMaterial({ color: 0xe6e4dd, roughness: 0.42 })),
  );
  stub.position.set(0, 0.024, 0);
  stub.castShadow = true;
  pad.add(stub);

  const padTargets: T.Object3D[] = [stub];
  const padLights: T.MeshStandardMaterial[] = [];
  loadPad(pad, stub, base, padTargets, padLights);


  // Two game cases, stacked and not square to each other. An Xbox 360 retail
  // case is a DVD case - 190 x 135 x 14 mm - moulded in the console's own
  // translucent green, with the printed cover under a clear sleeve on the
  // front. Lying flat, that front is the TOP face: one material out of six,
  // and the other five stay plastic, which is why the stack reads as green
  // from the side and as cover art from the couch.
  //
  // The covers are the games' own art (public/room/covers/, and NOTICE and
  // PLACEHOLDERS.md say whose). They load asynchronously and the case is built
  // before they arrive, so a cover that never loads leaves a plain green case
  // rather than a hole - which is also what a build with no covers in it does.
  // Offset as well as stacked. Two cases squared up hide the lower cover
  // completely, and nobody stacks anything squarely on a coffee table: the top
  // one slides back and to the right and turns a few degrees, which leaves an
  // L of the one underneath showing.
  const games = [
    { cover: 'halo3.jpg', level: 1, yaw: -0.17, dx: 0.030, dz: -0.040 },
    { cover: 'mw2.jpg', level: 0, yaw: 0.12, dx: 0, dz: 0 },
  ];
  const plastic = keep(new T.MeshStandardMaterial({ color: 0x1c6b23, roughness: 0.32, metalness: 0.02 }));
  const loader = new T.TextureLoader();
  for (const g of games) {
    // The top face is index 2 of BoxGeometry's [+x, -x, +y, -y, +z, -z].
    const art = keep(new T.MeshStandardMaterial({ color: 0x1c6b23, roughness: 0.36, metalness: 0.02 }));
    const faces = [plastic, plastic, art, plastic, plastic, plastic];
    const c = new T.Mesh(keep(new T.BoxGeometry(0.135, 0.014, 0.19)), faces);
    // level 0 rests on the table's top surface (the 0.038 slab is centred on
    // H, so its face is H + 0.019, and a 14 mm case sits 7 mm above that);
    // level 1 is one case higher.
    c.position.set(0.27 + g.dx, H + 0.026 + g.level * 0.015, z - 0.15 + g.dz);
    c.rotation.y = g.yaw;
    c.castShadow = true;
    c.receiveShadow = true;
    group.add(c);
    loader.load(
      `${base}room/covers/${g.cover}`,
      (tex) => {
        tex.colorSpace = T.SRGBColorSpace;
        keep(tex);
        art.map = tex;
        art.color.setHex(0xffffff);
        art.needsUpdate = true;
      },
      undefined,
      () => { /* no cover: the case stays green plastic, and that is fine */ },
    );
  }
  return {
    group,
    dispose,
    get padTargets() { return padTargets; },
    setPadLit(on: boolean) {
      for (const m of padLights) m.emissiveIntensity = on ? 1.15 : 0;
    },
  };
}

/** The rug everything stands on. One plane, because it is one plane. */
export function buildRug(): Prop {
  const { keep, dispose } = ledger();
  const group = new T.Group();
  group.name = 'rug';
  const m = new T.Mesh(
    keep(new T.PlaneGeometry(3.0, 2.0)),
    keep(new T.MeshStandardMaterial({ color: 0x4a3f3a, roughness: 1, metalness: 0 })),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.004, 0.55);
  m.receiveShadow = true;
  group.add(m);
  // A border, one shade lighter, which is the whole pattern a cheap rug has.
  const b = new T.Mesh(
    keep(new T.RingGeometry(1.32, 1.40, 4, 1)),
    keep(new T.MeshStandardMaterial({ color: 0x60524a, roughness: 1, side: T.DoubleSide })),
  );
  b.rotation.x = -Math.PI / 2;
  b.rotation.z = Math.PI / 4;
  b.scale.set(1.05, 0.70, 1);
  b.position.set(0, 0.005, 0.55);
  group.add(b);
  return { group, dispose };
}

/** The floor lamp the room's warm light comes out of. Its bulb sits exactly
 *  where addLights() puts the point light, so the shadows in the room and the
 *  object casting them agree. */
export function buildLamp(pos: readonly [number, number, number]): Prop {
  const { keep, dispose } = ledger();
  const group = new T.Group();
  group.name = 'lamp';
  const [x, y, z] = pos;
  const metal = keep(new T.MeshStandardMaterial({ color: 0x3a352e, roughness: 0.42, metalness: 0.65 }));
  const base = new T.Mesh(keep(new T.CylinderGeometry(0.16, 0.18, 0.024, 24)), metal);
  base.position.set(x, 0.012, z);
  base.castShadow = true;
  group.add(base);
  const pole = new T.Mesh(keep(new T.CylinderGeometry(0.014, 0.014, y - 0.02, 10)), metal);
  pole.position.set(x, (y - 0.02) / 2, z);
  pole.castShadow = true;
  group.add(pole);
  // The shade: a cone, lit from inside, so it glows rather than being a dark
  // lump above a bright room.
  const shade = new T.Mesh(
    keep(new T.CylinderGeometry(0.135, 0.20, 0.24, 22, 1, true)),
    keep(new T.MeshStandardMaterial({
      color: 0xd8c39a, roughness: 0.9, side: T.DoubleSide,
      emissive: 0xffcf94, emissiveIntensity: 0.55,
    })),
  );
  shade.position.set(x, y + 0.03, z);
  group.add(shade);
  return { group, dispose };
}

/**
 * The window on the right wall, and the blinds over it.
 *
 * Almost none of this is ever in frame: the set is on the back wall and the
 * couch faces it, so the window is 54 degrees off the axis at the idle pose.
 * It is built anyway because it is the SOURCE of the cool light on the right
 * wall and of the bent parallelogram on the television's glass, and a light
 * with nothing making it is the thing that makes a 3D room feel like a 3D
 * room instead of a photograph.
 */
export function buildWindow(pos: readonly [number, number, number]): Prop {
  const { keep, dispose } = ledger();
  const group = new T.Group();
  group.name = 'window';
  const [x, y, z] = pos;
  const W = 1.20, H = 1.10;

  // The pane: emissive, so it reads as daylight rather than as a hole.
  const pane = new T.Mesh(
    keep(new T.PlaneGeometry(W, H)),
    keep(new T.MeshBasicMaterial({ color: 0xbcd6ff })),
  );
  pane.position.set(x - 0.005, y, z);
  pane.rotation.y = -Math.PI / 2;
  group.add(pane);

  const frame = keep(new T.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.6 }));
  const bar = (w: number, h: number, dy: number, dz: number) => {
    const m = new T.Mesh(keep(new T.BoxGeometry(0.05, h, w)), frame);
    m.position.set(x - 0.03, y + dy, z + dz);
    m.castShadow = true;
    group.add(m);
  };
  bar(W + 0.12, 0.07, H / 2 + 0.035, 0);
  bar(W + 0.12, 0.07, -H / 2 - 0.035, 0);
  bar(0.07, H, 0, W / 2 + 0.035);
  bar(0.07, H, 0, -W / 2 - 0.035);
  bar(0.045, H, 0, 0);

  // Venetian blinds, half down and tilted: the 2008 rental default, and the
  // reason the light on the right wall is banded instead of flat.
  const slat = keep(new T.MeshStandardMaterial({ color: 0xe4dfd4, roughness: 0.8, side: T.DoubleSide }));
  const slatGeo = keep(new T.BoxGeometry(0.028, 0.006, W));
  for (let i = 0; i < 9; i++) {
    const m = new T.Mesh(slatGeo, slat);
    m.position.set(x - 0.055, y + H / 2 - 0.05 - i * 0.058, z);
    m.rotation.z = 0.62;
    group.add(m);
  }
  return { group, dispose };
}

/**
 * The back wall, dressed. A framed print left of the set and a tower of DVD
 * cases right of it - the two things that were on every wall a 360 was ever
 * plugged in under, and the fix for the acre of empty beige the first
 * screenshot had either side of the television.
 */
export function buildWallDressing(base: string): Prop {
  const { keep, dispose } = ledger();
  const group = new T.Group();
  group.name = 'wall-dressing';
  const wallZ = ROOM.back + 0.02;

  // The print: a black frame, a mat, and a rectangle of colour. Deliberately
  // abstract - anything representational here is a licence question.
  const frameMat = keep(new T.MeshStandardMaterial({ color: 0x181614, roughness: 0.4 }));
  const f = new T.Mesh(keep(new T.BoxGeometry(0.62, 0.82, 0.028)), frameMat);
  f.position.set(-1.42, 1.44, wallZ);
  f.castShadow = true;
  group.add(f);
  const mat = new T.Mesh(keep(new T.PlaneGeometry(0.54, 0.74)), keep(new T.MeshStandardMaterial({ color: 0xe9e4d9, roughness: 0.95 })));
  mat.position.set(-1.42, 1.44, wallZ + 0.015);
  group.add(mat);
  // The picture itself: an original dusk seascape, drawn for this room as an
  // SVG (public/room/wall-art.svg). It is ORIGINAL - it reproduces no real
  // artwork, photograph or poster and carries no text - which is the only kind
  // of picture that can hang here without an entry in PLACEHOLDERS.md.
  //
  // 800x1160 is the plane's own 0.40 x 0.58 exactly, so nothing is stretched.
  // The fallback colour is the deep teal it averages to: a frame that loads
  // nothing still reads as a framed picture rather than as a hole in the wall.
  const artMat = keep(new T.MeshStandardMaterial({ color: 0x2f5d6e, roughness: 0.9 }));
  const art = new T.Mesh(keep(new T.PlaneGeometry(0.40, 0.58)), artMat);
  art.position.set(-1.42, 1.46, wallZ + 0.016);
  group.add(art);
  new T.TextureLoader().load(
    `${base}room/wall-art.svg`,
    (tex) => {
      tex.colorSpace = T.SRGBColorSpace;
      keep(tex);
      artMat.map = tex;
      artMat.color.setHex(0xffffff);
      artMat.needsUpdate = true;
    },
    undefined,
    () => { /* no picture: the frame keeps its flat teal, and that is fine */ },
  );

  // The DVD tower: a narrow rack with a couple of dozen spines in it. Every
  // spine is a different height and a different colour because that is what a
  // shelf of cases looks like from three metres away, and nothing else does.
  const rackMat = keep(new T.MeshStandardMaterial({ color: 0x241a13, roughness: 0.7 }));
  const rackX = 1.34;
  const rack = new T.Mesh(keep(new T.BoxGeometry(0.20, 1.28, 0.19)), rackMat);
  rack.position.set(rackX, 0.64, wallZ + 0.10);
  rack.castShadow = true;
  rack.receiveShadow = true;
  group.add(rack);
  // Four shelf boards, proud of the carcass. Without them the rack is a black
  // monolith against a beige wall, which is what the first build of it was.
  for (let shelf = 0; shelf < 5; shelf++) {
    const b = new T.Mesh(keep(new T.BoxGeometry(0.21, 0.014, 0.20)), rackMat);
    b.position.set(rackX, 0.06 + shelf * 0.30, wallZ + 0.105);
    b.castShadow = true;
    group.add(b);
  }
  const spineGeo = keep(new T.BoxGeometry(0.013, 0.185, 0.135));
  // A fixed sequence, not Math.random: the room must look the same on every
  // load, or a screenshot gate is comparing against a room that moved.
  const hues = [0.02, 0.58, 0.11, 0.34, 0.62, 0.05, 0.44, 0.55, 0.09, 0.66, 0.28, 0.01,
                0.51, 0.15, 0.60, 0.07, 0.37, 0.64, 0.03, 0.47, 0.57, 0.12, 0.31, 0.68];
  for (let shelf = 0; shelf < 4; shelf++) {
    for (let i = 0; i < 6; i++) {
      const n = shelf * 6 + i;
      const m = new T.Mesh(spineGeo, keep(new T.MeshStandardMaterial({
        color: new T.Color().setHSL(hues[n]!, 0.42, 0.34 + (n % 5) * 0.035), roughness: 0.55,
      })));
      // On the FRONT of the rack, not inside it. Buried at the carcass's own
      // centre, twenty-four coloured spines rendered as nothing at all.
      m.position.set(rackX - 0.075 + i * 0.0155, 0.16 + shelf * 0.30, wallZ + 0.135);
      m.rotation.z = n === 11 ? 0.10 : 0;
      group.add(m);
    }
  }

  // There is no cable anywhere in this room. The pad is wireless, and the lead
  // that used to run from the console's foot to behind the stand went with it -
  // it was authored for a console lying FLAT on the shelf and, once the model
  // stood the console up, it started from a point in mid air.
  return { group, dispose };
}


/**
 * Fetch the controller and put it on the table in place of the stand-in slab.
 *
 * The numbers are the ones in the comment at the call site. Everything about
 * the material was settled when the file was converted (scratchpad/gltf/pad.mjs
 * and NOTICE): it arrives opaque, white and not metal, so nothing is patched
 * here - except the shadow flags, which are the room's business and not the
 * model's.
 */
function loadPad(
  pad: T.Group,
  stub: T.Mesh,
  base: string,
  targets: T.Object3D[],
  lights: T.MeshStandardMaterial[],
): void {
  const SCALE = 0.8205;
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
    `${base}room/xbox360-controller.glb`,
    (gltf) => {
      const m = gltf.scene;
      m.scale.setScalar(SCALE);
      m.traverse((n) => {
        if (!(n as T.Mesh).isMesh) return;
        const mesh = n as T.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        targets.push(mesh);
        // The guide ring and the logo are the material's EMISSIVE map, which is
        // black everywhere else - so the pad's light is one number, and it
        // starts at nothing. A 360's pad is dark until the console it is bound
        // to comes on.
        for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as T.Material[]) {
          const std = mat as T.MeshStandardMaterial;
          if (!std.emissive) continue;
          // Green, so the ring reads as the console's ring and not as a bulb.
          std.emissive.setHex(0x62c93f);
          std.emissiveIntensity = 0;
          lights.push(std);
        }
      });
      pad.add(m);
      stub.visible = false;
      targets.splice(targets.indexOf(stub), 1);
    },
    undefined,
    () => { /* no model: the slab stays, and it is the right footprint */ },
  );
}
