<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type {
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { HERO_GIFTS } from "@/lib/heroGifts";

/*
  The hero card's 3D surface. It covers the whole panel, not just the bow,
  because sealed and opened states share one scene: the satin ribbon that ties
  the card, and the objects that sit on it once it opens.

  Three.js is loaded lazily, only when the card scrolls into view, so the
  landing page's first paint stays untouched.
*/

type ThreeModule = typeof import("three");
type Pt = [number, number];
type Cubic = [Pt, Pt, Pt, Pt];

/** How tied each part of the bow is, 0 = gone, 1 = fully knotted. */
type Pieces = {
  loopLeft: number;
  loopRight: number;
  tailLeft: number;
  tailRight: number;
  knot: number;
};

type Phase = "tying" | "tied" | "untying" | "open" | "retie";

const props = withDefaults(defineProps<{ open?: boolean }>(), { open: false });
const emit = defineEmits<{ painted: []; reveal: [] }>();

/** Below this width the SVG bow and the text list stay in charge. */
const MIN_VIEWPORT = 640;
/** Sketch geometry, in the 72 x 40 viewBox the paths were drawn in. */
const SVG_UNIT = 0.035;
const TUBE_SEGMENTS = 180;
const RIBBON_RADIUS = 0.062;
/** Where the dipped glaze stops on the vase. One constant: raise it for a low
    glaze line, lower it for a two-tone piece. */
const GLAZE_FROM_Y = 1.1;
/** Let the ink bow dissolve before the satin one starts, so they never overlap. */
const LEAD_MS = 520;
const TIE_MS = 2200;
/** A button press has to answer fast; only the first tie gets to be languid. */
const UNTIE_MS = 900;
const RETIE_MS = 900;
/** The idle sway fades out after this long, so nothing animates forever. */
const BREATH_MS = 6000;

/** Keeps the bow exactly where the ink version sat, measured from the panel
    centre: the SVG box centre is 38 px above it at 47.7 px per world unit. */
const RIBBON_Y = 0.8;
/** Where the objects rest on the card, in world units from the panel centre. */
const OBJECT_BASE_Y = -1.15;

const host = ref<HTMLDivElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);

let setSceneOpen: ((open: boolean) => void) | null = null;
let teardown = () => {};

watch(
  () => props.open,
  (open) => {
    if (setSceneOpen) setSceneOpen(open);
    // No canvas here (small screen, reduced motion, no WebGL): the ink bow
    // fades and the card opens straight away.
    else if (open) emit("reveal");
  },
);

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

      // Rounded boxes make the folded linen read as cloth rather than card.
      // They are a nicety: if the addon fails, sharp boxes still ship.
      let RoundedBox: RoundedBoxCtor | null = null;
      try {
        const addon = await import(
          "three/addons/geometries/RoundedBoxGeometry.js"
        );
        RoundedBox = addon.RoundedBoxGeometry;
      } catch {
        RoundedBox = null;
      }
      if (disposed) return;

      const scene = buildScene(THREE, RoundedBox, canvas, holder, {
        startOpen: props.open,
        onPainted: () => emit("painted"),
        onReveal: () => emit("reveal"),
      });
      if (!scene) return;
      setSceneOpen = scene.setOpen;
      disposeScene = scene.dispose;
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
    setSceneOpen = null;
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

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (value: number) => 1 - (1 - value) ** 3;
const step = (progress: number, from: number, to: number) =>
  easeOut(clamp01((progress - from) / (to - from)));

/** Tying order: loops first, the knot cinches, then the tails pull free. */
const tiePieces = (progress: number): Pieces => ({
  loopLeft: step(progress, 0, 0.52),
  loopRight: step(progress, 0.06, 0.58),
  tailLeft: step(progress, 0.58, 1),
  tailRight: step(progress, 0.58, 1),
  knot: step(progress, 0.5, 0.66),
});

const restPieces = (tied: boolean): Pieces => ({
  loopLeft: tied ? 1 : 0,
  loopRight: tied ? 1 : 0,
  tailLeft: tied ? 1 : 0,
  tailRight: tied ? 1 : 0,
  knot: tied ? 1 : 0,
});

const allPieces = (pieces: Pieces) => [
  pieces.loopLeft,
  pieces.loopRight,
  pieces.tailLeft,
  pieces.tailRight,
  pieces.knot,
];

/* A bud vase, turned from a profile rather than modelled: radius down the
   left, height up. The last points curl inward so the rim has thickness and
   the mouth reads as an opening instead of a cut-off tube. */
