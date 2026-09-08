// The things that make it somebody's room instead of a room.
//
// Everything in here is small, and there is a lot of it, so all of it is built
// through kit.ts: each function fills two kits - one soft surface, one hard -
// and hands back a Prop that is TWO meshes and TWO draw calls however many
// objects are in it. See kit.ts for why that is the whole design.
//
// Nothing here is randomised. Every position, angle and colour below is a
// literal, because a room that reshuffles itself on reload is a room no
// screenshot gate can ever check, and "it looked right when I ran it" is not a
// thing anyone can act on later.
import * as T from 'three';
import { ROOM } from '../constants';
import { makeKit, type Kit, type Place } from './kit';
import { STAND } from './stand';
import type { Prop } from './furnishings';

/** Wall shelves sit this far off the back wall's inner face. */
const WALL = ROOM.back + 0.02;

/** A palette, so the room's clutter agrees with itself. 2008 flat-pack: dark
 *  stained pine, cream plastic, and toys that are the only saturated things in
 *  the whole house. */
const C = {
  pine: 0x2a1f17,
  case360: 0x1c6b23,
  caseGrey: 0x22252b,
  paper: 0xd9d2c2,
  cream: 0xf0e7d6,
  card: 0xb9502f,
  brass: 0xc8a03c,
  dark: 0x1a1a1d,
} as const;

/** A plushie, by proportion rather than by measurement.
 *
 *  Everything is a fraction of the overall height, so one number resizes the
 *  whole animal and the shelf can hold a big one and a little one that are
 *  recognisably the same kind of toy. The shapes are all squashed spheres for
 *  the same reason a real plushie is: it is a bag of stuffing, it has no hard
 *  edge anywhere on it, and the moment one of these gets a flat face it stops
 *  reading as soft and starts reading as a box with ears. */
interface Plush {
  /** Where the feet touch, in room space. */
  at: readonly [number, number, number];
  yaw: number;
  /** Overall height, floor of feet to top of head. Ears go above it. */
  h: number;
  fur: number;
  belly: number;
  /** Inner ear, muzzle and paw pads. */
  accent: number;
  ears: 'round' | 'long' | 'cat';
}

function plushie(soft: Kit, hard: Kit, p: Plush): void {
  const { at, yaw, h, fur, belly, accent } = p;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  // Local space is the toy facing +Z at the origin; this puts a local point
  // into the room. Rotations are passed through as a yaw offset, which is
  // exact for the spheres and near enough for the ears.
  const put = (lx: number, ly: number, lz: number): readonly [number, number, number] =>
    [at[0] + lx * cos + lz * sin, at[1] + ly, at[2] - lx * sin + lz * cos];
  const at3 = (lx: number, ly: number, lz: number, rot?: readonly [number, number, number]): Place =>
    ({ pos: put(lx, ly, lz), rot: rot ? [rot[0], rot[1] + yaw, rot[2]] : [0, yaw, 0] });

  // Body, then the belly patch a hair proud of it. The patch is a separate
  // sphere rather than a second material because the kit has exactly one
  // material - and it happens to be how the toy is really made.
  soft.blob(0.30 * h, 0.31 * h, 0.27 * h, fur, at3(0, 0.32 * h, 0));
  soft.blob(0.20 * h, 0.20 * h, 0.19 * h, belly, at3(0, 0.30 * h, 0.13 * h));
  // Head, sunk into the body: a plushie has no neck.
  soft.blob(0.27 * h, 0.26 * h, 0.25 * h, fur, at3(0, 0.72 * h, 0.01 * h));
  soft.blob(0.13 * h, 0.10 * h, 0.11 * h, accent, at3(0, 0.66 * h, 0.19 * h));

  // Eyes and nose are the only HARD things on it, and that is the point: two
  // little gloss beads are what turn a pile of felt into a face.
  hard.blob(0.035 * h, 0.040 * h, 0.035 * h, C.dark, at3(-0.10 * h, 0.77 * h, 0.20 * h), 6);
  hard.blob(0.035 * h, 0.040 * h, 0.035 * h, C.dark, at3(0.10 * h, 0.77 * h, 0.20 * h), 6);
  hard.blob(0.040 * h, 0.032 * h, 0.035 * h, C.dark, at3(0, 0.68 * h, 0.27 * h), 6);

  for (const s of [-1, 1]) {
    if (p.ears === 'long') {
      // Bunny: up and splayed, and they go ABOVE the stated height, which is
      // what makes a tall thin toy read as a rabbit and not as a bear.
      soft.blob(0.055 * h, 0.19 * h, 0.05 * h, fur, at3(s * 0.11 * h, 1.02 * h, -0.01 * h, [0, 0, s * -0.20]));
      soft.blob(0.030 * h, 0.13 * h, 0.030 * h, accent, at3(s * 0.115 * h, 1.03 * h, 0.03 * h, [0, 0, s * -0.20]));
    } else if (p.ears === 'cat') {
      const cone = new T.ConeGeometry(0.10 * h, 0.16 * h, 7);
      hardEdgeSoften(cone);
      soft.add(cone, fur, at3(s * 0.16 * h, 0.94 * h, 0, [0.1, 0, s * -0.28]));
    } else {
      soft.blob(0.10 * h, 0.10 * h, 0.06 * h, fur, at3(s * 0.21 * h, 0.90 * h, 0));
      soft.blob(0.055 * h, 0.055 * h, 0.04 * h, accent, at3(s * 0.23 * h, 0.90 * h, 0.03 * h));
    }
    // Arms out at the sides and stubby feet in front: a toy that has been sat
    // on a shelf, not a toy that is walking.
    soft.blob(0.09 * h, 0.11 * h, 0.09 * h, fur, at3(s * 0.31 * h, 0.36 * h, 0.02 * h));
    soft.blob(0.115 * h, 0.075 * h, 0.135 * h, fur, at3(s * 0.15 * h, 0.055 * h, 0.09 * h));
    soft.blob(0.06 * h, 0.04 * h, 0.05 * h, accent, at3(s * 0.15 * h, 0.05 * h, 0.19 * h));
  }
}

