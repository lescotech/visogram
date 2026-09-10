/**
 * The hero's background: real 360º tours from the Lesco Viewer, panning slowly
 * and cross-fading as a slideshow.
 *
 * These are equirectangular panoramas, so they are rendered the way the viewer
 * renders them — a perspective camera inside a textured sphere. Scrolling the
 * flat image sideways would be far cheaper, but an equirectangular projection
 * shown flat bows every vertical line, which on a page selling 360º tours is
 * exactly the wrong artefact.
 *
 * Two sphere layers alternate so a slide can fade in over the one leaving.
 * Each layer keeps its own pan offset, which means the incoming tour is already
 * drifting when it appears rather than starting from a dead stop.
 */

import {
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  WebGLRenderer,
} from 'three';

import { YAW_ORIGIN } from '../projection';
import { TOURS, type Tour } from './tours';

// ---------------------------------------------------------------- the knobs

/** Pan rate, radians per second. 0.021 is about 1.2 deg/s. */
const PAN_SPEED = 0.021;
/** How long a slide holds before the next one starts fading in, seconds. */
const HOLD = 9;
/** Cross-fade duration, seconds. */
const FADE = 2.2;
/**
 * The tours are framed for an interactive viewer, at 76–100º vertical, and that
 * framing turns out to be the right one: tightening it to 0.72 of the original
 * filled the screen with whichever wall was nearest and threw away the sense of
 * a room, which is the entire subject. So we keep each scene's own angle and
 * only cap the widest, where the edges start to smear.
 *
 * Check any change with `node tools/preview-hero.mjs <slug> <scene>`, which
 * reprojects the master through the same maths.
 */
const FOV_SCALE = 1;
const FOV_MIN = 46;
const FOV_MAX = 84;
/**
 * The floor under the framing above, and what actually fixes mobile.
 *
 * The camera's fov is the *vertical* angle, so the aspect ratio decides how
 * much you get across. A desktop panel is wide, and 76º vertical comes to
 * about 110º horizontal — a room. The same 76º on a 355x792 phone panel is 41º
 * across: one wall, which is what the hero was showing. So the scene's angle
 * becomes a floor rather than the answer, and we widen until at least H_SWEEP
 * degrees are on screen, up to a vertical ceiling where the projection starts
 * to look like a fisheye.
 *
 * No aspect threshold, deliberately: at any wide aspect the scene's own angle
 * already exceeds what H_SWEEP asks for and wins outright, so desktop framing
 * is untouched, and a window resized across the crossover has nothing to jump
 * over. The crossover sits at aspect 1.24.
 *
 * These two are the mobile framing, and the print has no mobile counterpart to
 * measure against, so they are a starting point rather than a measurement.
 * Judge any change with `SHAPE=phone SCRIM=1 node tools/preview-hero.mjs …`.
 */
const H_SWEEP = 88;
const FOV_MAX_TALL = 104;
/**
 * The covers' own pitch runs up to 23º; past this a backdrop shows ceiling.
 *
 * This is deliberately *not* tightened on a tall panel. Each cover's pitch is
 * where whoever built the tour centred the shot, chosen against this cap; a
 * wider vertical angle opens up symmetrically around that centre, so keeping
 * the pitch keeps their composition and only adds to it. Clamping it towards
 * the horizon instead would quietly re-frame Biotique, whose whole subject is
 * the clad volume above eye level.
 */
const PITCH_LIMIT = 0.18;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** Cosine ease, so the cross-fade has no hard edges at either end. */
const ease = (t: number) => 0.5 - Math.cos(Math.PI * clamp(t, 0, 1)) / 2;

interface Layer {
  mesh: Mesh;
  material: MeshBasicMaterial;
  tour: Tour | null;
  /** Radians panned since this slide appeared. */
  pan: number;
}

export interface Panorama {
  /**
   * Resolves once the first tour's full texture is actually on screen — or once
   * it has failed, so a caller waiting on this can never be stranded.
   */
  ready: Promise<void>;
  /** Called whenever a new slide starts fading in. */
  onSlide(listener: (tour: Tour, index: number) => void): void;
  /** Jump to a slide, restarting the hold timer. */
  go(index: number): void;
  /**
   * Stop drawing. The tour viewer covers this canvas completely, and two WebGL
   * contexts rendering at once is a real cost on a phone for a picture nobody
   * can see.
   */
  pause(): void;
  resume(): void;
  destroy(): void;
}

