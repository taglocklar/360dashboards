// The console's own startup animation, on the tube, before the dashboard.
//
// The green sphere, the X flare, the pull back to the ring and the XBOX 360
// wordmark. It is NOT in the archive - no video container of any type is in
// any of the three dumps, because the animation lives in the console's flash
// and not in the dashboard packs - so this is a capture of a real console's
// output, re-encoded, and PLACEHOLDERS.md says exactly that.
//
// It plays as DOM, like everything else on this glass: a <video> element in
// the picture's layer, behind the hole in the WebGL television. That means the
// warm-up squashes and over-brightens it exactly as it does the dashboard,
// because during these six seconds it IS the picture.
//
// Three timings, all measured against reference/video's capture of a real
// console booting to blades (RUlH, 60 fps):
//
//   - the animation runs 4.62 s, to the frame where the wordmark snaps in
//     (motion per frame peaks at t=1.00 for the X flare and t=4.50 for the
//     ring, and is flat by t=4.75). Our clip settles at 4.62 s too, which is
//     what says the capture is genuine and unstretched.
//   - the logo then HOLDS. On the reference console it holds 4.9 s more, and
//     that hold is not animation, it is the dashboard loading. Ours is already
//     loaded, so the clip is cut to a 0.9 s hold and this file says so.
//   - the handoff is a CUT TO BLACK, not a dissolve: exactly three frames of
//     video black (Y=16) at t=9.650, 9.667 and 9.683, with the logo on the
//     frame before and BootLive's first frame after. 50 ms.
import { BLACK_MS } from './crt';

export type StartupState = 'idle' | 'playing' | 'black' | 'done' | 'skipped' | 'unavailable';

export interface Startup {
  /** The layer the tube's transform is applied to, alongside the picture. */
  readonly layer: HTMLElement;
  readonly state: StartupState;
  /** Play it. Resolves when the dashboard should take over - after the
   *  animation and its 50 ms of black, or at once if it cannot play. */
  play(muted: boolean): Promise<void>;
  /** Take it off the screen now. */
  skip(): void;
  /** Make it playable again. A power CYCLE should show the startup animation
   *  the second time as well as the first - the console did. */
  rearm(): void;
  dispose(): void;
}

/** Served from public/, so a clone builds a working site. */
export const STARTUP_SRC = 'room/xbox360-startup.mp4';

export function buildStartup(host: HTMLElement, base: string): Startup {
  const layer = document.createElement('div');
  layer.className = 'crt-boot';
  layer.hidden = true;

  const video = document.createElement('video');
  video.className = 'crt-boot-video';
  // playsinline or an iPhone takes the video fullscreen out of our living room
  // and into its own player, which is the end of the illusion.
  video.playsInline = true;
  video.preload = 'auto';
  video.controls = false;
  video.loop = false;
  video.src = base + STARTUP_SRC;
  layer.appendChild(video);
  host.appendChild(layer);

  let state: StartupState = 'idle';
  let finish: (() => void) | null = null;
  let blackTimer = 0;

  /** Hand over to the dashboard. Called exactly once per play(). */
  function done(next: StartupState): void {
    if (!finish) return;
    state = next;
    layer.hidden = true;
    const f = finish;
    finish = null;
    f();
  }

  /** The measured cut: the video goes, the layer stays as three frames of
   *  video black, and only then does the dashboard appear under it. */
  function toBlack(): void {
    if (state !== 'playing') return;
    state = 'black';
    layer.classList.add('is-black');
    blackTimer = window.setTimeout(() => done('done'), BLACK_MS);
  }

  const onEnded = () => toBlack();
  // A missing or undecodable file must not hang the boot forever behind a
  // black tube. Either error path hands straight over.
  const onError = () => { if (finish) done('unavailable'); };
  video.addEventListener('ended', onEnded);
  video.addEventListener('error', onError);

  return {
    layer,
    get state() { return state; },
    async play(muted: boolean) {
      if (state !== 'idle') return;
      state = 'playing';
      layer.hidden = false;
      layer.classList.remove('is-black');
      video.muted = muted;
      const ready = new Promise<void>((res) => { finish = res; });
      try {
        await video.play();
      } catch {
        // Autoplay refused. A press of the power button IS a user gesture, so
        // this is the scripted path (__roomApi.press, a deep link) rather than
        // a person. Try again with no sound, which no policy refuses, and give
        // up to the dashboard if even that fails.
        try {
          video.muted = true;
          await video.play();
        } catch {
          done('unavailable');
        }
      }
      return ready;
    },
    rearm() {
      if (state === 'unavailable') return;
      clearTimeout(blackTimer);
      state = 'idle';
      layer.hidden = true;
      layer.classList.remove('is-black');
      try { video.pause(); video.currentTime = 0; } catch { /* not loaded yet */ }
    },
    skip() {
      clearTimeout(blackTimer);
      try { video.pause(); } catch { /* never played */ }
      if (finish) done('skipped');
      else { state = 'skipped'; layer.hidden = true; }
    },
    dispose() {
      clearTimeout(blackTimer);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      try { video.pause(); } catch { /* never played */ }
      // Drop the source or the browser keeps the decoder and the buffer alive
      // for a video nobody can see any more.
      video.removeAttribute('src');
      video.load();
      layer.remove();
    },
  };
}