/** A cone comes out of three with a hard crease all the way round its base,
 *  which on a felt ear catches a rim of light and reads as sheet metal.
 *  Averaging the normals costs nothing at seven segments. */
function hardEdgeSoften(g: T.BufferGeometry): void {
  g.deleteAttribute('normal');
  g.computeVertexNormals();
}

/** An Xbox 360 retail case: 190 x 135 x 14 mm, in the console's own green. */
function gameCase(kit: Kit, place: Place, colour: number = C.case360): void {
  kit.box(0.135, 0.014, 0.19, 0.004, colour, place);
}

/**
 * Two shelves on the back wall, left of the television, and what somebody who
 * owned this console in 2009 had on them.
 *
 * The wall on that side was the emptiest thing in the shot - a metre and a half
 * of flat beige with one picture on it - and it is the side the lamp is on, so
 * it is also the best lit. Shelves there do three jobs at once: they break the
 * plane, they catch the lamp, and they give the room the only saturated colour
 * in it that is not coming out of the television.
 */
export function buildGamerShelf(): Prop {
  const group = new T.Group();
  group.name = 'gamer-shelf';
  const soft = makeKit();
  const hard = makeKit();

  // Two boards, 0.86 across and 0.22 deep, at heights chosen against what
  // stands on them: 0.35 m of clear air over the lower one is enough for the
  // tallest toy plus its ears, and the tallest toy on the UPPER one - the
  // bunny, whose ears reach 1.42 - clears the bottom edge of the Gears of War 2
  // poster at 1.52 by 100 mm. The framed print that used to hang in this column
  // has moved to the gap between the television and the DVD rack: it was left
  // intersecting these boards, which is a frame with two shelves and a rabbit
  // growing through it.
  const X = -1.42, D = 0.22, W = 0.86, TH = 0.030;
  const z = WALL + D / 2;
  const boards = [0.80, 1.15];
  for (const y of boards) {
    hard.box(W, TH, D, 0.006, C.pine, { pos: [X, y, z] });
    // Brackets, because a board with nothing under it reads as floating and
    // the eye notices before the brain does.
    for (const s of [-1, 1]) {
      hard.box(0.022, 0.075, D - 0.05, 0.004, C.dark, { pos: [X + s * (W / 2 - 0.09), y - TH / 2 - 0.037, z - 0.01] });
    }
  }
  const top = (i: number) => boards[i]! + TH / 2;

  // LOWER SHELF: a big green fellow, a stack of games somebody stopped putting
  // away, a trophy, and a cat.
  plushie(soft, hard, {
    at: [X - 0.32, top(0), z], yaw: 0.34, h: 0.215,
    fur: 0x7cbf3f, belly: 0xe8f0cf, accent: 0xd8e6a8, ears: 'round',
  });
  for (let i = 0; i < 4; i++) {
    gameCase(hard, {
      pos: [X - 0.05 + (i % 2) * 0.004, top(0) + 0.008 + i * 0.0145, z + 0.004],
      rot: [0, i * 0.035 - 0.05, 0],
    }, i === 1 ? C.caseGrey : C.case360);
  }
  trophy(hard, [X + 0.16, top(0), z]);
  plushie(soft, hard, {
    at: [X + 0.34, top(0), z], yaw: -0.52, h: 0.185,
    fur: 0xe08a3c, belly: 0xf6e3c4, accent: 0xf0c48a, ears: 'cat',
  });

  // UPPER SHELF: the bunny, a row of spines filed properly, and a little pink
  // one leaning on the end of the row the way the last book on a shelf does.
  plushie(soft, hard, {
    at: [X - 0.33, top(1), z], yaw: -0.22, h: 0.245,
    fur: 0x6fa8dc, belly: 0xf2f6fb, accent: 0xf0b8c8, ears: 'long',
  });
  const spineHue = [0.30, 0.02, 0.58, 0.10, 0.34, 0.62, 0.05, 0.44];
  for (let i = 0; i < 8; i++) {
    const lean = i === 7 ? 0.16 : 0;
    hard.box(0.0135, 0.185, 0.135, 0.003,
      new T.Color().setHSL(spineHue[i]!, 0.45, 0.32 + (i % 4) * 0.03).getHex(),
      { pos: [X - 0.03 + i * 0.0155 + (lean ? 0.012 : 0), top(1) + 0.0925 - (lean ? 0.004 : 0), z], rot: [0, 0, lean] });
  }
  plushie(soft, hard, {
    at: [X + 0.33, top(1), z], yaw: 0.62, h: 0.155,
    fur: 0xe294b4, belly: 0xfbeaf0, accent: 0xf7c9d8, ears: 'round',
  });

  // ON TOP OF THE DVD RACK, which is built over in furnishings.ts but dressed
  // here because this is where the kit is. The right-hand side of the room had
  // a rack, a window and nothing else; one toy up there answers the shelves
  // across the set and stops the whole of the colour in this room living on one
  // side of it.
  //
  // The rack is a 1.28 m carcass centred at x 1.34 on z ROOM.back + 0.12, so
  // its top face is y 1.28 and anything standing on it stands there.
  plushie(soft, hard, {
    at: [1.31, 1.28, ROOM.back + 0.12], yaw: -0.78, h: 0.175,
    fur: 0xd9b23f, belly: 0xf6ecc8, accent: 0xf0d78c, ears: 'round',
  });

  return finish(group, [
    // The toys do not cast; the boards, brackets and spines do, because a
    // floating shelf is exactly the thing that needs a shadow under it.
    soft.build('shelf-soft', { roughness: 0.98, metalness: 0 }, false),
    hard.build('shelf-hard', { roughness: 0.45, metalness: 0.05 }, true),
  ]);
}