export interface PanoramaOptions {
  /** Defaults to the generated manifest; overridden by the projection harness. */
  tours?: Tour[];
  /** Hold a single slide, for checking framing against the viewer. */
  freeze?: boolean;
}

export function createPanorama(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  options: PanoramaOptions = {},
): Panorama {
  const slides = options.tours ?? TOURS;
  const frozen = options.freeze ?? false;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = Boolean(
    (navigator as { connection?: { saveData?: boolean } }).connection?.saveData,
  );
  /**
   * Which texture tier to pull. Save-Data is the frugal path — an explicit
   * request to spend less, which we honour. A narrow viewport is the opposite:
   * see `srcDense`. These used to be one flag, which is how phones ended up
   * with the 1280 texture magnified almost six times.
   */
  const dense = !saveData && window.innerWidth < 900;
  const srcFor = (tour: Tour) =>
    saveData ? tour.srcLite : dense ? tour.srcDense : tour.src;

  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
  // Rendering below the device's own ratio is the one blur a sharper texture
  // cannot fix, so only Save-Data pays that price now.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, saveData ? 1.5 : 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, 0.1, 100);

  // Mirroring the geometry turns the sphere inside out *and* flips the winding,
  // so the texture reads the right way round from the centre with ordinary
  // front-face rendering. Scaling alone, or BackSide alone, mirrors the room.
  const geometry = new SphereGeometry(10, 64, 40);
  geometry.scale(-1, 1, 1);

  const loader = new TextureLoader();
  /** Decoded textures kept by url: the slideshow loops, so re-fetching and
   *  re-uploading the same panorama every cycle is pure waste. */
  const cache = new Map<string, Texture>();
  /**
   * How many panoramas may sit on the GPU at once. A 4096x2048 texture is 32MB
   * as RGBA and 43MB once mipmapped, so holding all four dense tours would ask
   * a phone for 170MB of texture memory — which is where iOS starts dropping
   * the WebGL context, and the hero would vanish mid-slideshow. Three covers
   * everything on screen or about to be: the slide showing, the one fading out
   * and the one being warmed. On desktop the textures are a quarter the size,
   * so the whole set stays resident and the loop never refetches.
   */
  const CACHE_MAX = dense ? 3 : Infinity;
  /** Insertion order is not use order, so evict against this instead. */
  const used: string[] = [];

  /** Never evict a texture a layer is still drawing, or the slide goes black. */
  const inUse = () =>
    new Set(layers.map((l) => l.material.map).filter(Boolean) as Texture[]);

  /**
   * Record a panorama as the most recently wanted, then evict down to budget,
   * oldest first. The inline placeholders are a few hundred bytes and are never
   * registered here, so they cost nothing and can never be evicted out from
   * under a slide that has not got its full texture yet.
   */
  function touch(url: string) {
    const at = used.indexOf(url);
    if (at !== -1) used.splice(at, 1);
    used.push(url);
    if (used.length <= CACHE_MAX) return;
    const live = inUse();
    for (const candidate of [...used]) {
      if (used.length <= CACHE_MAX) break;
      const texture = cache.get(candidate);
      if (!texture || live.has(texture)) continue;
      texture.dispose();
      cache.delete(candidate);
      used.splice(used.indexOf(candidate), 1);
    }
  }

  const prepare = (texture: Texture) => {
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  };

  async function textureFor(url: string, budgeted = false) {
    if (budgeted) touch(url);
    const hit = cache.get(url);
    if (hit) return hit;
    const texture = prepare(await loader.loadAsync(url));
    cache.set(url, texture);
    // Again on arrival: a slow download may have been overtaken by two more
    // slides, and the budget is about what is resident, not what was asked for.
    if (budgeted) touch(url);
    return texture;
  }

  const layers: Layer[] = [0, 1].map((i) => {
    const material = new MeshBasicMaterial({
      transparent: true,
      opacity: i === 0 ? 1 : 0,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.rotation.order = 'YXZ';
    mesh.frustumCulled = false;
    mesh.renderOrder = i;
    scene.add(mesh);
    return { mesh, material, tour: null, pan: 0 };
  });

  /** Resolved by the first full texture landing (or failing). */
  let markReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  let front = 0;
  let index = -1;
  let held = 0;
  /** Progress through the current cross-fade, or null when settled. */
  let fading: number | null = null;
  let listeners: ((tour: Tour, index: number) => void)[] = [];

  const camFrom = { pitch: 0, fov: 60 };
  const camTo = { pitch: 0, fov: 60 };

  const deg = (r: number) => (r * 180) / Math.PI;
  const rad = (d: number) => (d * Math.PI) / 180;
  /** Vertical angle that yields `h` degrees across, at the camera's aspect. */
  const verticalFor = (h: number) =>
    2 * deg(Math.atan(Math.tan(rad(h / 2)) / camera.aspect));

  // Widen, never narrow: a scene already framed wider than H_SWEEP asks for
  // keeps its own angle, which is every scene on a desktop.
  const fovFor = (tour: Tour) =>
    Math.min(
      Math.max(clamp(tour.vista.fov * FOV_SCALE, FOV_MIN, FOV_MAX), verticalFor(H_SWEEP)),
      FOV_MAX_TALL,
    );
  const pitchFor = (tour: Tour) =>
    clamp(tour.vista.pitch, -PITCH_LIMIT, PITCH_LIMIT);

  /**
   * Land a cross-fade already in flight. Without this, tapping an indicator
   * mid-fade would hand the incoming layer a second tour: the fade restarts
   * from zero, so the slide being replaced snaps back into view before fading
   * out again, and the caption is left describing neither.
   */
  function settleFade() {
    if (fading === null) return;
    const incoming = layers[front === 0 ? 1 : 0];
    const outgoing = layers[front];
    if (incoming) incoming.material.opacity = 1;
    if (outgoing) {
      outgoing.material.opacity = 0;
      outgoing.tour = null;
    }
    camera.rotation.x = camTo.pitch;
    camera.fov = camTo.fov;
    camera.updateProjectionMatrix();
    front = front === 0 ? 1 : 0;
    fading = null;
  }

  function show(next: number, immediate = false) {
    if (!slides.length) return;
    const target = ((next % slides.length) + slides.length) % slides.length;
    const tour = slides[target];
    if (!tour) return;
    if (target === index && !immediate) return;

    settleFade();

    index = target;
    held = 0;

    const incoming = layers[front === 0 ? 1 : 0];
    const outgoing = layers[front];
    if (!incoming || !outgoing) return;

    incoming.tour = tour;
    incoming.pan = 0;
    incoming.mesh.renderOrder = 1;
    outgoing.mesh.renderOrder = 0;

    // Show the inline placeholder at once, then swap in the real panorama.
    // 200-odd bytes of blur beats a black panel while the texture downloads.
    void textureFor(tour.lqip)
      .then((t) => {
        if (incoming.tour === tour && !incoming.material.map) {
          incoming.material.map = t;
          incoming.material.needsUpdate = true;
          invalidate();
        }
      })
      .catch(() => {});
    void textureFor(srcFor(tour), true)
      .then((t) => {
        if (incoming.tour !== tour) return;
        incoming.material.map = t;
        incoming.material.needsUpdate = true;
        invalidate();
      })
      // Either way the wait is over: the loader must not outlive a failed
      // texture, and the scrim over a navy panel is a complete design already.
      .finally(markReady);

    camFrom.pitch = camTo.pitch;
    camFrom.fov = camTo.fov;
    camTo.pitch = pitchFor(tour);
    camTo.fov = fovFor(tour);

    if (immediate) {
      incoming.material.opacity = 1;
      outgoing.material.opacity = 0;
      outgoing.tour = null;
      camFrom.pitch = camTo.pitch;
      camFrom.fov = camTo.fov;
      camera.rotation.x = camTo.pitch;
      camera.fov = camTo.fov;
      camera.updateProjectionMatrix();
      front = front === 0 ? 1 : 0;
      fading = null;
    } else {
      incoming.material.opacity = 0;
      fading = 0;
    }

    for (const listener of listeners) listener(tour, index);
    // Warm the next panorama while this one is on screen, so the cross-fade
    // never waits on the network.
    const upcoming = slides[(index + 1) % slides.length];
    if (upcoming && !saveData) {
      void textureFor(srcFor(upcoming), true);
    }
    invalidate();
  }

  // ------------------------------------------------------------------ framing

  function resize() {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;

    // On a tall panel the framing is derived from the aspect, so it is not a
    // per-slide constant any more: rotating a phone, or the address bar
    // collapsing, has to re-solve it. Recomputing the target of a cross-fade
    // in flight would make the camera jump, so mid-fade only the destination
    // moves and the interpolation carries the camera there.
    const current = layers[front]?.tour ?? layers[front === 0 ? 1 : 0]?.tour;
    const incoming = layers[front === 0 ? 1 : 0]?.tour;
    if (fading !== null && incoming) {
      camTo.pitch = pitchFor(incoming);
      camTo.fov = fovFor(incoming);
    } else if (current) {
      camTo.pitch = pitchFor(current);
      camTo.fov = fovFor(current);
      camFrom.pitch = camTo.pitch;
      camFrom.fov = camTo.fov;
      camera.rotation.x = camTo.pitch;
      camera.fov = camTo.fov;
    }

    camera.updateProjectionMatrix();
    invalidate();
  }

  // -------------------------------------------------------------------- loop

  let frame = 0;
  let last = 0;
  let paused = false;

  /** Push each layer's framing onto its mesh. */
  function applyPose() {
    for (const layer of layers) {
      if (!layer.tour) continue;
      layer.mesh.rotation.y = YAW_ORIGIN - layer.tour.vista.yaw + layer.pan;
    }
  }

  function invalidate() {
    if (frame || paused) return;
    if (document.hidden) {
      // A hidden document gets no animation frames, so nothing would ever be
      // drawn — a tab opened in the background would be revealed blank. Draw
      // the current pose once instead; the visibility handler resumes the loop.
      applyPose();
      renderer.render(scene, camera);
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    frame = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;

    const moving = !reduceMotion.matches && !frozen;

    if (moving) {
      for (const layer of layers) {
        if (layer.tour) layer.pan += PAN_SPEED * dt;
      }
    }
    applyPose();

    if (fading !== null) {
      fading += dt / (reduceMotion.matches ? FADE * 2 : FADE);
      const t = ease(fading);
      const incoming = layers[front === 0 ? 1 : 0];
      const outgoing = layers[front];
      if (incoming) incoming.material.opacity = t;
      if (outgoing) outgoing.material.opacity = 1 - t;
      camera.rotation.x = camFrom.pitch + (camTo.pitch - camFrom.pitch) * t;
      camera.fov = camFrom.fov + (camTo.fov - camFrom.fov) * t;
      camera.updateProjectionMatrix();
      if (fading >= 1) {
        if (outgoing) {
          outgoing.material.opacity = 0;
          outgoing.tour = null;
        }
        front = front === 0 ? 1 : 0;
        fading = null;
      }
    } else {
      held += dt;
      // Save-Data means one panorama and no cycling.
      if (held >= HOLD && slides.length > 1 && !saveData && !frozen) show(index + 1);
    }

    renderer.render(scene, camera);
    // A pan or a fade always has another frame to draw; a settled, held slide
    // with Save-Data on has none.
    if (moving || fading !== null || (!saveData && slides.length > 1 && !frozen)) invalidate();
    else last = 0;
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const onVisibility = () => {
    if (document.hidden) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    } else {
      invalidate();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  show(0, true);

  return {
    ready,
    onSlide(listener) {
      listeners.push(listener);
      const tour = slides[index];
      if (tour) listener(tour, index);
    },
    go(next) {
      if (next !== index) show(next);
    },
    pause() {
      paused = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    },
    resume() {
      if (!paused) return;
      paused = false;
      invalidate();
    },
    destroy() {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (frame) cancelAnimationFrame(frame);
      listeners = [];
      for (const texture of cache.values()) texture.dispose();
      cache.clear();
      for (const layer of layers) layer.material.dispose();
      geometry.dispose();
      renderer.dispose();
    },
  };
}

