/* jsdom has an <audio> element but no media pipeline: play() throws "not
   implemented", and currentTime, duration, playbackRate and volume are inert.
   This makes the element controllable so tests can assert on *intent* — that a
   source was set, that a seek happened, that playback advanced — which is
   exactly the level the spec asks for.

   Installed on the prototype once, for every media element the app creates. */

interface Fake {
  currentTime: number;
  duration: number;
  paused: boolean;
  rate: number;
  defaultRate: number;
  volume: number;
}

const fakes = new WeakMap<HTMLMediaElement, Fake>();

const fake = (el: HTMLMediaElement): Fake => {
  let f = fakes.get(el);
  if (!f) {
    f = { currentTime: 0, duration: NaN, paused: true, rate: 1, defaultRate: 1, volume: 1 };
    fakes.set(el, f);
  }
  return f;
};

const emit = (el: HTMLMediaElement, type: string) => el.dispatchEvent(new Event(type));

export function installMediaStub(): void {
  const proto = HTMLMediaElement.prototype;

  proto.play = function play(this: HTMLMediaElement) {
    fake(this).paused = false;
    emit(this, "play");
    return Promise.resolve();
  };
  proto.pause = function pause(this: HTMLMediaElement) {
    fake(this).paused = true;
    emit(this, "pause");
  };
  proto.load = function load() {};

  const define = (name: string, descriptor: PropertyDescriptor) =>
    Object.defineProperty(proto, name, { configurable: true, ...descriptor });

  define("paused", {
    get(this: HTMLMediaElement) {
      return fake(this).paused;
    },
  });
  define("currentTime", {
    get(this: HTMLMediaElement) {
      return fake(this).currentTime;
    },
    set(this: HTMLMediaElement, value: number) {
      fake(this).currentTime = value;
      emit(this, "timeupdate");
    },
  });
  define("duration", {
    get(this: HTMLMediaElement) {
      return fake(this).duration;
    },
  });
  /* The media load algorithm resets `playbackRate` to `defaultPlaybackRate`.
     Real browsers do this and jsdom does not, so without it a test cannot see a
     speed set before the source was assigned being silently thrown away. */
  const srcDescriptor = Object.getOwnPropertyDescriptor(proto, "src");
  if (srcDescriptor?.set && srcDescriptor.get) {
    const { get, set } = srcDescriptor;
    define("src", {
      get,
      set(this: HTMLMediaElement, value: string) {
        set.call(this, value);
        const f = fake(this);
        if (f.rate !== f.defaultRate) {
          f.rate = f.defaultRate;
          emit(this, "ratechange");
        }
      },
    });
  }

  define("defaultPlaybackRate", {
    get(this: HTMLMediaElement) {
      return fake(this).defaultRate;
    },
    set(this: HTMLMediaElement, value: number) {
      fake(this).defaultRate = value;
    },
  });
  define("playbackRate", {
    get(this: HTMLMediaElement) {
      return fake(this).rate;
    },
    set(this: HTMLMediaElement, value: number) {
      fake(this).rate = value;
      emit(this, "ratechange");
    },
  });
  define("volume", {
    get(this: HTMLMediaElement) {
      return fake(this).volume;
    },
    set(this: HTMLMediaElement, value: number) {
      fake(this).volume = value;
      emit(this, "volumechange");
    },
  });
}

/** Between tests: a fresh element, with nothing loaded. Without this a
    `duration` set by one test leaks into the next, and a test can pass because
    an earlier one happened to load some metadata. */
export function resetMedia(): void {
  const el = document.querySelector("audio");
  if (el) fakes.delete(el);
}

/** The app's one media element, found the way a browser would — not imported
    from the module that made it. */
export const mediaElement = (): HTMLAudioElement => {
  const el = document.querySelector("audio");
  if (!el) throw new Error("no media element in the document");
  return el;
};

/** Metadata arriving, the way a real load would announce it. */
export function givenMetadata(seconds: number): void {
  const el = mediaElement();
  fake(el).duration = seconds;
  emit(el, "loadedmetadata");
  emit(el, "durationchange");
}

/** Playback reaching a point in the file. */
export function advanceTo(seconds: number): void {
  mediaElement().currentTime = seconds;
}

/** The tab going into the background, and coming back. */
export function hidePage(): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
}

export function showPage(): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** The current source running out. */
export function endCurrentTrack(): void {
  emit(mediaElement(), "ended");
}
