// The wheel in the top left: what is plugged into the television.
//
// This replaces the launcher. The launcher was a page you passed THROUGH on
// the way to a dashboard, which meant the first thing anyone saw of an Xbox
// 360 was a web page - and once the dashboards run on a set in a living room,
// there is nowhere for a page like that to be. So the choice moved into the
// room, as a corner control that is ours and does not pretend to be the
// console's: it is the only thing on screen the console never drew.
//
// It swaps the build IN PLACE (Room.changeInput -> mountDashboard). The tube
// collapses to a line, the other dashboard is built behind it, and the tube
// blooms again. Nothing else in the room moves, which is the whole point of
// putting the choice here instead of in a URL.
import type { Room } from './Room';
import type { BuildId } from '@runtime/index';

interface Spoke {
  /** A dashboard to plug in, or `power` - the one entry that is an ACTION on
   *  the console rather than a choice of what is running on it. */
  kind?: 'power';
  build: BuildId | null;
  /** What the wheel calls it. The console's own name for itself, not ours. */
  name: string;
  /** One line under it. Concrete: what you get, not how it feels. */
  note: string;
  /** null build = on the wheel, not selectable, and it says why. */
  why?: string;
}

const SPOKES: readonly Spoke[] = [
  { build: '6770', name: 'Blades', note: '2008 build 6770' },
  { build: '9199', name: 'NXE', note: '2008 build 9199' },
  // Metro is extracted, parsed and cross-checked by the same pipeline, and it
  // has no runtime. Saying so on the wheel is better than leaving a hole where
  // the third dashboard obviously goes.
  { build: null, name: 'Metro', note: '2011 build 17559', why: 'No runtime yet' },
  // Not a dashboard. The console's own power, so that the way OUT of the
  // experience is in the same place as the way around it - a viewer who wants
  // the set off should not have to remember which object in the room is
  // clickable.
  { build: null, kind: 'power', name: 'Power', note: '' },
];

export interface Wheel {
  /** Which build the wheel is showing as current. */
  readonly build: BuildId;
  setBuild(b: BuildId): void;
  dispose(): void;
}

export interface WheelReport {
  open: boolean;
  build: BuildId;
  spokes: { name: string; build: string | null; disabled: boolean; kind?: string }[];
  /** Every switch this page has done, oldest first. The suite reads it. */
  changes: string[];
}
declare global { interface Window { __wheel?: () => WheelReport } }