/** A tournament trophy, 155 mm of gold plastic on a wooden plinth. */
function trophy(kit: Kit, at: readonly [number, number, number]): void {
  const [x, y, z] = at;
  kit.box(0.075, 0.022, 0.062, 0.004, C.pine, { pos: [x, y + 0.011, z] });
  kit.add(new T.CylinderGeometry(0.010, 0.014, 0.040, 8), C.brass, { pos: [x, y + 0.042, z] });
  kit.add(new T.CylinderGeometry(0.032, 0.016, 0.055, 10), C.brass, { pos: [x, y + 0.090, z] });
  for (const s of [-1, 1]) {
    kit.add(new T.TorusGeometry(0.017, 0.004, 4, 8, Math.PI), C.brass,
      { pos: [x + s * 0.036, y + 0.092, z], rot: [0, 0, s * Math.PI / 2] });
  }
}

/**
 * What is on the coffee table, on the shelf under it, and on the floor beside
 * it.
 *
 * The table is the only FOREGROUND in the idle shot and it was a bare slab with
 * a controller on one end of it. Everything here is within arm's reach of
 * somebody sitting where the camera is, which is the test for whether a prop
 * belongs on a coffee table or is just being stored there.
 *
 * Placed around what is already on the table - the pad at x -0.20 and the two
 * game cases at x +0.27 - so nothing intersects and, more to the point, so
 * nothing sits on top of the thing you are meant to click to turn the console
 * on.
 */
