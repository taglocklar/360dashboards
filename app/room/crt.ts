// What the picture does on its way to being a picture.
//
// A CRT does not "turn on". The heater takes about half a second to get the
// cathode hot enough to emit, the beam arrives before the vertical deflection
// does, so the whole frame lands on ONE LINE across the middle of the tube,
// and the line then opens out as deflection comes up - overshooting bright,
// because the automatic beam limiter has not caught up yet. On the way it
// wobbles, because the degauss coil has just fired.
//
// None of that can be a shader here: the picture is a DOM tree behind a hole
// in the WebGL canvas (screen.ts), never a texture. So every artefact on this
// glass is a CSS filter or a transform on the dashboard's own element, applied
// from a timeline this file steps by hand. That is a real constraint and it
// buys a real thing: the dashboard stays a live, focusable, 60 Hz DOM tree
// while it warms up.
//
// The timeline is in SECONDS FROM THE PRESS, stepped by dt, so `&manual` plus
// a fixed dt reproduces any frame of it exactly.

/** Every moment of the sequence, in seconds after the power button. */
export const WARMUP = {
  /** The ring of light starts its clockwise sweep the instant of the press. */
  ringSweep: 0.075,
  /** Relay clunk: the tube is now live and the glass becomes a hole. */
  live: 0.30,
  /** The beam arrives with no vertical deflection: one bright line. */
  line: 0.42,
  /** Deflection comes up and the line opens into a frame. */
  bloomFrom: 0.52,
  bloomTo: 0.78,
  /** The beam limiter catches up and the overshoot decays. */
  settleTo: 1.53,
  /** When the console's own STARTUP ANIMATION starts - the sphere, the X
   *  flare, the ring, the XBOX 360 wordmark (app/room/startup.ts).
   *
   *  Just AFTER the line and BEFORE the bloom, on purpose. The console starts
   *  the instant the button is pressed and the television takes about a second
   *  to catch up, so on real hardware the tube opens onto an animation that is
   *  already running. Firing it after the bloom instead put a settled picture
   *  on screen for half a second and then started, which reads as a glitch.
   *
   *  The DASHBOARD's own boot range comes after the animation, not here; the
   *  room waits for startup.play() to resolve. This is only the fallback for a
   *  route with no animation to play (`&startup=off`, `&manual`, or a missing
   *  or undecodable file). */
  boot: 0.44,
} as const;

/**
 * The cut from the startup animation to the dashboard, in milliseconds.
 *
 * MEASURED, and it is a cut and not a dissolve: on the reference capture of a
 * real console booting to blades there are exactly three frames of video black
 * (Y=16) at 60 fps between the last frame carrying the XBOX 360 wordmark and
 * BootLive's first frame [reference/video RUlH, t=9.650, 9.667, 9.683].
 */
export const BLACK_MS = 50;

export interface Crt {
  /** The element the dashboard mounts into. Everything below transforms IT. */
  picture: HTMLElement;
  /** Anything else that is the PICTURE for a while and must be squashed,
   *  wobbled and over-brightened with it - the startup animation's layer. The
   *  glass (the veil, the face) is not in here: it does not move. */
  addToPicture(el: HTMLElement): void;
  /** Seconds since the press; negative or 0 is a dark tube. */
  setWarm(t: number): void;
  /** Back to a cold tube. */
  reset(): void;
  dispose(): void;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Smooth in, hard out: how deflection actually comes up. */
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

export function buildCrt(host: HTMLElement): Crt {
  const picture = document.createElement('div');
  picture.className = 'crt-picture';
  host.appendChild(picture);

  // The veil is what makes the line a LINE: at the moment of the bloom the
  // picture is 0.4% of its height, and a squashed dashboard is a grey smear
  // rather than the white bar a tube actually shows. The veil sits over it and
  // carries the brightness - and it must be SQUASHED BY THE SAME AMOUNT. A
  // full-bleed white veil over a 3 px picture is not a scanline, it is a white
  // screen, which is exactly what it looked like the first time.
  const veil = document.createElement('div');
  veil.className = 'crt-veil';
  host.appendChild(veil);

  // The face of the tube, over everything: the aperture grille, the line
  // structure, and the corner falloff of a curved screen behind a curved
  // sheet of glass. Static - it is the GLASS, not the picture, so it does not
  // squash with the bloom and it does not move.
  //
  // What is NOT here is barrel distortion. The picture is a flat DOM plane and
  // the only ways to bend one are an SVG displacement filter (which resamples
  // the whole 1280x720 tree every frame) or bending the geometry the DOM is
  // not on. The curvature is carried by the falloff and by the glass highlight
  // in front of it instead, and PLACEHOLDERS.md says so.
  const face = document.createElement('div');
  face.className = 'crt-face';
  host.appendChild(face);

  /** Everything the tube's geometry applies to. The picture, plus whatever is
   *  standing in for it. */
  const beam: HTMLElement[] = [picture];

  function setWarm(t: number): void {
    if (t <= WARMUP.line) {
      // Cold, or lit but not yet scanning.
      for (const el of beam) { el.style.transform = 'scaleY(0)'; el.style.filter = ''; }
      veil.style.transform = 'scaleY(0)';
      veil.style.opacity = '0';
      return;
    }
    // ---------------------------------------------------------- the bloom
    let open: number;
    if (t < WARMUP.bloomFrom) open = 0.004;
    else open = lerp(0.004, 1, easeOut(clamp01((t - WARMUP.bloomFrom) / (WARMUP.bloomTo - WARMUP.bloomFrom))));

    // ------------------------------------------------------ the overshoot
    // Brightness starts far over and decays to 1. Saturation comes up with
    // it: a tube that is blowing out is also washed out.
    const settle = clamp01((t - WARMUP.bloomFrom) / (WARMUP.settleTo - WARMUP.bloomFrom));
    const s = easeOut(settle);
    const bright = lerp(2.7, 1, s);
    const sat = lerp(0.25, 1, s);
    const contrast = lerp(0.78, 1, s);

    // ---------------------------------------------------------- the degauss
    // A decaying horizontal ripple for the first third of a second, which is
    // the degauss coil's field dying out. 9 Hz, +-1.4% of width.
    const dg = Math.max(0, 1 - (t - WARMUP.line) / 0.42);
    const wobble = dg * dg * 0.014 * Math.sin((t - WARMUP.line) * 2 * Math.PI * 9);

    const xf = `scaleY(${open.toFixed(5)}) scaleX(${(1 + wobble).toFixed(5)})`;
    const fx = `brightness(${bright.toFixed(3)}) saturate(${sat.toFixed(3)}) contrast(${contrast.toFixed(3)})`;
    for (const el of beam) { el.style.transform = xf; el.style.filter = fx; }
    veil.style.transform = xf;
    // The veil is the line itself: bright while the picture is a sliver, gone
    // by the time there is a frame to look at.
    veil.style.opacity = (Math.pow(1 - clamp01((open - 0.004) / 0.55), 2) * 0.92).toFixed(3);
  }

  return {
    picture,
    addToPicture(el) { if (!beam.includes(el)) beam.push(el); },
    setWarm,
    reset() { setWarm(0); },
    dispose() { picture.remove(); veil.remove(); face.remove(); },
  };
}
