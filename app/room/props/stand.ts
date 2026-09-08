// The stand the television sits on, and the shelf the console sits in.
//
// A 34" CRT is 45 kg of glass on a 100 kg chassis, so it does not hang on a
// wall and it does not sit on a side table: it sits on a low, heavy media
// console with a shelf under it, which is exactly why the Xbox in every photo
// of a room like this is at ANKLE height and pointing at the couch. That is
// load-bearing for us - the power button has to be somewhere the camera can
// see it and a pointer can hit it.
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SCREEN } from '../constants';

export const STAND = {
  w: 1.32,
  /** Top surface height. The television's foot rests here. */
  h: 0.46,
  d: 0.56,
  /** Front face of the carcass, in room z. */
  frontZ: SCREEN.z + 0.02,
} as const;

/**
 * The console: where it lives, and how the authored model is fitted to it.
 *
 * It STANDS, which is how the model is built and how most of them lived next to
 * a television. The shelf's cubby is 0.40 m of clear height and the console is
 * 0.309 m tall, so it goes in upright with room to spare and its front face -
 * the ring of light, the tray, the two doors - looks straight out at the couch.
 *
 * The model is a third party's (public/room/xbox360.glb; NOTICE says whose), so
 * it does NOT arrive on the contract this file used to specify. It arrives with
 * its own origin, its own scale and no named nodes at all, and these five
 * numbers are what fit it:
 *
 *  - MEASURED bounds, walked vertex by vertex in world space rather than read
 *    from geometry.boundingBox: 0.16743 x 0.59154 x 0.51885. (The cached box is
 *    wrong after quantization - GLTFLoader fills it from the accessor's min and
 *    max, which are in quantized units, and it reported a near-cubic
 *    0.49 x 0.59 x 0.59 for an object that is obviously tall and thin.)
 *  - so SCALE is 0.309 / 0.59154 = 0.522363, and at that scale the other two
 *    axes come out 0.0875 and 0.2711 against the retail casing's 0.083 and
 *    0.258 - within 5% on all three, which is what says the model is honest
 *    and the scale is one number and not three.
 *  - its origin is not its footprint centre, so ORIGIN below re-centres it.
 *  - +Z is its front face.
 */
export const XBOX = {
  /** Shelf coordinate of the console's footprint centre. */
  pos: [0.30, 0.036, STAND.frontZ - 0.30] as const,
  /** Yaw, radians. Angled a few degrees out of square: nobody has ever put a
   *  console on a shelf straight. */
  yaw: -0.10,
  /** The retail "phat" casing, standing up. */
  size: { w: 0.083, d: 0.258, h: 0.309 } as const,
  /** public/room/xbox360.glb, measured. */
  model: {
    src: 'room/xbox360.glb',
    scale: 0.522363,
    /** Model-space point that must land on the group's origin: the centre of
     *  its footprint, on the surface it stands on. */
    origin: [0.03595, 0.00505, -0.03671] as const,
  },
  /**
   * The ring of light, in the MODEL's own coordinates.
   *
   * The ring is real modelled geometry - a recessed annulus around a raised
   * disc - not a detail painted into the texture. An untextured, flat-shaded
   * render of the front face under a raking light shows the dish and its walls
   * with no map on the material at all, which is what settles it.
   *
   * So the console lights its OWN ring: these numbers select the annulus's
   * triangles out of the merged mesh and split them into four quadrants, each
   * with its own material. Nothing is laid over the model.
   *
   * `front` is the z of the flat face AT THE RING, which is 24 mm behind the
   * neighbourhood's furthest-forward point: the console's face is concave, so
   * the max z is out at its edges. Measuring "how deep is this triangle"
   * against the wrong plane threw the whole annulus away.
   */
  ring: {
    centre: [0.0440, 0.1665] as const,
    front: 0.19875,
    /** Rim of the raised centre disc, and where the dish meets the face. */
    inner: 0.0205,
    outer: 0.0465,
    /** How far behind `front` a triangle may sit and still be the dish. */
    depth: 0.020,
  },
  /** The same centre, in the fitted console group's space, for the projection
   *  the touch suite taps: (ring - origin) * scale. */
  ringAt: [0.0042, 0.0843, 0.1230] as const,
} as const;

export interface Stand {
  group: T.Group;
  /** The console's group. */
  console: T.Object3D;
  /** true once the authored model has replaced the stand-in box. */
  readonly modelLoaded: boolean;
  /** The four quadrants of the ring of light, clockwise from the top-left the
   *  way the console lights them. room/power.ts sweeps and holds them. */
  ringSegments: T.MeshStandardMaterial[];
  /** What a pointer has to hit to press power: the ring and the console body,
   *  so a click anywhere on the box counts. It changes when the authored model
   *  replaces the stand-in, which is why it is a getter. */
  readonly hitTargets: T.Object3D[];
  /** The ring of light itself, so the room can project it to screen
   *  coordinates - which is how a touch suite finds the power button without
   *  hard-coding where the console is. */
  ring: T.Object3D;
  dispose(): void;
}