export function buildClutter(): Prop {
  const group = new T.Group();
  group.name = 'clutter';
  const soft = makeKit();
  const hard = makeKit();

  // Table numbers, from furnishings.ts: 1.10 x 0.55, top at 0.42, centred on
  // z 0.52, so the top face is y 0.439 and the lower shelf's face is y 0.143.
  const TOP = 0.439, SHELF = 0.143, TZ = 0.52;

  // A can of something green, sweating on the wood. Its own condensation ring
  // is one flat disc, and it is the cheapest detail in this file.
  can(hard, [0.44, TOP, TZ + 0.10], 0x4e8c1f);
  hard.add(new T.CircleGeometry(0.045, 14), 0x3a2a1c, { pos: [0.44, TOP + 0.0012, TZ + 0.10], rot: [-Math.PI / 2, 0, 0] });

  // A mug, handle out, half turned away.
  const mugAt: readonly [number, number, number] = [-0.45, TOP, TZ + 0.08];
  hard.add(new T.CylinderGeometry(0.041, 0.036, 0.094, 14), C.cream, { pos: [mugAt[0], TOP + 0.047, mugAt[2]] });
  hard.add(new T.TorusGeometry(0.026, 0.007, 5, 10, Math.PI * 1.1), C.cream,
    { pos: [mugAt[0] - 0.043, TOP + 0.050, mugAt[2]], rot: [0, 0, -0.3] });
  hard.add(new T.CircleGeometry(0.034, 14), 0x2c1a10, { pos: [mugAt[0], TOP + 0.086, mugAt[2]], rot: [-Math.PI / 2, 0, 0] });

  // A bag of crisps, stood up and rolled shut, pushed to the back edge. Soft
  // kit: a foil bag is the one thing on this table that is neither gloss nor
  // felt, and of the two it is much closer to felt.
  //
  // It gets a LABEL BAND, and it needs one. Built without it this is a rounded
  // red box, and a rounded red box on a coffee table reads as a brick: the
  // thing that makes a bag a bag at 40 px is the horizontal stripe across it,
  // not the silhouette.
  const bagAt: readonly [number, number, number] = [-0.40, TOP, TZ - 0.15];
  const bagYaw = 0.42;
  soft.box(0.150, 0.115, 0.070, 0.024, C.card, { pos: [bagAt[0], bagAt[1] + 0.056, bagAt[2]], rot: [0, bagYaw, 0.05] });
  soft.box(0.140, 0.034, 0.062, 0.012, 0xe8c65a, { pos: [bagAt[0] + 0.003, bagAt[1] + 0.062, bagAt[2]], rot: [0, bagYaw, 0.05] });
  // The rolled top: narrower than the bag and turned across it, which is what
  // a bag that has been opened and folded over actually looks like.
  soft.box(0.130, 0.026, 0.030, 0.012, 0x8f3b22, { pos: [bagAt[0] - 0.004, bagAt[1] + 0.122, bagAt[2] + 0.002], rot: [0, bagYaw, -0.10] });

  // The television's remote, at the angle a remote is always at.
  hard.box(0.046, 0.019, 0.175, 0.008, 0x2a2c30, { pos: [0.06, TOP + 0.010, TZ + 0.13], rot: [0, 0.62, 0] });
  hard.box(0.030, 0.004, 0.115, 0.002, 0x4a4d53, { pos: [0.062, TOP + 0.020, TZ + 0.126], rot: [0, 0.62, 0] });

  // UNDER the table: magazines and the cases that did not make it back to the
  // shelf. The lower shelf was built in the first pass and has been empty
  // since, and an empty shelf under a full table reads as an unfinished model.
  for (let i = 0; i < 3; i++) {
    hard.box(0.205, 0.005, 0.275, 0.003, [C.paper, 0xc4c8cd, 0xd8cbb0][i]!,
      { pos: [-0.24 + i * 0.006, SHELF + 0.004 + i * 0.0055, TZ + i * 0.008], rot: [0, 0.09 - i * 0.07, 0] });
  }
  for (let i = 0; i < 3; i++) {
    gameCase(hard, { pos: [0.26, SHELF + 0.009 + i * 0.0145, TZ - 0.01], rot: [0, -0.12 + i * 0.06, 0] },
      i === 0 ? C.caseGrey : C.case360);
  }

  // On the floor, between the table and the set: one case out of its box, lying
  // where it was dropped. The disc is the only round bright thing below eye
  // level and it catches the lamp.
  //
  // Far enough BACK to be seen. The table's own front edge is the horizon for
  // anything on this floor: a sightline from the couch grazes the tabletop at
  // y 0.439, and at z 0.06 it clears the floor by 26 mm - so the first attempt
  // put a case and a disc on the rug that were, from the only angle anyone ever
  // looks from, entirely behind the table. At z -0.25 the same sightline clears
  // by 130 mm and both are in shot.
  gameCase(hard, { pos: [-1.18, 0.012, -0.58], rot: [0, 0.9, 0] });
  hard.add(new T.CircleGeometry(0.06, 20), 0xcfd6dd, { pos: [-1.30, 0.008, -0.68], rot: [-Math.PI / 2, 0, 0.4] });
  hard.add(new T.CircleGeometry(0.0075, 10), 0x3a3f45, { pos: [-1.30, 0.0085, -0.68], rot: [-Math.PI / 2, 0, 0.4] });

  // ------------------------------------------------- the stand's empty cubby
  //
  // The media console has two cubbies and the console stands in the right one.
  // The left one has been a black rectangle in the middle of every screenshot
  // this route has ever taken, and it is the emptiest thing in the shot that
  // the eye actually lands on - it sits directly under the television.
  //
  // Geometry, read off stand.ts rather than guessed: the carcass is 1.32 wide
  // and 0.56 deep with 28 mm sides, its front face is at z -1.22 and the
  // divider is at x -0.06, so the left cubby is the box x -0.632..-0.074,
  // y 0.035..0.432, z -1.756..-1.22. Everything below is inset from that.
  const CUB = { x0: -0.632 + 0.02, x1: -0.074 - 0.02, y: 0.035, zFront: STAND.frontZ - 0.075 };
  // Filed spines, leaning where a row of cases always leans: hard against the
  // left wall of the cubby, sagging as the row runs out.
  const shelfHue = [0.34, 0.02, 0.30, 0.60, 0.08, 0.44, 0.55, 0.11, 0.02, 0.63, 0.36, 0.05, 0.28, 0.58];
  for (let i = 0; i < 14; i++) {
    const lean = i > 10 ? (i - 10) * 0.075 : 0;
    hard.box(0.0145, 0.19, 0.135, 0.003,
      new T.Color().setHSL(shelfHue[i]!, 0.40, 0.26 + (i % 4) * 0.028).getHex(),
      { pos: [CUB.x0 + 0.012 + i * 0.0165 + lean * 0.06, CUB.y + 0.095 - lean * 0.012, CUB.zFront], rot: [0, 0, lean] });
  }
  // And a short stack lying flat beside them, which is where the ones in use
  // live.
  for (let i = 0; i < 3; i++) {
    gameCase(hard, { pos: [CUB.x1 - 0.10, CUB.y + 0.009 + i * 0.0145, CUB.zFront + 0.01], rot: [0, 0.04 * i - 0.03, 0] },
      i === 2 ? C.caseGrey : C.case360);
  }

  return finish(group, [
    soft.build('clutter-soft', { roughness: 0.92, metalness: 0 }, false),
    // The mug, the can and the remote all stand on a table a metre from the
    // camera, and a thing on a table with no shadow under it hovers.
    hard.build('clutter-hard', { roughness: 0.38, metalness: 0.08 }, true),
  ]);
}

/** A 355 ml drinks can: 66 mm across, 122 mm tall, with the lid recessed. */
function can(kit: Kit, at: readonly [number, number, number], colour: number): void {
  const [x, y, z] = at;
  kit.add(new T.CylinderGeometry(0.033, 0.030, 0.112, 14), colour, { pos: [x, y + 0.058, z] });
  kit.add(new T.CylinderGeometry(0.027, 0.033, 0.012, 14), 0xb9bcc2, { pos: [x, y + 0.118, z] });
}

/** Wire the finished meshes into a group and hand back a Prop that disposes
 *  exactly what it made. Nulls are skipped, so a kit nobody filled is not an
 *  error - it is just nothing. */
function finish(group: T.Group, meshes: (T.Mesh | null)[]): Prop {
  const kept: T.Mesh[] = [];
  for (const m of meshes) if (m) { group.add(m); kept.push(m); }
  return {
    group,
    dispose() {
      for (const m of kept) {
        m.geometry.dispose();
        (m.material as T.Material).dispose();
      }
    },
  };
}
