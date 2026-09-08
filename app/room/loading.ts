// The screen you look at while the room is still boxes.
//
// Every prop in this room is built twice: a stand-in of the right size, and the
// authored model that replaces it when it arrives. That is the right way round
// for robustness - a failed fetch leaves a television rather than a hole - but
// it means the first second of the room is a white box on a shelf, a white slab
// on a table and a grey cabinet, and then three pops as the real things land.
//
// So the room is not shown until it is the room. This covers the page from the
// first frame, counts the assets in, and gets out of the way.
//
// It is OURS, and it is the only thing on screen the console never drew, so it
// does not borrow the console's chrome: the room's own dark ground, the
// extracted ConvectionUI face for the words, and the same green the rotate ask
// uses. It says what it is doing and how far along it is, and nothing else.

export interface LoadingScreen {
  /** Called as assets arrive. */
  setProgress(done: number, total: number): void;
  /** Fade out and remove. Resolves once it is off the page - REMOVED, not
   *  hidden, because a full-bleed element left in the document is a compositor
   *  layer that smoke-mobile counts. */
  finish(): Promise<void>;
  dispose(): void;
}

/** How long the fade takes. Long enough to read as a reveal, short enough that
 *  nobody waiting on the room resents it. */
const FADE_MS = 420;

export function buildLoadingScreen(host: HTMLElement): LoadingScreen {
  const el = document.createElement('div');
  el.className = 'room-loading';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  const card = document.createElement('div');
  card.className = 'room-loading-card';
  el.appendChild(card);

  const title = document.createElement('div');
  title.className = 'room-loading-title';
  title.textContent = 'Loading the living room';
  card.appendChild(title);

  const track = document.createElement('div');
  track.className = 'room-loading-track';
  const fill = document.createElement('div');
  fill.className = 'room-loading-fill';
  track.appendChild(fill);
  card.appendChild(track);

  const count = document.createElement('div');
  count.className = 'room-loading-count';
  count.textContent = 'Fetching the television, the console and the pad';
  card.appendChild(count);

  host.appendChild(el);

  let done = false;
  return {
    setProgress(n, total) {
      const k = total > 0 ? Math.min(1, n / total) : 0;
      fill.style.transform = `scaleX(${k.toFixed(4)})`;
      // The count is the honest number, not a percentage invented from it.
      count.textContent = total > 0 ? `${Math.min(n, total)} of ${total}` : '';
    },
    finish() {
      if (done) return Promise.resolve();
      done = true;
      fill.style.transform = 'scaleX(1)';
      el.classList.add('is-going');
      return new Promise<void>((res) => {
        setTimeout(() => { el.remove(); res(); }, FADE_MS);
      });
    },
    dispose() { el.remove(); },
  };
}