export function buildWheel(
  room: Room,
  current: BuildId,
  swap: (b: BuildId) => Promise<void>,
): Wheel {
  let build = current;
  let open = false;
  let busy = false;
  const changes: string[] = [];

  const root = document.createElement('div');
  root.className = 'wheel';

  const hub = document.createElement('button');
  hub.type = 'button';
  hub.className = 'wheel-hub';
  hub.setAttribute('aria-haspopup', 'true');
  hub.setAttribute('aria-expanded', 'false');
  hub.setAttribute('aria-label', 'Choose a dashboard');
  // A COG. The first version was a dial - a thin rim, eight ticks and a filled
  // hub - and a dial reads as a tuner, not as settings. A gear is the one shape
  // everybody already knows means "this opens the options": a thick hollow ring
  // with stubby teeth around it, and nothing in the middle.
  const TEETH = 8;
  const teeth = Array.from({ length: TEETH }, (_, k) => {
    const a = (k * Math.PI * 2) / TEETH;
    const c = Math.cos(a), sn = Math.sin(a);
    const f = (n: number) => (12 + n).toFixed(2);
    return `<path d="M${f(c * 7.1)} ${f(sn * 7.1)}L${f(c * 10.3)} ${f(sn * 10.3)}"/>`;
  }).join('');
  hub.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + teeth
    + '<circle class="rim" cx="12" cy="12" r="5.9"/>'
    + '</svg>';
  root.appendChild(hub);

  const arc = document.createElement('div');
  arc.className = 'wheel-arc';
  root.appendChild(arc);

  /** Vertical step between spokes, and the radius the arc is solved on. The
   *  radius grows if there are ever enough entries that the last one would run
   *  past the bottom of the circle. */
  const STEP = 60;
  const RADIUS = Math.max(186, ((SPOKES.length - 1) * STEP) / 0.92);

  const buttons: HTMLButtonElement[] = [];
  SPOKES.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wheel-spoke';
    // A quarter circle, starting almost horizontal so the first label clears
    // the hub. 34 degrees apart: see the radius note in the .wheel-spoke rule
    // for why the spacing and the radius are one decision.
    // Equal VERTICAL spacing on a circular arc, not equal angles.
    //
    // Equal angles on a quarter circle space the top pair 86 px apart and the
    // bottom pair 55, which was survivable at three entries and overlaps at
    // four. So the y of each spoke is fixed at a constant step and the ANGLE is
    // solved for it - asin(y / r) - which keeps the fan of a wheel opening
    // while guaranteeing the labels clear each other however many there are.
    const y = i * STEP;
    const deg = (Math.asin(Math.min(1, y / RADIUS)) * 180) / Math.PI;
    b.style.setProperty('--a', `${deg.toFixed(3)}deg`);
    b.style.setProperty('--r', `${RADIUS.toFixed(1)}px`);
    b.style.setProperty('--i', String(i));
    b.disabled = s.build === null && s.kind !== 'power';
    if (s.kind === 'power') b.classList.add('is-power');
    b.innerHTML = `<b>${s.name}</b><span>${s.build === null && s.why ? s.why : s.note}</span>`;
    if (s.kind === 'power') {
      b.addEventListener('click', () => {
        setOpen(false);
        room.setPower(!room.powered);
        paint();
      });
    } else if (s.build !== null) {
      b.addEventListener('click', () => { void choose(s.build!); });
    }
    arc.appendChild(b);
    buttons.push(b);
  });

  function paint(): void {
    root.classList.toggle('is-open', open);
    hub.setAttribute('aria-expanded', open ? 'true' : 'false');
    for (let i = 0; i < SPOKES.length; i++) {
      const s = SPOKES[i]!;
      const el = buttons[i]!;
      if (s.kind === 'power') {
        // The label is the ACTION, not the state: "Power off" when it is on.
        el.querySelector('b')!.textContent = room.powered ? 'Power off' : 'Power on';
        el.querySelector('span')!.textContent = room.powered ? 'Turn the console off' : 'Turn the console on';
        el.tabIndex = open ? 0 : -1;
        continue;
      }
      const isCurrent = s.build === build;
      // No tick, no dot. Weight and fill say which one is on; aria says it to
      // anything that cannot see weight or fill.
      el.classList.toggle('is-current', isCurrent);
      el.setAttribute('aria-current', isCurrent ? 'true' : 'false');
      // A closed wheel must not be a tab stop: three invisible buttons in the
      // corner of the page is three presses of Tab that appear to do nothing.
      el.tabIndex = open && !el.disabled ? 0 : -1;
    }
  }

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    paint();
    if (open) buttons.find((b) => !b.disabled)?.focus();
  }

  async function choose(next: BuildId): Promise<void> {
    setOpen(false);
    if (busy || next === build) return;
    busy = true;
    try {
      const ok = await room.changeInput(async () => {
        await swap(next);
      });
      if (ok) {
        build = next;
        changes.push(next);
        // A refresh should land on what is on the screen, not on what was on
        // it when the page opened. replaceState, not pushState: the wheel is
        // not navigation and Back should leave the room, not undo a channel.
        const u = new URL(location.href);
        u.searchParams.set('build', next);
        // `room` goes in WITH the build. A bare `/` is the room, but
        // `/?build=9199` alone is the flat stage - so writing only the build
        // would mean a refresh after a swap dropped you out of the living room
        // and onto a 16:9 page.
        if (!u.searchParams.has('room')) u.searchParams.set('room', '');
        history.replaceState(null, '', u);
        paint();
      }
    } finally {
      busy = false;
    }
  }

  const onHub = () => setOpen(!open);
  hub.addEventListener('click', onHub);
  // Escape closes it, and a click anywhere else does too. Both listen on the
  // window because the wheel sits over a 3D scene that swallows nothing.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) { setOpen(false); hub.focus(); }
  };
  const onAway = (e: PointerEvent) => {
    if (open && !root.contains(e.target as Node)) setOpen(false);
  };
  addEventListener('keydown', onKey);
  addEventListener('pointerdown', onAway, true);

  room.overlay.appendChild(root);
  paint();

  window.__wheel = () => ({
    open,
    build,
    spokes: SPOKES.map((s) => ({
      name: s.name, build: s.build, kind: s.kind,
      disabled: s.build === null && s.kind !== 'power',
    })),
    changes: [...changes],
  });

  return {
    get build() { return build; },
    setBuild(b) { build = b; paint(); },
    dispose() {
      removeEventListener('keydown', onKey);
      removeEventListener('pointerdown', onAway, true);
      hub.removeEventListener('click', onHub);
      root.remove();
      delete window.__wheel;
    },
  };
}
