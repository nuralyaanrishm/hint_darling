<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Mesh, Vector3, WebGLRenderer } from "three";

/*
  The hero bow. A hand-inked SVG ribbon by default; on wide viewports it is
  replaced by a satin ribbon that ties itself once the card scrolls into view.
  Three.js is loaded lazily so the landing page's first paint stays untouched.
*/

type ThreeModule = typeof import("three");
type Pt = [number, number];
type Cubic = [Pt, Pt, Pt, Pt];

/** Below this width the SVG version stays in charge. */
const MIN_VIEWPORT = 640;
/** Sketch geometry, in the 72 x 40 viewBox the paths were drawn in. */
const SVG_UNIT = 0.035;

const host = ref<HTMLDivElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const painted = ref(false);

let teardown = () => {};

onMounted(() => {
  const holder = host.value;
  const canvas = canvasEl.value;
  if (!holder || !canvas) return;
  if (!window.matchMedia(`(min-width: ${MIN_VIEWPORT}px)`).matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let disposed = false;
  let disposeScene = () => {};

  const boot = async () => {
    try {
      const THREE = await import("three");
      if (disposed) return;
      disposeScene = buildRibbon(THREE, canvas, holder, () => {
        painted.value = true;
      });
    } catch {
      // Deferred chunk failed to load: keep the SVG bow that is already there.
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void boot();
    },
    { rootMargin: "160px" },
  );
  observer.observe(holder);

  teardown = () => {
    disposed = true;
    observer.disconnect();
    disposeScene();
  };
});

onBeforeUnmount(() => teardown());

/* The bow, verbatim from the original artwork: two loops and two tails that
   all meet at the knot at (36, 20). Each is drawn away from the knot and back,
   so growing the geometry along its length reads as ribbon being tied. */
const LOOP: readonly Cubic[] = [
  [[36, 20], [30, 11], [17, 8], [12, 14]],
  [[12, 14], [8.4, 18.4], [13.4, 25.6], [20, 24.4]],
  [[20, 24.4], [25.4, 23.4], [31, 20], [36, 20]],
];

const TAIL: readonly Cubic[] = [
  [[36, 20], [33.6, 26.6], [29.5, 32.6], [25.5, 35.6]],
];

/** Mirrors a path across the viewBox centre line. */
const mirror = (source: readonly Cubic[]): Cubic[] =>
  source.map((segment) => segment.map(([x, y]) => [72 - x, y] as Pt) as Cubic);

const TIE_MS = 2200;
/** The idle sway fades out after this long, so nothing animates forever. */
const BREATH_MS = 6000;
const TUBE_SEGMENTS = 180;
const RIBBON_RADIUS = 0.062;

function buildRibbon(
  THREE: ThreeModule,
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  onPainted: () => void,
): () => void {
  const point = ([x, y]: Pt) =>
    new THREE.Vector3((x - 36) * SVG_UNIT, (20 - y) * SVG_UNIT, 0);

  const curveOf = (segments: readonly Cubic[]) => {
    const path = new THREE.CurvePath<Vector3>();
    for (const [a, b, c, d] of segments) {
      path.add(
        new THREE.CubicBezierCurve3(point(a), point(b), point(c), point(d)),
      );
    }
    return path;
  };

  let renderer: WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    // No WebGL: the SVG bow is still on screen underneath.
    return () => {};
  }
  renderer.setClearAlpha(0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
  camera.position.set(0, 0, 8);

  scene.add(new THREE.AmbientLight(0xffe9f1, 0.6));

  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(-2.4, 3.6, 4.5);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xf3b8cf, 0.8);
  rim.position.set(3, -2, 1.5);
  scene.add(rim);

  const sheen = new THREE.PointLight(0xffffff, 4, 0, 2);
  sheen.position.set(0.6, 0.6, 2.4);
  scene.add(sheen);

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf3b8cf,
    roughness: 0.36,
    metalness: 0,
    sheen: 1,
    sheenColor: new THREE.Color(0xfff2f7),
    sheenRoughness: 0.5,
    clearcoat: 0.45,
    clearcoatRoughness: 0.4,
  });

  const ribbon = new THREE.Group();
  ribbon.rotation.set(-0.16, 0.09, 0);
  scene.add(ribbon);

  const strip = (segments: readonly Cubic[]) => {
    const geometry = new THREE.TubeGeometry(
      curveOf(segments),
      TUBE_SEGMENTS,
      RIBBON_RADIUS,
      12,
      false,
    );
    // Squash the tube along its binormal so the round cord reads as a flat
    // satin ribbon lying on the card.
    geometry.scale(1, 1, 0.42);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    ribbon.add(mesh);
    return { mesh, total: geometry.index?.count ?? 0 };
  };

  const loopLeft = strip(LOOP);
  const loopRight = strip(mirror(LOOP));
  const tailLeft = strip(TAIL);
  const tailRight = strip(mirror(TAIL));

  const knotGeometry = new THREE.SphereGeometry(0.075, 24, 16);
  knotGeometry.scale(1.5, 1, 0.55);
  const knot = new THREE.Mesh(knotGeometry, material);
  knot.scale.setScalar(0.001);
  ribbon.add(knot);

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const easeOut = (value: number) => 1 - (1 - value) ** 3;
  const step = (progress: number, from: number, to: number) =>
    easeOut(clamp01((progress - from) / (to - from)));

  const draw = (target: { mesh: Mesh; total: number }, amount: number) => {
    const count = Math.floor((target.total * amount) / 3) * 3;
    target.mesh.geometry.setDrawRange(0, count);
  };

  // Wait for the ink bow to dissolve before the ribbon starts tying, so the
  // two never sit on top of each other.
  const started = performance.now() + 520;
  const sheenTarget = new THREE.Vector3(0.6, 0.6, 2.4);
  let frameHandle = 0;
  let running = false;
  let firstFrame = true;

  const resize = () => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const paint = (now: number) => {
    const elapsed = now - started;
    const progress = clamp01(elapsed / TIE_MS);

    draw(loopLeft, step(progress, 0, 0.52));
    draw(loopRight, step(progress, 0.06, 0.58));
    draw(tailLeft, step(progress, 0.58, 1));
    draw(tailRight, step(progress, 0.58, 1));
    knot.scale.setScalar(0.001 + step(progress, 0.5, 0.66) * 0.999);

    const breath = clamp01(1 - (elapsed - TIE_MS) / BREATH_MS);
    const sway = 0.016 * breath;
    ribbon.rotation.y = 0.09 + Math.sin(now * 0.0011) * sway;
    ribbon.rotation.x = -0.16 + Math.sin(now * 0.0009 + 1.2) * sway * 0.6;

    sheen.position.lerp(sheenTarget, 0.08);
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      onPainted();
    }
  };

  const frame = (now: number) => {
    paint(now);
    const settling = sheen.position.distanceTo(sheenTarget) > 0.01;
    if (settling || now - started < TIE_MS + BREATH_MS) {
      frameHandle = requestAnimationFrame(frame);
    } else {
      running = false;
    }
  };

  const requestFrame = () => {
    if (running) return;
    running = true;
    frameHandle = requestAnimationFrame(frame);
  };

  // The highlight drifts toward the pointer, as if the card were catching the
  // nearest light. Parked back at rest when the cursor leaves the page.
  const onPointerMove = (event: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    if (rect.width === 0) return;
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    if (Math.abs(nx) > 3 || Math.abs(ny) > 3) return;
    sheenTarget.set(nx * 1.6, -ny * 1.2, 2.4);
    requestFrame();
  };

  const onPointerLeave = () => {
    sheenTarget.set(0.6, 0.6, 2.4);
    requestFrame();
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      cancelAnimationFrame(frameHandle);
      running = false;
    } else {
      requestFrame();
    }
  };

  const resizeObserver = new ResizeObserver(() => {
    resize();
    renderer.render(scene, camera);
  });
  resizeObserver.observe(host);

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", onVisibilityChange);

  resize();
  requestFrame();

  return () => {
    cancelAnimationFrame(frameHandle);
    resizeObserver.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerleave", onPointerLeave);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    for (const piece of [loopLeft, loopRight, tailLeft, tailRight]) {
      piece.mesh.geometry.dispose();
    }
    knotGeometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
