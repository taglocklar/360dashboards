// The room, in metres. One world unit is one metre; every number here is a real
// measurement of a real object, because a living room built out of round
// numbers reads as a diagram and a living room built out of catalogue
// dimensions reads as a room.
//
// The television is a 34" WIDESCREEN HD CRT (the Sony KV-34XBR shape). That is
// not a compromise for legibility: a 360 in 2008 sat in front of exactly this
// set, and it is the only period-correct television whose native picture is the
// 1280x720 frame this project already renders. A 4:3 CRT would force a
// letterbox decision the console's own view transform has no opinion about.

/** Screen glass, 34" diagonal at 16:9. 34 * 0.87157 = 29.63" across. */
export const SCREEN = {
  /** Visible picture width. */
  w: 0.752,
  /** Visible picture height. 0.752 / (16/9). */
  h: 0.423,
  /** Height of the picture's centre above the floor: the stand's 0.46 m top,
   *  plus the cabinet's 0.29 m from its foot to the middle of the glass. */
  y: 0.75,
  /** The glass, in room z, and a LITERAL on purpose.
   *
   *  It used to be derived as ROOM.back + 0.06 + CAB.d, where CAB.d was the
   *  procedural cabinet's 0.60 m depth. The authored set is 0.640 deep and it
   *  grows BACKWARDS from this same plane, so re-deriving it would walk the
   *  picture 40 mm forward and take the camera poses, the glow light and the
   *  whole aperture fit with it. The set now leaves 30 mm of air to the wall
   *  rather than 60, and the number that must not move is this one. */
  z: -1.24,
} as const;

/** The design canvas the dashboard is rendered at, before the CSS3D plane
 *  scales it down onto the glass. The console's own output size: never scale
 *  the dashboard by anything but this one uniform factor, or the measured
 *  canvas -> framebuffer transform in packages/runtime stops being measured. */
export const SCREEN_PX = { w: 1280, h: 720 } as const;

/** metres per CSS pixel on the glass. */
export const PX = SCREEN.w / SCREEN_PX.w;

export const ROOM = {
  /** Wall to wall, left to right. */
  w: 4.6,
  /** Floor to ceiling. 2008 tract-house standard is 8 ft. */
  h: 2.44,
  /** Back wall (behind the television) to the wall behind the couch. */
  d: 5.2,
  /** z of the back wall's inner face. */
  back: -1.9,
} as const;

/** Where the viewer sits, and where they end up when the picture comes on.
 *
 *  Two poses, one easing. `idle` is the whole room: you are on the couch, the
 *  set is dark, the screen is 19% of the frame and you can see the lamp, the
 *  rug and the console. `viewing` is the same seat leaning in, and the lens
 *  narrowing with it - a dolly ALONE at this distance reads as lurching, and a
 *  zoom alone reads as a security camera. Together they read as a person
 *  paying attention.
 *
 *  The numbers: at fov 25 deg and 1.45 m the frame is 2*1.45*tan(12.5)*16/9 =
 *  1.144 m across, so the 0.752 m picture fills 66% of it.
 *
 *  The IDLE fov is 54, not the 45 it started at. A vertical fov of 45 on 16:9
 *  is 36.4 degrees of half-horizontal, and the room's own furniture sits wider
 *  than that: the window on the right wall was 55.7 degrees off the view axis,
 *  which no sane lens reaches - even a 70 deg fisheye only gets to 51.2. So the
 *  lens opened to 42.2 degrees of half-horizontal AND the window moved forward
 *  to meet it (see addLights and buildWindow). Widening alone would not have
 *  done it, and that is worth knowing before anyone tries again. Not more: at 75%
 *  the bezel leaves the frame entirely and the room goes with it, and a room
 *  you cannot see while you are using the dashboard is a room that was not
 *  worth building. */
export const CAMERA = {
  idle: { pos: [0.16, 1.05, 1.72] as const, target: [0, SCREEN.y, SCREEN.z] as const, fov: 54 },
  viewing: { pos: [0, SCREEN.y + 0.02, SCREEN.z + 1.45] as const, target: [0, SCREEN.y, SCREEN.z] as const, fov: 25 },
  /** Seconds for the push-in, and for the pull-out. */
  pushIn: 1.6,
  pullOut: 1.1,
  /** How far the head leans with the pointer, in metres, at the edge of the
   *  window. Small on purpose: parallax sells a room, a swinging camera sells
   *  a tech demo. */
  parallax: 0.055,
} as const;
