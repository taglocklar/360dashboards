// The room itself: six surfaces and the trim between them. All in code, no
// asset, because a box is cheaper to author than to fetch and every number in
// it wants to be tuned against a screenshot rather than regenerated.
//
// It is built INSIDE OUT - BackSide on the box - so the camera can sit in the
// middle of it without a near-plane clip, and so a wall never occludes the
// screen from behind.
import * as T from 'three';
import { ROOM } from '../constants';

/** A 2008 rental interior: warm builder-beige walls, a flat white ceiling and
 *  a mid oak floor. Nothing here is saturated; the only colour in the room is
 *  going to come off the television. */
const PAINT = {
  wall: 0xbfb2a0,
  ceiling: 0xe6e2da,
  floor: 0x7a5636,
  trim: 0xe8e4dc,
} as const;

export interface RoomShell {
  group: T.Group;
  /** The materials worth pointing a light at later. */
  dispose(): void;
}

export function buildShell(): RoomShell {
  const group = new T.Group();
  group.name = 'shell';
  const owned: (T.Material | T.BufferGeometry)[] = [];
  const keep = <X extends T.Material | T.BufferGeometry>(x: X): X => { owned.push(x); return x; };

  const midZ = ROOM.back + ROOM.d / 2;

  // Floor, ceiling and the four walls as separate planes rather than one
  // inverted box: a box shares one material across six faces, and the whole
  // point of a room is that the ceiling is not the colour of the floor.
  const plane = (w: number, h: number, mat: T.Material, pos: [number, number, number], rot: [number, number, number]) => {
    const g = keep(new T.PlaneGeometry(w, h));
    const m = new T.Mesh(g, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  const wallMat = keep(new T.MeshStandardMaterial({ color: PAINT.wall, roughness: 0.95, metalness: 0 }));
  const floorMat = keep(new T.MeshStandardMaterial({ color: PAINT.floor, roughness: 0.62, metalness: 0 }));
  const ceilMat = keep(new T.MeshStandardMaterial({ color: PAINT.ceiling, roughness: 1, metalness: 0 }));

  plane(ROOM.w, ROOM.d, floorMat, [0, 0, midZ], [-Math.PI / 2, 0, 0]);
  plane(ROOM.w, ROOM.d, ceilMat, [0, ROOM.h, midZ], [Math.PI / 2, 0, 0]);
  // Back wall: the one behind the television, and the only one the idle camera
  // sees much of.
  plane(ROOM.w, ROOM.h, wallMat, [0, ROOM.h / 2, ROOM.back], [0, 0, 0]);
  // Side walls, facing in.
  plane(ROOM.d, ROOM.h, wallMat, [-ROOM.w / 2, ROOM.h / 2, midZ], [0, Math.PI / 2, 0]);
  plane(ROOM.d, ROOM.h, wallMat, [ROOM.w / 2, ROOM.h / 2, midZ], [0, -Math.PI / 2, 0]);
  // The wall behind the camera. Off screen at the idle pose, but it is what
  // bounces the lamp back onto the couch once there is a bounce to bounce.
  plane(ROOM.w, ROOM.h, wallMat, [0, ROOM.h / 2, ROOM.back + ROOM.d], [0, Math.PI, 0]);

  // Baseboard. 3.5 inches of painted MDF, which is the single detail that
  // stops a box reading as a box: it puts a hard bright line exactly where the
  // eye looks for the floor-wall join.
  const trimMat = keep(new T.MeshStandardMaterial({ color: PAINT.trim, roughness: 0.55, metalness: 0 }));
  const baseH = 0.089;
  const baseT = 0.016;
  const base = (w: number, pos: [number, number, number], ry: number) => {
    const g = keep(new T.BoxGeometry(w, baseH, baseT));
    const m = new T.Mesh(g, trimMat);
    m.position.set(...pos);
    m.rotation.y = ry;
    m.receiveShadow = true;
    group.add(m);
  };
  base(ROOM.w, [0, baseH / 2, ROOM.back + baseT / 2], 0);
  base(ROOM.d, [-ROOM.w / 2 + baseT / 2, baseH / 2, midZ], Math.PI / 2);
  base(ROOM.d, [ROOM.w / 2 - baseT / 2, baseH / 2, midZ], -Math.PI / 2);

  return {
    group,
    dispose() { for (const o of owned) o.dispose(); },
  };
}