export function buildStand(base: string, manager: T.LoadingManager): Stand {
  const group = new T.Group();
  group.name = 'stand';
  /** Every mesh the authored model brought, once it has arrived. A pointer has
   *  to be able to hit the console itself, not just our ring. */
  const modelMeshes: T.Mesh[] = [];
  let loaded = false;
  const owned: (T.Material | T.BufferGeometry)[] = [];
  const keep = <X extends T.Material | T.BufferGeometry>(x: X): X => { owned.push(x); return x; };

  // Dark-stained oak veneer over particle board, which is what every one of
  // these was. Rough, barely any specular.
  const carcass = keep(new T.MeshStandardMaterial({ color: 0x241a13, roughness: 0.72, metalness: 0.02 }));
  const midZ = STAND.frontZ - STAND.d / 2;

  const slab = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new T.Mesh(keep(new T.BoxGeometry(w, h, d)), carcass);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  const t = 0.028;
  // Top, under which everything else hangs.
  slab(STAND.w, t, STAND.d, 0, STAND.h - t / 2, midZ);
  // The two ends and the plinth it stands on.
  slab(t, STAND.h - t, STAND.d, -STAND.w / 2 + t / 2, (STAND.h - t) / 2, midZ);
  slab(t, STAND.h - t, STAND.d, STAND.w / 2 - t / 2, (STAND.h - t) / 2, midZ);
  slab(STAND.w, 0.035, STAND.d - 0.06, 0, 0.0175, midZ - 0.03);
  // The divider that makes it two cubbies, and the back panel.
  slab(t, STAND.h - t - 0.035, STAND.d - 0.08, -0.06, 0.035 + (STAND.h - t - 0.035) / 2, midZ - 0.02);
  slab(STAND.w - t * 2, STAND.h - t, 0.012, 0, (STAND.h - t) / 2, STAND.frontZ - STAND.d + 0.006);

  // ------------------------------------------------------------ the console
  // A box with the retail casing's dimensions, replaced by the authored model
  // the moment it loads. The box is not a placeholder to be embarrassed about:
  // it is what a viewer sees for the fraction of a second the GLB is in flight,
  // and it is what they keep if the file is missing or the browser cannot
  // decode it. Standing, because that is how the model is built.
  const con = new T.Group();
  con.name = 'xbox360';
  con.position.set(...XBOX.pos);
  con.rotation.y = XBOX.yaw;
  const caseMat = keep(new T.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.38, metalness: 0.03 }));
  const body = new T.Mesh(keep(new T.BoxGeometry(XBOX.size.w, XBOX.size.h, XBOX.size.d)), caseMat);
  body.position.set(0, XBOX.size.h / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  con.add(body);

  // The ring of light. FOUR quadrants, because the console lights them one at a
  // time: press power and the segments come up in a clockwise sweep before they
  // settle to a steady green. One ring can only be on or off, and being on all
  // at once is the failure state (three red lights lit every quadrant together,
  // and that is the association to avoid).
  //
  // These are the MODEL'S OWN triangles. The annulus is real geometry, so the
  // mesh's index buffer is rebuilt into five contiguous runs - the body, then
  // the four quadrants - and each quadrant gets a clone of the model's material
  // with an emissive on it. Nothing is laid over the console.
  const ringSegments: T.MeshStandardMaterial[] = [];
  // Where the ring is, for the projection the touch suite taps. An empty node,
  // because the ring itself is now part of the console's mesh.
  const ring = new T.Object3D();
  ring.name = 'powerRing';
  ring.position.set(...XBOX.ringAt);
  con.add(ring);

  const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    `${base}${XBOX.model.src}`,
    (gltf) => {
      const m = gltf.scene;
      m.updateWorldMatrix(true, true);
      let mesh: T.Mesh | null = null;
      m.traverse((n) => { if ((n as T.Mesh).isMesh) mesh = n as T.Mesh; });
      // The export is alphaMode BLEND on an opaque plastic casing. Left alone,
      // every one of its 186,732 triangles goes into the transparent pass to be
      // depth-sorted and blended for nothing - and because a transparent
      // material does not write depth, the console's own back panel, its vents
      // and its innards all show THROUGH the front shell. It is a white box,
      // not a window.
      //
      // This has to run BEFORE splitRing, which clones this material four times
      // for the ring quadrants: fixing it afterwards would leave four
      // see-through quarters of the ring behind.
      if (mesh) {
        const mats = Array.isArray((mesh as T.Mesh).material)
          ? (mesh as T.Mesh).material as T.Material[]
          : [(mesh as T.Mesh).material as T.Material];
        for (const mat of mats) {
          mat.transparent = false;
          mat.depthWrite = true;
          mat.side = T.FrontSide;
          mat.alphaTest = 0;
          mat.needsUpdate = true;
        }
        splitRing(mesh, ringSegments, keep);
      }

      m.scale.setScalar(XBOX.model.scale);
      // Put the model's footprint centre on the group's origin.
      const o = XBOX.model.origin;
      m.position.set(-o[0] * XBOX.model.scale, -o[1] * XBOX.model.scale, -o[2] * XBOX.model.scale);
      m.traverse((n) => {
        if (!(n as T.Mesh).isMesh) return;
        // It receives shadow but does not CAST one. The console stands inside a
        // cubby that is already in the stand's own shadow, so its cast shadow
        // is invisible - and casting it means drawing all 186,732 of its
        // triangles a second time into the shadow map, which is the single
        // largest thing this prop could cost and buys nothing.
        n.castShadow = false;
        n.receiveShadow = true;
        modelMeshes.push(n as T.Mesh);
      });
      con.add(m);
      body.visible = false;
      loaded = true;
    },
    undefined,
    () => { /* no model: the box stays, and it is the right size */ },
  );

  group.add(con);

  return {
    group,
    console: con,
    get modelLoaded() { return loaded; },
    ringSegments,
    get hitTargets() { return loaded ? [...modelMeshes, ring] : [body, ring]; },
    ring,
    dispose() { for (const o of owned) o.dispose(); },
  };
}