</script>

<template>
  <div class="relative mx-auto h-[66px] w-[120px]">
    <svg
      width="120"
      height="66"
      viewBox="0 0 72 40"
      fill="none"
      class="h-full w-full text-soft-pink transition-opacity duration-500"
      :class="painted ? 'opacity-0' : 'opacity-100'"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M36 20c-6-9-19-12-24-6-3.6 4.4 1.4 11.6 8 10.4 5.4-1 11-4.4 16-4.4" />
        <path d="M36 20c6-9 19-12 24-6 3.6 4.4-1.4 11.6-8 10.4-5.4-1-11-4.4-16-4.4" />
        <path d="M36 20c-2.4 6.6-6.5 12.6-10.5 15.6" />
        <path d="M36 20c2.4 6.6 6.5 12.6 10.5 15.6" />
      </g>
      <circle cx="36" cy="20" r="3.2" fill="currentColor" />
    </svg>

    <div
      ref="host"
      class="pointer-events-none absolute left-1/2 top-1/2 h-[190px] w-[300px] -translate-x-1/2 -translate-y-1/2 [filter:drop-shadow(0_7px_7px_rgba(201,120,152,0.22))]"
      aria-hidden="true"
    >
      <canvas ref="canvasEl" class="h-full w-full" />
    </div>
  </div>
</template>
