/**
 * The in-page 360 viewer: an overlay you drag to look around, with a strip of
 * the tour's other rooms along the bottom and — where the tour has them — the
 * doorways placed in the panorama itself.
 *
 * Two renderers now exist on this page and they do different jobs. The hero's
 * (`hero/panorama.ts`) turns two spheres slowly behind a scrim and cross-fades
 * between tours; nobody steers it. This one hands the camera over: one sphere
 * at a time, a heading the visitor owns, and a field of view they can close in
 * with. They share only the projection convention, which lives in
 * `src/projection.ts` so there is one copy of it.
 *
 * Loaded on demand — three.js, this module, its stylesheet and the scene
 * manifest all arrive when someone opens a tour, not before.
 */

import {
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene as ThreeScene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';

import './viewer.css';
import { YAW_ORIGIN } from '../projection';
import { findTour, place, type Scene, type TourScenes } from './scenes';

// ----------------------------------------------------------------- the knobs

/** Vertical field of view, degrees. The scenes open between 76 and 100. */
const FOV_MIN = 32;
const FOV_MAX = 100;
/** 85º. Past this the poles smear and the horizon leaves the frame entirely. */
const PITCH_LIMIT = 1.4835;
/** Scene cross-fade, seconds. */
const FADE = 0.5;
/** Inertia decay. Velocity falls to 1/e in 1/DAMPING seconds. */
const DAMPING = 5.5;
/** Below this the drag was a click on whatever sits under the pointer. */
const DRAG_SLOP = 6;
/** Arrow keys, radians per press; +/- step the fov by a fixed ratio. */
const KEY_STEP = 0.08;
const ZOOM_STEP = 1.18;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const ease = (t: number) => 0.5 - Math.cos(Math.PI * clamp(t, 0, 1)) / 2;
const rad = (deg: number) => (deg * Math.PI) / 180;

const ICON = {
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M11 8v6M8 11h6M15.8 15.8L20 20"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M8 11h6M15.8 15.8L20 20"/></svg>',
  spot:
    '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><circle cx="20" cy="20" r="13"/><path d="M15 20h10M21 16l4 4-4 4"/></svg>',
};

interface Layer {
  mesh: Mesh;
  material: MeshBasicMaterial;
  scene: Scene | null;
}

interface Marker {
  el: HTMLButtonElement;
  dir: Vector3;
}

// ------------------------------------------------------------------ the stage

/**
 * Built once, on the first open, and kept for the session. Tearing the WebGL
 * context down and standing it back up on every open costs more than the few
 * megabytes of held textures, and the second open should be instant.
 */
function build() {
  const root = document.createElement('div');
  root.className = 'v360';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.hidden = true;
  root.innerHTML = `
    <div class="v360__stage">
      <canvas class="v360__canvas" tabindex="0"
        aria-label="Panorama do ambiente. Arraste para olhar em volta; use as setas do teclado para girar e + ou - para aproximar."></canvas>
      <div class="v360__spots"></div>
      <p class="v360__hint">Arraste para olhar em volta</p>
      <p class="v360__fail" hidden></p>
    </div>
    <header class="v360__top">
      <div class="v360__id">
        <p class="v360__obra"></p>
        <p class="v360__where"></p>
      </div>
      <div class="v360__acts">
        <button class="v360__ctrl" type="button" data-act="out" title="Afastar" aria-label="Afastar">${ICON.out}</button>
        <button class="v360__ctrl" type="button" data-act="in" title="Aproximar" aria-label="Aproximar">${ICON.in}</button>
        <button class="v360__ctrl v360__ctrl--close" type="button" data-act="close" title="Fechar o tour" aria-label="Fechar o tour">${ICON.close}</button>
      </div>
    </header>
    <div class="v360__foot">
      <p class="v360__now" aria-live="polite"></p>
      <nav class="v360__strip" aria-label="Ambientes do tour"></nav>
    </div>
    <div class="v360__wait" hidden><i></i></div>
  `;

  const pick = <T extends HTMLElement>(selector: string) => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`viewer: missing ${selector}`);
    return el;
  };

  const ui = {
    root,
    stage: pick('.v360__stage'),
    canvas: pick<HTMLCanvasElement>('.v360__canvas'),
    spots: pick('.v360__spots'),
    hint: pick('.v360__hint'),
    fail: pick('.v360__fail'),
    obra: pick('.v360__obra'),
    where: pick('.v360__where'),
    now: pick('.v360__now'),
    strip: pick('.v360__strip'),
    wait: pick('.v360__wait'),
  };
  document.body.append(root);

  // -------------------------------------------------------------------- three

  let renderer: WebGLRenderer | null = null;
  try {
    renderer = new WebGLRenderer({ canvas: ui.canvas, antialias: false, alpha: false });
  } catch (error) {
    console.warn('[visogram] tour viewer unavailable', error);
  }

  const three = new ThreeScene();
  const camera = new PerspectiveCamera(76, 1, 0.1, 100);
  camera.rotation.order = 'YXZ';

  // Mirrored, so the room reads the right way round from the inside with
  // ordinary front-face rendering. See src/projection.ts for the rest.
  const geometry = new SphereGeometry(10, 64, 40);
  geometry.scale(-1, 1, 1);

  const layers: Layer[] = [0, 1].map((i) => {
    const material = new MeshBasicMaterial({
      transparent: true,
      opacity: i === 0 ? 1 : 0,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new Mesh(geometry, material);
    // The camera carries the heading here, so the sphere never turns.
    mesh.rotation.y = YAW_ORIGIN;
    mesh.frustumCulled = false;
    mesh.renderOrder = i;
    three.add(mesh);
    return { mesh, material, scene: null };
  });

  const loader = new TextureLoader();
  const cache = new Map<string, Texture>();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = Boolean(
    (navigator as { connection?: { saveData?: boolean } }).connection?.saveData,
  );

  async function textureFor(url: string) {
    const hit = cache.get(url);
    if (hit) return hit;
    const texture = await loader.loadAsync(url);
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    if (renderer) {
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    cache.set(url, texture);
    return texture;
  }

  // -------------------------------------------------------------------- state

  let tour: TourScenes | null = null;
  let current: Scene | null = null;
  let front = 0;
  /** Progress through the current cross-fade, or null when settled. */
  let fading: number | null = null;
  let open = false;

  /** Heading, in the viewer's own convention. */
  let yaw = 0;
  let pitch = 0;
  let fov = 76;
  /** Inertia, radians per second. */
  let velYaw = 0;
  let velPitch = 0;

  let markers: Marker[] = [];
  let buttons = new Map<string, HTMLButtonElement>();
  let frame = 0;
  let last = 0;
  let restoreFocus: HTMLElement | null = null;
  /** How many panoramas are in flight; the bar shows while any are. */
  let waiting = 0;
  const closers: (() => void)[] = [];

  const dir = new Vector3();

  // ------------------------------------------------------------------ drawing

  function resize() {
    if (!renderer) return;
    const w = ui.stage.clientWidth;
    const h = ui.stage.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }

  function placeMarkers() {
    if (!markers.length) return;
    const w = ui.stage.clientWidth;
    const h = ui.stage.clientHeight;
    for (const marker of markers) {
      dir.copy(marker.dir).project(camera);
      // Anything behind the camera projects past the far edge of the cube.
      const behind = dir.z > 1;
      marker.el.hidden = behind;
      if (behind) continue;
      const x = (dir.x * 0.5 + 0.5) * w;
      const y = (-dir.y * 0.5 + 0.5) * h;
      marker.el.style.transform =
        `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  }

  /** Push the current heading onto the camera and draw one frame. */
  function paint() {
    if (!renderer) return;
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    placeMarkers();
    renderer.render(three, camera);
  }

  function invalidate() {
    if (frame || !open) return;
    if (document.hidden) {
      // Some contexts report hidden and still show the page — an embedded
      // preview pane, a tab being captured. They get no animation frames at
      // all, so a loop is not an option: land any fade and draw once, which is
      // the honest result when nothing can be animated.
      settleFade();
      paint();
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    frame = 0;
    if (!renderer) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;

    let moving = false;

    if (velYaw || velPitch) {
      yaw += velYaw * dt;
      pitch = clamp(pitch + velPitch * dt, -PITCH_LIMIT, PITCH_LIMIT);
      const decay = Math.exp(-DAMPING * dt);
      velYaw *= decay;
      velPitch *= decay;
      if (Math.abs(velYaw) < 0.002 && Math.abs(velPitch) < 0.002) {
        velYaw = 0;
        velPitch = 0;
      } else {
        moving = true;
      }
    }

    if (fading !== null) {
      fading += dt / (reduce.matches ? FADE * 0.4 : FADE);
      const t = ease(fading);
      const incoming = layers[front === 0 ? 1 : 0];
      const outgoing = layers[front];
      if (incoming) incoming.material.opacity = t;
      if (outgoing) outgoing.material.opacity = 1 - t;
      if (fading >= 1) {
        if (outgoing) {
          outgoing.material.opacity = 0;
          outgoing.scene = null;
          outgoing.material.map = null;
          outgoing.material.needsUpdate = true;
        }
        front = front === 0 ? 1 : 0;
        fading = null;
      } else {
        moving = true;
      }
    }

    paint();
    // Nothing on this screen moves on its own: a settled view draws once and
    // then stops, which is the difference between a viewer and a screensaver.
    if (moving) invalidate();
    else last = 0;
  }

  // ------------------------------------------------------------------- scenes

  function showWait(on: boolean) {
    waiting = Math.max(0, waiting + (on ? 1 : -1));
    ui.wait.hidden = waiting === 0;
  }

  function settleFade() {
    if (fading === null) return;
    const incoming = layers[front === 0 ? 1 : 0];
    const outgoing = layers[front];
    if (incoming) incoming.material.opacity = 1;
    if (outgoing) {
      outgoing.material.opacity = 0;
      outgoing.scene = null;
    }
    front = front === 0 ? 1 : 0;
    fading = null;
  }

  /**
   * @param keepView true when the visitor walked through a doorway — they keep
   *   facing the way they were. A jump from the strip lands on the framing the
   *   scene was composed at instead.
   */
  function go(scene: Scene, keepView: boolean, immediate = false) {
    if (!tour || current === scene) return;
    const first = current === null;
    current = scene;
    settleFade();

    const incoming = layers[front === 0 ? 1 : 0];
    const outgoing = layers[front];
    if (!incoming || !outgoing) return;

    incoming.scene = scene;
    incoming.material.map = null;

    if (!keepView) {
      yaw = scene.vista.yaw;
      pitch = clamp(scene.vista.pitch, -PITCH_LIMIT, PITCH_LIMIT);
      fov = clamp(scene.vista.fov, FOV_MIN, FOV_MAX);
    }
    velYaw = 0;
    velPitch = 0;

    // The inline placeholder gives the new room a shape at once; 200-odd bytes
    // of blur beats a black frame while half a megabyte is in flight.
    void textureFor(scene.lqip)
      .then((texture) => {
        if (incoming.scene === scene && !incoming.material.map) {
          incoming.material.map = texture;
          incoming.material.needsUpdate = true;
          invalidate();
        }
      })
      .catch(() => {});

    const small = window.innerWidth < 900 || saveData;
    showWait(true);
    void textureFor(small ? scene.srcSmall : scene.src)
      .then((texture) => {
        if (incoming.scene !== scene) return;
        incoming.material.map = texture;
        incoming.material.needsUpdate = true;
        invalidate();
      })
      .catch((error) => {
        if (incoming.scene === scene) fail('Não foi possível carregar este ambiente.');
        console.warn('[visogram] scene failed to load', error);
      })
      .finally(() => showWait(false));

    if (immediate || first) {
      incoming.material.opacity = 1;
      outgoing.material.opacity = 0;
      outgoing.scene = null;
      outgoing.material.map = null;
      front = front === 0 ? 1 : 0;
      fading = null;
    } else {
      incoming.material.opacity = 0;
      fading = 0;
    }

    drawMarkers(scene);
    const at = tour.cenas.indexOf(scene) + 1;
    ui.now.textContent = `${scene.nome} — ${at}/${tour.cenas.length}`;
    for (const [id, button] of buttons) {
      button.setAttribute('aria-current', String(id === scene.id));
    }
    buttons.get(scene.id)?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: reduce.matches ? 'auto' : 'smooth',
    });
    invalidate();
  }

  function drawMarkers(scene: Scene) {
    ui.spots.replaceChildren();
    markers = [];
    if (!tour) return;
    for (const spot of scene.hotspots) {
      const destination = tour.cenas.find((c) => c.id === spot.destino);
      if (!destination) continue;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'v360__spot';
      el.innerHTML = `${ICON.spot}<span>${destination.nome}</span>`;
      el.setAttribute('aria-label', `Ir para ${destination.nome}`);
      el.addEventListener('click', () => go(destination, true));
      ui.spots.append(el);
      markers.push({
        el,
        // The world direction the viewer's (yaw, pitch) points at: the camera's
        // own forward when it is turned to that heading. Radius 9, so the
        // marker sits just inside the sphere.
        dir: new Vector3(
          -Math.sin(spot.yaw) * Math.cos(spot.pitch),
          Math.sin(spot.pitch),
          -Math.cos(spot.yaw) * Math.cos(spot.pitch),
        ).multiplyScalar(9),
      });
    }
    // Placed before the first paint, or they all flash at the top-left corner.
    placeMarkers();
  }

  function drawStrip(next: TourScenes) {
    ui.strip.replaceChildren();
    buttons = new Map();
    // One room is not a set of choices to move between.
    ui.strip.hidden = next.cenas.length < 2;
    for (const scene of next.cenas) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'v360__scene';
      const img = document.createElement('img');
      img.src = scene.thumb;
      img.width = 320;
      img.height = 200;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      const label = document.createElement('span');
      label.textContent = scene.nome;
      button.append(img, label);
      button.addEventListener('click', () => go(scene, false));
      ui.strip.append(button);
      buttons.set(scene.id, button);
    }
  }

  function fail(message: string) {
    ui.fail.textContent = message;
    ui.fail.hidden = false;
  }

  // ------------------------------------------------------------------ steering

  let dragging = false;
  let pointer = -1;
  let lastX = 0;
  let lastY = 0;
  let travelled = 0;
  /** Live pinch distance, or 0 when a second finger is not down. */
  let pinch = 0;
  const touches = new Map<number, { x: number; y: number }>();

  /** Radians per pixel, so a drag moves the room by the distance it travels. */
  const perPixel = () => rad(fov) / Math.max(1, ui.stage.clientHeight);

  function onPointerDown(event: PointerEvent) {
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      if (a && b) pinch = Math.hypot(a.x - b.x, a.y - b.y);
      dragging = false;
      return;
    }
    if (dragging) return;
    dragging = true;
    pointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    travelled = 0;
    velYaw = 0;
    velPitch = 0;
    // No pointer capture here, deliberately. Capturing retargets the pointer's
    // compatibility click to the capturing element, so taking it on every press
    // meant every click inside the stage was delivered to the stage — a tap on
    // a hotspot never reached the button and the tour would not navigate.
    // onPointerMove takes the capture the moment the gesture becomes a drag.
    ui.root.dataset.grabbing = '';
    ui.hint.hidden = true;
  }

  function onPointerMove(event: PointerEvent) {
    const held = touches.get(event.pointerId);
    if (held) {
      held.x = event.clientX;
      held.y = event.clientY;
    }

    if (touches.size === 2 && pinch) {
      const [a, b] = [...touches.values()];
      if (!a || !b) return;
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      if (spread > 0) {
        fov = clamp(fov * (pinch / spread), FOV_MIN, FOV_MAX);
        pinch = spread;
        invalidate();
      }
      return;
    }

    if (!dragging || event.pointerId !== pointer) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    travelled += Math.abs(dx) + Math.abs(dy);

    // Past the slop this is a drag, not a tap, so take the capture now: the
    // room keeps following a pointer that leaves the stage, and the click the
    // gesture ends with is delivered here rather than to whichever hotspot it
    // happened to finish over.
    if (travelled > DRAG_SLOP && !ui.stage.hasPointerCapture(event.pointerId)) {
      ui.stage.setPointerCapture(event.pointerId);
    }

    const k = perPixel();
    // Drag right and the room follows the finger, which means turning left.
    yaw += dx * k;
    pitch = clamp(pitch + dy * k, -PITCH_LIMIT, PITCH_LIMIT);
    // Carried into inertia on release. A move event is about a frame apart, so
    // this is a velocity in all but name.
    velYaw = dx * k * 60;
    velPitch = dy * k * 60;
    invalidate();
  }

  function onPointerUp(event: PointerEvent) {
    touches.delete(event.pointerId);
    if (touches.size < 2) pinch = 0;
    if (event.pointerId !== pointer) return;
    dragging = false;
    pointer = -1;
    delete ui.root.dataset.grabbing;
    if (ui.stage.hasPointerCapture(event.pointerId)) {
      ui.stage.releasePointerCapture(event.pointerId);
    }
    // A tap is not a throw, and reduced motion asks for no coasting at all.
    if (travelled < DRAG_SLOP || reduce.matches) {
      velYaw = 0;
      velPitch = 0;
    }
    invalidate();
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    // deltaMode 1 counts lines rather than pixels.
    const step = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    fov = clamp(fov * Math.exp(step * 0.0012), FOV_MIN, FOV_MAX);
    ui.hint.hidden = true;
    invalidate();
  }

  function zoom(by: number) {
    fov = clamp(fov * by, FOV_MIN, FOV_MAX);
    invalidate();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      trapTab(event);
      return;
    }
    // Steering answers to the stage only; the strip and the top bar keep their
    // own keyboard behaviour.
    if (event.target !== ui.canvas) return;
    const steps: Record<string, () => void> = {
      ArrowLeft: () => (yaw -= KEY_STEP),
      ArrowRight: () => (yaw += KEY_STEP),
      ArrowUp: () => (pitch = clamp(pitch + KEY_STEP, -PITCH_LIMIT, PITCH_LIMIT)),
      ArrowDown: () => (pitch = clamp(pitch - KEY_STEP, -PITCH_LIMIT, PITCH_LIMIT)),
      '+': () => zoom(1 / ZOOM_STEP),
      '=': () => zoom(1 / ZOOM_STEP),
      '-': () => zoom(ZOOM_STEP),
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    step();
    ui.hint.hidden = true;
    invalidate();
  }

  /** Keeps Tab inside the dialog while it is open. */
  function trapTab(event: KeyboardEvent) {
    const stops = [...root.querySelectorAll<HTMLElement>('button, canvas[tabindex]')].filter(
      (el) => el === ui.canvas || el.offsetParent !== null,
    );
    const first = stops[0];
    const final = stops[stops.length - 1];
    if (!first || !final) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      final.focus();
    } else if (!event.shiftKey && document.activeElement === final) {
      event.preventDefault();
      first.focus();
    }
  }

  ui.stage.addEventListener('pointerdown', onPointerDown);
  ui.stage.addEventListener('pointermove', onPointerMove);
  // On the window rather than the stage: until the drag passes the slop there
  // is no capture holding the pointer here, so a press that ends over the scene
  // strip or the top bar would otherwise never be told the gesture was over.
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  ui.stage.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const act = target?.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'close') close();
    else if (act === 'in') zoom(1 / ZOOM_STEP);
    else if (act === 'out') zoom(ZOOM_STEP);
  });

  const observer = new ResizeObserver(resize);
  const onPopState = () => {
    if (open) close(true);
  };
  const onVisibility = () => {
    if (!open) return;
    if (document.hidden) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    } else {
      invalidate();
    }
  };

  /** The page behind the overlay must not answer to anything while it is up. */
  function sealPage(sealed: boolean) {
    for (const el of document.querySelectorAll<HTMLElement>('.page, .body-wrap')) {
      el.inert = sealed;
      if (sealed) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    }
  }

  // --------------------------------------------------------------- open/close

  function show(next: TourScenes, sceneId?: string) {
    const wasOpen = open;

    if (tour?.slug !== next.slug) {
      // Thirteen megabytes of panorama across the four tours. Holding one
      // tour's worth is reasonable; holding every tour someone browsed is not.
      for (const [url, texture] of cache) {
        if (url.startsWith('data:')) continue;
        texture.dispose();
        cache.delete(url);
      }
      tour = next;
      current = null;
      fading = null;
      for (const layer of layers) {
        layer.scene = null;
        layer.material.map = null;
        layer.material.needsUpdate = true;
      }
      ui.obra.textContent = next.obra;
      ui.where.textContent = place(next);
      root.setAttribute('aria-label', `Tour 360º — ${next.obra}`);
      drawStrip(next);
    }

    const scene = next.cenas.find((c) => c.id === (sceneId ?? next.capa)) ?? next.cenas[0];
    if (!scene) return;

    if (!wasOpen) {
      restoreFocus = document.activeElement as HTMLElement | null;
      root.hidden = false;
      open = true;
      ui.hint.hidden = false;
      ui.fail.hidden = true;
      document.documentElement.dataset.tourOpen = '';
      sealPage(true);
      observer.observe(ui.stage);
      window.addEventListener('popstate', onPopState);
      document.addEventListener('visibilitychange', onVisibility);
      // So the phone's back gesture leaves the tour rather than the page.
      history.pushState({ visogramTour: next.slug }, '');
      resize();
      ui.canvas.focus({ preventScroll: true });
    }

    if (current === scene) {
      // Reopened on the room it was closed in. The textures are still here, so
      // there is nothing to transition — but the framing is reset anyway, so
      // that entering from a card always lands on what the card shows.
      yaw = scene.vista.yaw;
      pitch = clamp(scene.vista.pitch, -PITCH_LIMIT, PITCH_LIMIT);
      fov = clamp(scene.vista.fov, FOV_MIN, FOV_MAX);
      velYaw = 0;
      velPitch = 0;
      invalidate();
    } else {
      go(scene, false, true);
    }
    if (!renderer) fail('Este navegador não conseguiu abrir o tour 360º.');
  }

  function close(fromHistory = false) {
    if (!open) return;
    open = false;
    root.hidden = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    velYaw = 0;
    velPitch = 0;
    delete document.documentElement.dataset.tourOpen;
    sealPage(false);
    observer.disconnect();
    window.removeEventListener('popstate', onPopState);
    document.removeEventListener('visibilitychange', onVisibility);
    // Only unwind the entry this overlay pushed, and only if it is still on top.
    if (!fromHistory && (history.state as { visogramTour?: string } | null)?.visogramTour) {
      history.back();
    }
    restoreFocus?.focus?.({ preventScroll: true });
    restoreFocus = null;
    for (const listener of closers) listener();
  }

  return {
    show,
    close,
    onClose(listener: () => void) {
      closers.push(listener);
    },
  };
}

type Viewer = ReturnType<typeof build>;
let viewer: Viewer | null = null;
/** Listeners registered before the stage exists — the hero pauses on open. */
const pending: (() => void)[] = [];

/**
 * Open a tour. `sceneId` picks a room; without it the tour opens on the frame
 * the gallery card and the hero show.
 */
export function openTour(slug: string, sceneId?: string): boolean {
  const tour = findTour(slug);
  if (!tour) {
    console.warn(`[visogram] no scenes for "${slug}"`);
    return false;
  }
  if (!viewer) {
    viewer = build();
    for (const listener of pending) viewer.onClose(listener);
    pending.length = 0;
  }
  viewer.show(tour, sceneId);
  return true;
}

/** Called when the overlay closes, so the page behind it can pick back up. */
export function onTourClose(listener: () => void) {
  if (viewer) viewer.onClose(listener);
  else pending.push(listener);
}