/**
 * Give the console's own ring of light four materials of its own.
 *
 * The model arrives as ONE merged mesh wearing ONE material, so there is
 * nothing in it that can be lit on its own. This selects the annulus's
 * triangles by where they sit - a radial band on the flat front face, no deeper
 * than the dish - and rebuilds the index buffer into five CONTIGUOUS runs, which
 * is what a geometry group is: the body, then quadrant 0 to 3 clockwise from
 * the top-left. Each quadrant gets a clone of the model's material, so it keeps
 * the console's colour, roughness and normal map and differs only in emissive.
 *
 * Selection is per triangle, so the quadrant edges are ragged at the scale of
 * one triangle - about a fifth of a millimetre on a 56 mm ring, and invisible
 * from a couch three metres away. Cutting them clean would mean splitting
 * triangles, which is a lot of work to fix something nobody can see.
 */
function splitRing(
  mesh: T.Mesh,
  out: T.MeshStandardMaterial[],
  keep: <X extends T.Material | T.BufferGeometry>(x: X) => X,
): void {
  const geo = mesh.geometry;
  const index = geo.getIndex();
  const pos = geo.getAttribute('position');
  if (!index || !pos) return;
  const mw = mesh.matrixWorld;
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
  const R = XBOX.ring;
  const triCount = index.count / 3;

  // Five buckets of indices: the body, then the four quadrants.
  const runs: number[][] = [[], [], [], [], []];
  for (let t = 0; t < triCount; t++) {
    const i0 = index.getX(t * 3), i1 = index.getX(t * 3 + 1), i2 = index.getX(t * 3 + 2);
    a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
    b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
    c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
    const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3;
    let g = 0;
    if (z > R.front - R.depth) {
      const dx = x - R.centre[0], dy = y - R.centre[1];
      const r = Math.hypot(dx, dy);
      if (r >= R.inner && r <= R.outer) {
        // Clockwise from the top-left, in screen terms: the console's own order.
        const ang = Math.atan2(dy, dx);
        g = 1 + (((Math.floor((-ang + Math.PI * 2.5) / (Math.PI / 2)) % 4) + 4) % 4);
      }
    }
    runs[g]!.push(i0, i1, i2);
  }
  // A ring that selected nothing means the model changed under these numbers.
  // Leave the mesh alone rather than rebuilding it into one empty group.
  if (runs.slice(1).some((r) => r.length === 0)) return;

  const flat = new Uint32Array(runs.reduce((n, r) => n + r.length, 0));
  let off = 0;
  geo.clearGroups();
  runs.forEach((r, i) => { flat.set(r, off); geo.addGroup(off, r.length, i); off += r.length; });
  geo.setIndex(new T.BufferAttribute(flat, 1));

  const base = mesh.material as T.MeshStandardMaterial;
  const quads: T.MeshStandardMaterial[] = [];
  for (let q = 0; q < 4; q++) {
    const mat = keep(base.clone()) as T.MeshStandardMaterial;
    mat.emissive = new T.Color(0x000000);
    mat.emissiveIntensity = 1.5;
    quads.push(mat);
    out.push(mat);
  }
  mesh.material = [base, ...quads];
}
