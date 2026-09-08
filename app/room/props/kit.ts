// How to put fifty small things in a room for the price of one.
//
// The room's real budget is DRAW CALLS, not triangles: the authored console is
// 186,732 triangles and costs exactly one draw, while a shelf of plushies built
// the obvious way - a mesh per ear, per eye, per paw - is a hundred and twenty
// meshes and a hundred and twenty draws, for about four thousand triangles. The
// first would not be noticed on any GPU made this century. The second is what
// actually blows a frame budget, and it is what "let us add some clutter" turns
// into if nobody is counting.
//
// So clutter is built the other way round. Every little primitive is given its
// colour as a VERTEX ATTRIBUTE, its transform is baked into its vertices, and
// the whole pile is merged into a single BufferGeometry drawn with one material
// that reads that attribute. Four plushies, a stack of games and a trophy come
// out as ONE mesh and ONE draw, and they can still all be different colours.
//
// The cost of the trick is that everything in one kit shares a SURFACE: one
// roughness, one metalness. That is why there is more than one kit in the room
// rather than one big one - felt and painted metal do not reflect alike, and
// the difference between them is most of what makes a plushie read as a
// plushie. Group by material, not by object.
import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Where a part goes. Euler order is the three default XYZ. */
export interface Place {
  pos?: readonly [number, number, number];
  rot?: readonly [number, number, number];
  /** Uniform if a number, per-axis if a triple. */
  scale?: number | readonly [number, number, number];
}

export interface Kit {
  /** Add a primitive. The geometry is CONSUMED - transformed in place and
   *  disposed at build() - so pass a fresh one every time and never keep a
   *  reference. */
  add(geo: T.BufferGeometry, color: number, place?: Place): void;
  /** A rounded box, the shape most furniture and most packaging actually is. */
  box(w: number, h: number, d: number, r: number, color: number, place?: Place): void;
  /** A squashed sphere: the shape every soft thing is. */
  blob(rx: number, ry: number, rz: number, color: number, place?: Place, seg?: number): void;
  /** Merge and hand back the single mesh. Empty kits return null, so a caller
   *  that adds nothing does not put an empty mesh in the scene.
   *
   *  `cast` defaults FALSE, and that default is the point. The room's only
   *  shadow-casting light is a PointLight, and a point light's shadow map is a
   *  CUBE: every casting mesh is drawn six more times, once per face. So a kit
   *  that casts costs seven times its triangles per frame, not two - which is
   *  how one 1,800-triangle plushie added 13,000 triangles a frame the first
   *  time it went in, and it is the whole explanation for a budget that moves
   *  in steps nobody can account for.
   *
   *  Turn it on for the things whose shadow is doing work: a shelf board needs
   *  the dark line under it or it floats, and a mug on a table needs to be
   *  standing on the table. A toy sitting on a shelf three metres away does
   *  not. */
  build(name: string, mat: T.MeshStandardMaterialParameters, cast?: boolean): T.Mesh | null;
}

/** Reused across every add(), because this runs a few hundred times at build
 *  and allocating a Matrix4 per part is the kind of thing that shows up as a
 *  hitch on the one frame that matters. */
const M = new T.Matrix4();
const Q = new T.Quaternion();
const E = new T.Euler();
const V = new T.Vector3();
const S = new T.Vector3();
const C = new T.Color();

export function makeKit(): Kit {
  const parts: T.BufferGeometry[] = [];

  const add: Kit['add'] = (geo, color, place = {}) => {
    const { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = place;
    V.set(pos[0], pos[1], pos[2]);
    E.set(rot[0], rot[1], rot[2]);
    Q.setFromEuler(E);
    if (typeof scale === 'number') S.setScalar(scale);
    else S.set(scale[0], scale[1], scale[2]);
    M.compose(V, Q, S);
    geo.applyMatrix4(M);

    // setHex reads sRGB and writes the renderer's linear working space, which
    // is what a vertex colour has to be: it is multiplied into the material's
    // colour before any output transform runs. Passing the raw 0-255 bytes
    // here is the classic way to get clutter that looks washed out next to
    // everything else in the room, and it looks like a lighting bug.
    C.setHex(color);
    const n = geo.attributes['position']!.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = C.r;
      col[i * 3 + 1] = C.g;
      col[i * 3 + 2] = C.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    parts.push(geo);
  };

  return {
    add,
    box(w, h, d, r, color, place) { add(rounded(w, h, d, r), color, place); },
    blob(rx, ry, rz, color, place, seg = 10) {
      const g = new T.SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.7)));
      g.scale(rx, ry, rz);
      add(g, color, place);
    },
    build(name, mat, cast = false) {
      if (!parts.length) return null;
      // mergeGeometries needs every input to carry the SAME attributes. Every
      // primitive three makes has position, normal and uv, and add() gives them
      // all colour, so this holds - but it returns null rather than throwing
      // when it does not, and a null here would be a shelf that silently
      // vanished. Assert it instead.
      const merged = mergeGeometries(parts, false);
      for (const p of parts) p.dispose();
      parts.length = 0;
      if (!merged) throw new Error(`kit "${name}": geometries did not merge (mismatched attributes)`);
      const mesh = new T.Mesh(merged, new T.MeshStandardMaterial({ vertexColors: true, ...mat }));
      mesh.name = name;
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      return mesh;
    },
  };
}

/** A box with its corners pulled in, which is the difference between a prop and
 *  a crate. Same trick furnishings.ts uses on the couch, kept separate because
 *  that one is about cushions and this one is about matchboxes: the radius here
 *  is a fraction of a very small side, so it clamps rather than assuming there
 *  is room for a real fillet. */
function rounded(w: number, h: number, d: number, r: number): T.BufferGeometry {
  const g = new T.BoxGeometry(w, h, d, 2, 2, 2);
  const p = g.attributes['position'] as T.BufferAttribute;
  const half = [w / 2, h / 2, d / 2];
  const rad = Math.min(r, w / 2.2, h / 2.2, d / 2.2);
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)];
    for (let a = 0; a < 3; a++) {
      const lim = half[a]! - rad;
      if (Math.abs(v[a]!) > lim) v[a] = Math.sign(v[a]!) * (lim + rad * 0.72);
    }
    p.setXYZ(i, v[0]!, v[1]!, v[2]!);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
