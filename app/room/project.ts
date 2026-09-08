// Putting the dashboard on the glass, without CSS3DRenderer.
//
// The picture is a live DOM tree that has to land exactly inside a hole punched
// in a WebGL canvas. three's CSS3DRenderer does that by building a chain -
// a `transform-style: preserve-3d` camera element carrying
// `perspective(Npx) translateZ(Npx) matrix3d(camera...)`, with every object as a
// `matrix3d` child - and letting the browser do the perspective divide.
//
// WHY THAT IS GONE. On iOS (every browser there is WebKit, Chrome included) that
// chain is painted wrongly: measured on an iPhone 15 at 393x659, the screen
// element's LAYOUT box is exactly right - getBoundingClientRect agrees with
// Chrome to the pixel - while the PAINTED result is 0.767 of the correct width
// and 0.588 of the correct height, anchored at its bottom-left. So the dashboard
// sat low in the tube with its bottom cut off, which is what Tag saw. Moving the
// perspective off the transform function list and onto the parent as the CSS
// `perspective` property fixed the horizontal axis exactly and left the vertical
// as wrong as before, so there is no small change to CSS3DRenderer that rescues
// it.
//
// WHAT REPLACES IT. The picture is ONE flat rectangle whose corners we can
// project ourselves, with the same camera the WebGL room uses. Four projected
// corners define a HOMOGRAPHY from the element's own 1280x720 box to the quad
// the glass occupies on screen, and a homography is expressible as a plain
// `matrix3d` on the element itself - no perspective ancestor, no preserve-3d, no
// renderer. It is exact (not an affine approximation: the trapezoid an off-axis
// camera makes is carried by the w terms), it is one element and one transform,
// and it is the same maths in every engine.
//
// The element keeps hit-testing correctly, because the browser inverts the
// transform for pointer events the same way it does for CSS3D.
import * as T from 'three';

/** The screen's rectangle in world space. The element's (0,0) is its TOP-LEFT,
 *  and the DOM's y runs down while three's runs up, so the corners are listed
 *  top-left, top-right, bottom-right, bottom-left. */
export interface ScreenRect {
  /** Centre of the rectangle. */
  centre: readonly [number, number, number];
  /** Half width and half height, in metres. */
  half: readonly [number, number];
}

export interface ScreenProjector {
  /** Recompute the transform. Call once per frame, after the camera moves. */
  update(): void;
}

const V = new T.Vector3();

/**
 * Keep `el` sitting exactly on `rect` as seen by `camera`.
 *
 * `el` must be absolutely positioned at the layer's origin with
 * `transform-origin: 0 0`, and its layout size (`w` x `h`) is the picture's own
 * pixel size - 1280x720 here, so one dashboard pixel stays one console pixel.
 */
export function makeScreenProjector(
  el: HTMLElement,
  camera: T.PerspectiveCamera,
  rect: ScreenRect,
  size: () => { w: number; h: number },
  px: { w: number; h: number },
): ScreenProjector {
  const corners: T.Vector3[] = [new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3()];
  const setCorners = () => {
    const [cx, cy, cz] = rect.centre;
    const [hw, hh] = rect.half;
    corners[0]!.set(cx - hw, cy + hh, cz);
    corners[1]!.set(cx + hw, cy + hh, cz);
    corners[2]!.set(cx + hw, cy - hh, cz);
    corners[3]!.set(cx - hw, cy - hh, cz);
  };
  setCorners();
  const q = [0, 0, 0, 0, 0, 0, 0, 0];
  let last = '';

  return {
    update() {
      const { w: VW, h: VH } = size();
      for (let i = 0; i < 4; i++) {
        V.copy(corners[i]!).project(camera);
        q[i * 2] = ((V.x + 1) / 2) * VW;
        q[i * 2 + 1] = ((1 - V.y) / 2) * VH;
      }
      const m = homography(q, px.w, px.h);
      // A degenerate quad - the screen edge-on, or behind the camera - gives a
      // singular system. Leave the last good transform rather than writing NaN,
      // which in CSS drops the transform entirely and slams a 1280x720 element
      // across the room at full size.
      if (!m) return;
      if (m !== last) { el.style.transform = m; last = m; }
    },
  };
}

/**
 * The CSS `matrix3d` that maps the box (0,0)-(w,h) onto the quad `q`.
 *
 * Standard unit-square-to-quad: solve the 8 unknowns of a 3x3 homography with
 * h33 fixed at 1, then pre-scale by 1/w and 1/h so the source is the element's
 * own pixel box rather than the unit square. CSS takes the 4x4 column-major, and
 * the perspective terms live in the fourth ROW (m14, m24) - which is the whole
 * reason this works without a `perspective` ancestor: the divide is in the
 * element's own matrix.
 */
function homography(q: number[], w: number, h: number): string | null {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q as [number, number, number, number, number, number, number, number];
  const dx1 = x1 - x2, dx2 = x3 - x2, sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  if (!isFinite(den) || Math.abs(den) < 1e-9) return null;
  const g = (sx * dy2 - dx2 * sy) / den;
  const k = (dx1 * sy - sx * dy1) / den;
  // Unit square -> quad.
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + k * y3, f = y0;
  // Then (0,0)-(w,h) -> unit square, folded in as a column scale.
  const A = a / w, B = b / h, D = d / w, E = e / h, G = g / w, K = k / h;
  for (const n of [A, B, c, D, E, f, G, K]) if (!isFinite(n)) return null;
  const t = (n: number) => (Math.abs(n) < 1e-10 ? 0 : n);
  return `matrix3d(${t(A)},${t(D)},0,${t(G)},${t(B)},${t(E)},0,${t(K)},0,0,1,0,${t(c)},${t(f)},0,1)`;
}