const VASE_PROFILE: readonly Pt[] = [
  [0.3, 0],
  [0.34, 0.04],
  [0.4, 0.1],
  [0.47, 0.22],
  [0.51, 0.4],
  [0.53, 0.62],
  [0.52, 0.84],
  [0.49, 1.06],
  [0.44, 1.24],
  [0.37, 1.4],
  [0.3, 1.54],
  [0.26, 1.66],
  [0.26, 1.78],
  [0.29, 1.86],
  [0.32, 1.9],
  [0.27, 1.88],
  [0.24, 1.8],
  [0.22, 1.72],
  [0.1, 1.7],
  [0.02, 1.7],
];

type BuildOptions = {
  startOpen: boolean;
  onPainted: () => void;
  onReveal: () => void;
};

/** RoundedBoxGeometry's shape, without importing its types. */
type RoundedBoxCtor = new (
  width: number,
  height: number,
  depth: number,
  segments: number,
  radius: number,
) => import("three").BufferGeometry;

function buildScene(
  THREE: ThreeModule,
  RoundedBox: RoundedBoxCtor | null,
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  options: BuildOptions,
): { dispose: () => void; setOpen: (open: boolean) => void } | null {
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
    return null;
  }
  renderer.setClearAlpha(0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  // The canvas now spans the whole panel, so the camera sits further back to
  // keep the exact 47.7 px/world-unit the bow was framed at.
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  camera.position.set(0, 0, 10);

  scene.add(new THREE.AmbientLight(0xffe9f1, 0.62));

  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(-2.4, 3.6, 4.5);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xf3b8cf, 0.8);
  rim.position.set(3, -2, 1.5);
  scene.add(rim);

  const sheen = new THREE.PointLight(0xffffff, 4, 0, 2);
  sheen.position.set(0.6, 0.6, 2.4);
  scene.add(sheen);

  const ribbonMaterial = new THREE.MeshPhysicalMaterial({
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
  ribbon.position.y = RIBBON_Y;
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
    const mesh = new THREE.Mesh(geometry, ribbonMaterial);
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
  const knot = new THREE.Mesh(knotGeometry, ribbonMaterial);
  knot.scale.setScalar(0.001);
  ribbon.add(knot);

  /* One gloss, one matte: the satin is the only shiny thing on this card, so
     everything standing on the paper stays dull. Every object material is
     registered here and faded in together when the card opens. */
  const objectMaterials: MeshStandardMaterial[] = [];
  const matte = (color: number, roughness: number) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      transparent: true,
      opacity: 0,
    });
    objectMaterials.push(material);
    return material;
  };

  const objects = new THREE.Group();
  objects.position.set(0, OBJECT_BASE_Y, 0);
  scene.add(objects);

  /* --- vase ------------------------------------------------------------- */
  const vase = new THREE.Mesh(
    new THREE.LatheGeometry(
      VASE_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
      64,
    ),
    matte(0xb9cbaa, 0.74),
  );
  vase.frustumCulled = false;
  // Lean the vessel toward the camera: with the eye at the panel's centre line,
  // only a lean opens the mouth into a visible ellipse.
  vase.rotation.x = 0.2;

  const glazeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x93a882,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.5,
    transparent: true,
    opacity: 0,
  });
  objectMaterials.push(glazeMaterial);
  const glaze = new THREE.Mesh(
    new THREE.LatheGeometry(
      VASE_PROFILE.filter(([, y]) => y >= GLAZE_FROM_Y).map(
        // Sits a hair proud of the body so the two surfaces never fight.
        ([r, y]) => new THREE.Vector2(r + 0.007, y),
      ),
      64,
    ),
    glazeMaterial,
  );
  glaze.frustumCulled = false;
  glaze.renderOrder = 1;
  vase.add(glaze);

  const vaseGroup = new THREE.Group();
  vaseGroup.add(vase);
  objects.add(vaseGroup);

  /* --- folded linen ------------------------------------------------------ */
  /* Three wide, flat folds with offset edges: a stack of cloth, not a box with
     a lid. Chunky proportions are what made the earlier version read as a
     wrapped present. */
  const throwGroup = new THREE.Group();
  const box = (width: number, height: number, depth: number) =>
    RoundedBox
      ? new RoundedBox(width, height, depth, 4, 0.06)
      : new THREE.BoxGeometry(width, height, depth);

  const FOLDS: Array<{
    width: number;
    height: number;
    depth: number;
    y: number;
    x: number;
    spin: number;
    tone: number;
  }> = [
    { width: 1.35, height: 0.52, depth: 0.62, y: 0.26, x: 0, spin: 0, tone: 0xe4d6c8 },
    { width: 1.3, height: 0.5, depth: 0.58, y: 0.77, x: 0.03, spin: -0.05, tone: 0xefe4d9 },
    { width: 1.22, height: 0.46, depth: 0.54, y: 1.24, x: -0.04, spin: 0.08, tone: 0xf5ebe2 },
  ];
  for (const fold of FOLDS) {
    const cloth = new THREE.Mesh(
      box(fold.width, fold.height, fold.depth),
      matte(fold.tone, 0.92),
    );
    cloth.position.set(fold.x, fold.y, 0);
    cloth.rotation.y = fold.spin;
    throwGroup.add(cloth);
  }
  objects.add(throwGroup);

  /* --- coffee grinder ---------------------------------------------------- */
  /* A hopper that flares upward and a crank on top. The old side handle made
     this read as a vacuum flask no matter what else was right. */
  const grinderGroup = new THREE.Group();
  const stone = matte(0xcbb7a4, 0.62);
  const hopperStone = matte(0xd6c4b2, 0.66);
  const timber = matte(0xa88f7c, 0.55);

  const grinderBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.46, 0.95, 40),
    stone,
  );
  grinderBody.position.y = 0.475;

  const grinderHopper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.47, 0.33, 0.36, 40),
    hopperStone,
  );
  grinderHopper.position.y = 1.13;

  const grinderRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.49, 0.49, 0.06, 40),
    timber,
  );
  grinderRim.position.y = 1.33;

  const crankPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.12, 16),
    timber,
  );
  crankPost.position.set(0.15, 1.42, 0);

  const crankArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.3, 14),
    timber,
  );
  crankArm.rotation.z = Math.PI / 2;
  crankArm.position.set(0.3, 1.48, 0);

  const crankKnob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.1, 14),
    timber,
  );
  crankKnob.position.set(0.45, 1.48, 0);

  grinderGroup.add(
    grinderBody,
    grinderHopper,
    grinderRim,
    crankPost,
    crankArm,
    crankKnob,
  );
  objects.add(grinderGroup);

  /* --- satin tags on the claimed gifts ----------------------------------- */
  /* The ribbon does not leave the story: what untied the card comes back as
     the mark on whatever somebody has already promised to buy. A bare loop
     reads as an elastic band, so the band carries a knot, two loose ends and a
     paper tag — the closure is what makes it read as tied. */
  const tagMaterial = ribbonMaterial.clone();
  tagMaterial.transparent = true;
  tagMaterial.opacity = 0;
  tagMaterial.depthWrite = false;
  tagMaterial.side = THREE.DoubleSide;

  const cardMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffbf8,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    opacity: 0,
  });
  const cardEdgeMaterial = new THREE.MeshStandardMaterial({
    color: 0xe6a8bd,
    roughness: 0.8,
    metalness: 0,
    transparent: true,
    opacity: 0,
  });

  // A wall, not a cord: the band is a short open cylinder, which is exactly
  // the shape a ribbon takes around a body.
  const bandGeometry = new THREE.CylinderGeometry(1, 1, 0.07, 48, 1, true);
  const tieKnotGeometry = new THREE.SphereGeometry(0.055, 16, 12);
  const cardGeometry = new THREE.BoxGeometry(0.3, 0.4, 0.02);
  const cardEdgeGeometry = new THREE.BoxGeometry(0.32, 0.42, 0.016);

  const tags: Group[] = [];
  const tie = <T extends Mesh>(mesh: T) => {
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    return mesh;
  };
  const rod = (from: Vector3, to: Vector3, radius: number) =>
    tie(
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.LineCurve3(from, to), 1, radius, 6, false),
        tagMaterial,
      ),
    );

  const addTag = (parent: Group, radius: number, depth: number, y: number) => {
    const group = new THREE.Group();
    group.position.y = y;

    const band = tie(new THREE.Mesh(bandGeometry, tagMaterial));
    band.scale.set(radius, 1, depth);
    group.add(band);

    // Everything below sits on the band's nearest point, facing the camera.
    const dressing = new THREE.Group();
    dressing.position.z = depth;
    group.add(dressing);

    const knot = tie(new THREE.Mesh(tieKnotGeometry, tagMaterial));
    knot.scale.set(1.25, 0.9, 0.8);
    dressing.add(knot);

    const tails: Array<[Vector3, Vector3]> = [
      [new THREE.Vector3(-0.1, -0.15, 0.02), new THREE.Vector3(-0.21, -0.26, 0.03)],
      [new THREE.Vector3(0.05, -0.17, 0.02), new THREE.Vector3(0.03, -0.31, 0.03)],
    ];
    for (const [bend, end] of tails) {
      const tail = tie(
        new THREE.Mesh(
          new THREE.TubeGeometry(
            new THREE.QuadraticBezierCurve3(
              new THREE.Vector3(0, 0, 0),
              bend,
              end,
            ),
            12,
            0.024,
            6,
            false,
          ),
          tagMaterial,
        ),
      );
      dressing.add(tail);
    }

    dressing.add(
      rod(
        new THREE.Vector3(0.01, -0.03, 0.01),
        new THREE.Vector3(0.29, -0.14, 0.01),
        0.009,
      ),
    );

    const edge = tie(new THREE.Mesh(cardEdgeGeometry, cardEdgeMaterial));
    edge.position.set(0.26, -0.32, 0.006);
    edge.rotation.z = -0.22;
    const face = tie(new THREE.Mesh(cardGeometry, cardMaterial));
    face.position.set(0.26, -0.32, 0.018);
    face.rotation.z = -0.22;
    dressing.add(edge, face);

    parent.add(group);
    tags.push(group);
  };

  const claimed = new Set(
    HERO_GIFTS.filter((gift) => gift.claimed).map((gift) => gift.id),
  );
  if (claimed.has("throw")) addTag(throwGroup, 0.72, 0.34, 0.55);
  if (claimed.has("grinder")) addTag(grinderGroup, 0.45, 0.45, 0.7);

  /* A painted contact shadow, not a shadow map: the card has no ground plane
     in 3D, so each ellipse sits behind its object on the paper's own plane.
     Wider than the footprint and a touch below it, so a soft skirt shows. */
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext("2d");
  let shadowTexture: InstanceType<ThreeModule["CanvasTexture"]> | null = null;
  if (shadowContext) {
    const gradient = shadowContext.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(116, 74, 89, 0.58)");
    gradient.addColorStop(0.35, "rgba(116, 74, 89, 0.2)");
    gradient.addColorStop(1, "rgba(116, 74, 89, 0)");
    shadowContext.fillStyle = gradient;
    shadowContext.fillRect(0, 0, 128, 128);
    shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    shadowTexture.colorSpace = THREE.SRGBColorSpace;
  }
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const addShadow = (parent: Group, width: number, height: number) => {
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      shadowMaterial,
    );
    shadow.position.set(0, -0.04, -0.25);
    parent.add(shadow);
  };
  addShadow(vaseGroup, 0.9, 0.26);
  addShadow(throwGroup, 1.7, 0.36);
  addShadow(grinderGroup, 1.1, 0.28);

  const draw = (target: { mesh: Mesh; total: number }, amount: number) => {
    const count = Math.floor((target.total * amount) / 3) * 3;
    target.mesh.geometry.setDrawRange(0, count);
  };

  let phase: Phase = "tying";
  let intent = false;
  let phaseStart = performance.now() + LEAD_MS;
  let swayStart = Number.MAX_SAFE_INTEGER;
  let current = restPieces(false);
  let untieFrom = restPieces(true);
  let untieProgress = 0;
  let objectValue = 0;
  let announced = false;
  let frameHandle = 0;
  let running = false;
  let firstFrame = true;

  const announceReveal = () => {
    if (announced) return;
    announced = true;
    options.onReveal();
  };

  const applyPieces = (pieces: Pieces) => {
    draw(loopLeft, pieces.loopLeft);
    draw(loopRight, pieces.loopRight);
    draw(tailLeft, pieces.tailLeft);
    draw(tailRight, pieces.tailRight);
    knot.scale.setScalar(0.001 + pieces.knot * 0.999);
  };

  const applyObjects = () => {
    for (const material of objectMaterials) {
      material.opacity = objectValue;
    }
    // Tags arrive last, once the objects have landed.
    const tagValue = clamp01((objectValue - 0.82) / 0.18);
    tagMaterial.opacity = tagValue;
    cardMaterial.opacity = tagValue;
    cardEdgeMaterial.opacity = tagValue;
    for (const tag of tags) {
      tag.scale.setScalar(0.86 + 0.14 * tagValue);
    }
    shadowMaterial.opacity = 0.34 * objectValue;
    objects.position.y = OBJECT_BASE_Y - (1 - objectValue) * 0.38;
    objects.scale.setScalar(0.94 + 0.06 * objectValue);
  };

  const resize = () => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    positionObjects(width, height);
  };

  /* Column centres are fixed in CSS pixels, but world x maps to a fixed pixel
     offset because the vertical FOV and the panel height never change. So the
     objects have to be placed from the panel's width, or they drift out of
     line with their captions at every viewport except one. */
  const SLOT_PADDING = 24; // must match the px-6 on the caption row
  const slots = [vaseGroup, throwGroup, grinderGroup];

  const positionObjects = (width: number, height: number) => {
    const visibleHeight =
      2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const pxPerUnit = height / visibleHeight;
    const usable = Math.max(width - SLOT_PADDING * 2, 1);
    slots.forEach((slot, index) => {
      const centre = SLOT_PADDING + (usable * (index + 0.5)) / slots.length;
      slot.position.x = (centre - width / 2) / pxPerUnit;
    });
  };

  const sheenTarget = new THREE.Vector3(0.6, 0.6, 2.4);

  const paint = (now: number) => {
    if (phase === "tying" || phase === "retie") {
      const duration = phase === "tying" ? TIE_MS : RETIE_MS;
      const progress = clamp01((now - phaseStart) / duration);
      current = tiePieces(progress);
      if (progress >= 1) {
        current = restPieces(true);
        phase = "tied";
        swayStart = now;
      }
    } else if (phase === "untying") {
      untieProgress = clamp01((now - phaseStart) / UNTIE_MS);
      // Pull from wherever the bow currently is, so pressing the button
      // mid-tie reverses the ribbon instead of snapping it.
      current = {
        loopLeft: untieFrom.loopLeft * (1 - step(untieProgress, 0.16, 0.86)),
        loopRight: untieFrom.loopRight * (1 - step(untieProgress, 0.2, 0.9)),
        tailLeft: untieFrom.tailLeft * (1 - step(untieProgress, 0, 0.35)),
        tailRight: untieFrom.tailRight * (1 - step(untieProgress, 0.04, 0.38)),
        knot: untieFrom.knot * (1 - step(untieProgress, 0.6, 1)),
      };
      if (untieProgress >= 1) {
        current = restPieces(false);
        if (intent) {
          phase = "open";
          announceReveal();
        } else {
          phase = "retie";
          phaseStart = now;
        }
      }
    } else {
      current = restPieces(phase === "tied");
    }

    applyPieces(current);

    const objectsTarget =
      phase === "open" || (phase === "untying" && untieProgress > 0.35) ? 1 : 0;
    objectValue += (objectsTarget - objectValue) * 0.14;
    if (Math.abs(objectsTarget - objectValue) < 0.002) {
      objectValue = objectsTarget;
    }
    applyObjects();

    const breath =
      now < swayStart ? 0 : clamp01(1 - (now - swayStart) / BREATH_MS);
    const sway = 0.016 * breath;
    ribbon.rotation.y = 0.09 + Math.sin(now * 0.0011) * sway;
    ribbon.rotation.x = -0.16 + Math.sin(now * 0.0009 + 1.2) * sway * 0.6;

    sheen.position.lerp(sheenTarget, 0.08);
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      options.onPainted();
    }
  };

  const frame = (now: number) => {
    paint(now);
    const animating =
      phase === "tying" || phase === "retie" || phase === "untying";
    const swaying = now >= swayStart && now - swayStart < BREATH_MS;
    const settling = sheen.position.distanceTo(sheenTarget) > 0.01;
    const objectsMoving =
      objectValue !== (phase === "open" || phase === "untying" ? 1 : 0);
    if (animating || swaying || settling || objectsMoving) {
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

  const setOpen = (open: boolean) => {
    intent = open;
    const now = performance.now();

    if (open) {
      if (phase === "open") return;
      // Every fresh untie has to announce itself; the previous cycle's flag
      // would otherwise leave the second reveal hidden.
      announced = false;
      const tied = Math.max(...allPieces(current));
      if (tied < 0.01) {
        // Nothing on the paper yet: no reason to make anyone wait.
        phase = "open";
        current = restPieces(false);
        applyPieces(current);
        announceReveal();
        return;
      }
      untieFrom = { ...current };
      untieProgress = 0;
      phase = "untying";
      phaseStart = now;
    } else {
      if (phase === "open") {
        phase = "retie";
        phaseStart = now;
      } else {
        // Tying or untying still: the loop settles on the closed state itself.
        return;
      }
    }
    requestFrame();
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

  if (options.startOpen) setOpen(true);

  return {
    setOpen,
    dispose: () => {
      cancelAnimationFrame(frameHandle);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh) node.geometry.dispose();
      });
      shadowTexture?.dispose();
      const materials = new Set<Material>([
        ribbonMaterial,
        shadowMaterial,
        tagMaterial,
        cardMaterial,
        cardEdgeMaterial,
        ...objectMaterials,
      ]);
      for (const material of materials) material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
</script>

<template>
  <div
    ref="host"
    class="pointer-events-none absolute inset-0"
    aria-hidden="true"
  >
    <canvas ref="canvasEl" class="h-full w-full transition-opacity duration-300" />
  </div>
</template>
