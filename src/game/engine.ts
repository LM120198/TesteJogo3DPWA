/* VETOR-12 — Motor da arena (Three.js) v1.1
 * FFA 12 combatentes · um tiro elimina · rodada cronometrada · power-ups.
 * Simulação autoritativa local/hospedeiro; convidados enviam inputs e
 * recebem snapshots (ver net.ts). Mapas, dificuldades e personagens
 * humanoides animados.
 */
import * as THREE from "three";
import { AudioFX } from "./audio";

export type WeaponId = "pistol" | "scatter" | "rail";
export type PowerId = WeaponId | "shield" | "haste";
export type Phase = "idle" | "countdown" | "playing" | "ended";
export type MapId = "nucleo" | "fundicao" | "glacial";
export type NetRole = "local" | "host" | "guest";

export interface InputFrame {
  f: number;        /* frente/trás -1..1 */
  s: number;        /* direita/esquerda -1..1 */
  j: boolean;       /* pulo (nível) */
  fire: boolean;    /* disparo (nível) */
  yaw: number;
  pitch: number;
}

export interface LobbyPlayer { slot: number; name: string; host: boolean; }

export interface FSnap {
  i: number; x: number; y: number; z: number; yaw: number;
  a: 0 | 1; r: number; w: number; wt: number; sh: 0 | 1; h: number;
  k: number; d: number; s: number; st: number;
}
export interface PSnap { a: 0 | 1; ty: PowerId; t: number; }
export interface Snapshot { ph: Phase; tm: number; f: FSnap[]; p: PSnap[]; }

export interface MatchConfig {
  botCount: number;
  duration: number;
  mapId: MapId;
  difficulty: number;
  role: NetRole;
  selfSlot: number;
  players: LobbyPlayer[];
  playerName: string;
}

export interface ScoreRow {
  name: string; color: string; kills: number; deaths: number;
  score: number; streak: number; isPlayer: boolean; alive: boolean;
}

export interface FeedEntry {
  id: number; killer: string; kColor: string; victim: string; vColor: string;
  weapon: string; pKiller: boolean; pVictim: boolean;
}

export interface HudData {
  phase: Phase; time: number; duration: number;
  score: number; kills: number; deaths: number; streak: number;
  weapon: WeaponId; weaponT: number; shield: boolean; hasteT: number;
  respawn: number; lastKiller: string; rows: ScoreRow[];
  shots: number; hits: number; bestStreak: number;
}

export interface EngineCallbacks {
  onHud(h: HudData): void;
  onFeed(f: FeedEntry): void;
  onToast(msg: string, kind: "info" | "kill" | "warn" | "pickup"): void;
  onCountdown(n: number): void;
  onHit(killed: boolean): void;
  onDamaged(by: string): void;
  onEnd(rows: ScoreRow[], playerRank: number, won: boolean): void;
  onLock(locked: boolean): void;
  onPause(paused: boolean): void;
  onSnapshot?(s: Snapshot): void;
  onRemoteEvent?(slot: number, ev: { k: string; kill?: boolean; by?: string; msg?: string; kind?: string }): void;
}

export type RemoteEv = { k: "hit"; kill: boolean } | { k: "dmg"; by: string } | { k: "toast"; msg: string; kind: string };

/* ------------------------------- constantes ------------------------------ */

const ARENA = 56;
const HALF = ARENA / 2;
const WALL_H = 6;
const EYE = 1.62;
const GRAV = 22;
const JUMP = 7.8;
const BODY_R = 0.42;
const BODY_H = 1.8;
const WEAPON_TIME = 8;
const COYOTE = 0.09;
const JBUF = 0.12;

const WEAPONS: Record<WeaponId, { label: string; cd: number; color: number; pellets: number; spread: number; pierce: boolean }> = {
  pistol: { label: "PULSO-9", cd: 0.16, color: 0x00e5ff, pellets: 1, spread: 0.012, pierce: false },
  scatter: { label: "DISPERSSOR", cd: 0.72, color: 0xffb300, pellets: 7, spread: 0.055, pierce: false },
  rail: { label: "TRILHO-X", cd: 0.6, color: 0xff3860, pellets: 1, spread: 0.0, pierce: true },
};
const WEAPON_ORDER: WeaponId[] = ["pistol", "scatter", "rail"];

const POWER_COLOR: Record<PowerId, number> = {
  pistol: 0x00e5ff, scatter: 0xffb300, rail: 0xff3860, shield: 0x37ffb4, haste: 0xaef3ff,
};

const BOT_NAMES = ["VEGA", "KRON", "NOVA", "DANT", "RIFT", "HALO", "ZULU", "LYRA", "BRUT", "ECHO", "ONYX"];
const PLAYER_COLORS = [0x00e5ff, 0xffb300, 0xff3860, 0x37ffb4, 0xf78c6b, 0x7cf5ff, 0xc8ff4d, 0xff8a3d, 0x5ad1e6, 0xffd166, 0x06d6a0, 0xef476f];

const SPAWNS: Array<[number, number]> = [
  [-24, -24], [24, -24], [-24, 24], [24, 24], [0, -24], [0, 24], [-24, 0], [24, 0],
];

export const DIFFS: Array<{ name: string; desc: string; skill: [number, number]; react: [number, number]; err: number; cadence: number }> = [
  { name: "RECRUTA", desc: "Bots lentos e imprecisos — aqueça o pulso", skill: [0.2, 0.36], react: [0.5, 0.85], err: 0.055, cadence: 0.3 },
  { name: "SOLDADO", desc: "Combate equilibrado de arena", skill: [0.4, 0.6], react: [0.34, 0.6], err: 0.035, cadence: 0.2 },
  { name: "ELITE", desc: "Reações rápidas, mira afiada", skill: [0.58, 0.78], react: [0.22, 0.42], err: 0.02, cadence: 0.12 },
  { name: "LENDA", desc: "Reflexos quase sobre-humanos", skill: [0.74, 0.92], react: [0.14, 0.3], err: 0.01, cadence: 0.06 },
];

/* ---------------------------------- mapas -------------------------------- */

interface MapBox { p: [number, number, number]; s: [number, number, number]; k: "plat" | "crate" | "cover" | "tower" | "ice"; }
interface MapDef {
  id: MapId; name: string; tag: string; desc: string;
  bg: number; floor: number; gridA: number; gridB: number;
  wall: number; plat: number; crate: number; cover: number; tower: number;
  accent: number; accent2: number; danger: number;
  light: number; hemiSky: number; hemiGnd: number;
  accelMul: number; decelMul: number;
  boxes: MapBox[];
  strips: Array<{ p: [number, number, number]; s: [number, number, number]; c: number }>;
  pads: Array<{ p: [number, number, number]; cycle: PowerId[] }>;
}

export const MAPS: MapDef[] = [
  {
    id: "nucleo", name: "NÚCLEO", tag: "SIMÉTRICA", desc: "Arena clássica com plataforma central e linhas de tiro limpas.",
    bg: 0x06141b, floor: 0x0a222b, gridA: 0x147487, gridB: 0x0c3b47,
    wall: 0x0d2833, plat: 0x0e2a35, crate: 0x123844, cover: 0x10313c, tower: 0x0e2a35,
    accent: 0x00e5ff, accent2: 0xffb300, danger: 0xff3860,
    light: 0xcfefff, hemiSky: 0x8fd8ff, hemiGnd: 0x0a1f26,
    accelMul: 1, decelMul: 1,
    boxes: [
      { p: [0, 1.2, 0], s: [12, 2.4, 12], k: "plat" },
      { p: [7.3, 0.8, 0], s: [2.6, 1.6, 5], k: "plat" },
      { p: [9.9, 0.4, 0], s: [2.6, 0.8, 5], k: "plat" },
      { p: [-17, 1.1, -17], s: [3.4, 2.2, 3.4], k: "crate" },
      { p: [17, 0.8, -15], s: [4, 1.6, 3], k: "crate" },
      { p: [-15, 0.9, 16], s: [3, 1.8, 4], k: "crate" },
      { p: [16.5, 1.3, 16.5], s: [2.6, 2.6, 2.6], k: "crate" },
      { p: [-4, 0.65, -13], s: [8, 1.3, 0.5], k: "cover" },
      { p: [4, 0.65, 13], s: [8, 1.3, 0.5], k: "cover" },
      { p: [-13, 0.65, 4], s: [0.5, 1.3, 8], k: "cover" },
      { p: [13, 0.65, -4], s: [0.5, 1.3, 8], k: "cover" },
      { p: [9, 2.5, -9], s: [1.4, 5, 1.4], k: "tower" },
      { p: [-9, 2.5, 9], s: [1.4, 5, 1.4], k: "tower" },
    ],
    strips: [
      { p: [0, 2.42, -6.02], s: [12.2, 0.08, 0.14], c: 0xffb300 },
      { p: [0, 2.42, 6.02], s: [12.2, 0.08, 0.14], c: 0xffb300 },
      { p: [0, 0.03, -20], s: [34, 0.06, 0.3], c: 0x00e5ff },
      { p: [0, 0.03, 20], s: [34, 0.06, 0.3], c: 0x00e5ff },
    ],
    pads: [
      { p: [0, 2.4, 0], cycle: ["rail"] },
      { p: [0, 0, 10.5], cycle: ["scatter", "shield", "haste"] },
      { p: [0, 0, -10.5], cycle: ["rail", "haste", "scatter"] },
      { p: [-10.5, 0, 0], cycle: ["shield", "scatter", "rail"] },
      { p: [18, 0, 10], cycle: ["haste", "rail", "shield"] },
    ],
  },
  {
    id: "fundicao", name: "FUNDIÇÃO", tag: "VERTICAL", desc: "Complexo industrial com pirâmide central, chaminés e passarelas quentes.",
    bg: 0x170b06, floor: 0x241009, gridA: 0x8a3d12, gridB: 0x4a2008,
    wall: 0x2c160c, plat: 0x311a0d, crate: 0x3a2010, cover: 0x33200f, tower: 0x2e180c,
    accent: 0xff7a1a, accent2: 0xffd166, danger: 0xff3860,
    light: 0xffd9a8, hemiSky: 0xffb27a, hemiGnd: 0x1e0d06,
    accelMul: 1, decelMul: 1,
    boxes: [
      { p: [0, 0.6, 0], s: [10, 1.2, 10], k: "plat" },
      { p: [0, 1.8, 0], s: [6, 1.2, 6], k: "plat" },
      { p: [20, 4, 20], s: [3, 8, 3], k: "tower" },
      { p: [-20, 4, 20], s: [3, 8, 3], k: "tower" },
      { p: [20, 4, -20], s: [3, 8, 3], k: "tower" },
      { p: [-20, 4, -20], s: [3, 8, 3], k: "tower" },
      { p: [-10, 1, 18], s: [3, 2, 3], k: "crate" },
      { p: [12, 1.4, 16], s: [2.5, 2.8, 2.5], k: "crate" },
      { p: [-18, 0.8, -8], s: [4, 1.6, 2.5], k: "crate" },
      { p: [18, 1, -10], s: [2.6, 2, 4], k: "crate" },
      { p: [-12, 1.1, -18], s: [3, 2.2, 3], k: "crate" },
      { p: [8, 0.7, 20], s: [5, 1.4, 2], k: "crate" },
      { p: [0, 0.65, 16], s: [12, 1.3, 0.5], k: "cover" },
      { p: [0, 0.65, -16], s: [12, 1.3, 0.5], k: "cover" },
      { p: [16, 0.65, 0], s: [0.5, 1.3, 12], k: "cover" },
      { p: [-16, 0.65, 0], s: [0.5, 1.3, 12], k: "cover" },
    ],
    strips: [
      { p: [0, 1.22, -5.02], s: [10.2, 0.08, 0.14], c: 0xff7a1a },
      { p: [0, 1.22, 5.02], s: [10.2, 0.08, 0.14], c: 0xff7a1a },
      { p: [0, 2.42, -3.02], s: [6.2, 0.08, 0.14], c: 0xffd166 },
      { p: [0, 2.42, 3.02], s: [6.2, 0.08, 0.14], c: 0xffd166 },
      { p: [0, 0.03, 0], s: [44, 0.05, 0.5], c: 0xff3860 },
    ],
    pads: [
      { p: [0, 2.4, 0], cycle: ["rail", "shield"] },
      { p: [14, 0, 14], cycle: ["scatter", "haste", "rail"] },
      { p: [-14, 0, -14], cycle: ["shield", "scatter", "haste"] },
      { p: [-14, 0, 14], cycle: ["haste", "rail", "scatter"] },
      { p: [14, 0, -14], cycle: ["rail", "haste", "shield"] },
    ],
  },
  {
    id: "glacial", name: "GLACIAL", tag: "ESCORREGADIA", desc: "Plataforma criogênica de baixo atrito — derrape, antecipe, sobreviva.",
    bg: 0x0a1620, floor: 0x16303c, gridA: 0x7fd8e8, gridB: 0x2c5a68,
    wall: 0x1d4250, plat: 0x214a58, crate: 0x28566a, cover: 0x234e5e, tower: 0x1f4855,
    accent: 0x9fe8ff, accent2: 0xe8f8ff, danger: 0xff3860,
    light: 0xeaf8ff, hemiSky: 0xc9f2ff, hemiGnd: 0x0e2430,
    accelMul: 0.62, decelMul: 0.2,
    boxes: [
      { p: [0, 0.6, 0], s: [9, 1.2, 9], k: "plat" },
      { p: [10, 2.25, 10], s: [2, 4.5, 2], k: "ice" },
      { p: [-10, 2.25, 10], s: [2, 4.5, 2], k: "ice" },
      { p: [10, 2.25, -10], s: [2, 4.5, 2], k: "ice" },
      { p: [-10, 2.25, -10], s: [2, 4.5, 2], k: "ice" },
      { p: [-6, 1, 14], s: [6, 2, 1.2], k: "crate" },
      { p: [6, 1, -14], s: [6, 2, 1.2], k: "crate" },
      { p: [14, 1, 6], s: [1.2, 2, 6], k: "crate" },
      { p: [-14, 1, -6], s: [1.2, 2, 6], k: "crate" },
      { p: [18, 1, 18], s: [3, 2, 3], k: "crate" },
      { p: [-18, 1.2, -18], s: [2.6, 2.4, 2.6], k: "crate" },
      { p: [0, 0.65, -20], s: [10, 1.3, 0.5], k: "cover" },
      { p: [0, 0.65, 20], s: [10, 1.3, 0.5], k: "cover" },
    ],
    strips: [
      { p: [0, 1.22, -4.52], s: [9.2, 0.07, 0.13], c: 0x9fe8ff },
      { p: [0, 1.22, 4.52], s: [9.2, 0.07, 0.13], c: 0x9fe8ff },
      { p: [-20, 0.03, 0], s: [0.5, 0.05, 40], c: 0xe8f8ff },
      { p: [20, 0.03, 0], s: [0.5, 0.05, 40], c: 0xe8f8ff },
    ],
    pads: [
      { p: [0, 1.2, 0], cycle: ["haste", "shield"] },
      { p: [0, 0, 16], cycle: ["scatter", "rail", "shield"] },
      { p: [0, 0, -16], cycle: ["rail", "scatter", "haste"] },
      { p: [16, 0, 0], cycle: ["shield", "haste", "rail"] },
      { p: [-16, 0, 0], cycle: ["scatter", "haste", "shield"] },
    ],
  },
];

function approach(cur: number, target: number, delta: number): number {
  if (cur < target) return Math.min(cur + delta, target);
  return Math.max(cur - delta, target);
}
function angLerp(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/* --------------------------------- entidades ----------------------------- */

interface BotBrain {
  wp: THREE.Vector3; decide: number; strafe: number; strafeT: number;
  target: Fighter | null; react: number; skill: number; err: number; cadence: number;
  stuck: number;
}

interface Humanoid {
  group: THREE.Group;
  visor: THREE.MeshStandardMaterial;
  armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group;
}

interface Fighter {
  id: number; name: string; colorHex: number;
  pos: THREE.Vector3; vel: THREE.Vector3; yaw: number; pitch: number;
  grounded: boolean; alive: boolean; respawnT: number; spawnProt: number;
  coyote: number; jbuf: number; prevJump: boolean; prevFire: boolean;
  weapon: WeaponId; weaponT: number; shield: boolean; hasteT: number;
  kills: number; deaths: number; score: number; streak: number; bestStreak: number;
  isSelf: boolean; isBot: boolean;
  fire: number; lastKiller: string;
  hum: Humanoid | null;
  brain: BotBrain | null;
  input: InputFrame;
  snap?: FSnap;
  animPhase: number; animAmp: number;
  prevX: number; prevZ: number;
}

interface Pad {
  pos: THREE.Vector3; cycle: PowerId[]; idx: number; active: boolean; t: number;
  type: PowerId; group: THREE.Group; gem: THREE.Mesh; gemWire: THREE.Mesh; beam: THREE.Mesh;
  gemMat: THREE.MeshBasicMaterial; beamMat: THREE.MeshBasicMaterial; ringMat: THREE.MeshBasicMaterial;
}

interface Tracer { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number; }

/* ---------------------------------- motor -------------------------------- */

export class ArenaEngine {
  private container: HTMLElement;
  private cfg: MatchConfig;
  private cb: EngineCallbacks;
  readonly sfx = new AudioFX();
  private mapDef: MapDef;
  private diff = DIFFS[1];

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  private colliders: THREE.Box3[] = [];
  private boxVisuals: Array<{ box: THREE.Box3 }> = [];
  private fighters: Fighter[] = [];
  private player!: Fighter;
  private pads: Pad[] = [];
  private tracers: Tracer[] = [];
  private feedId = 0;

  phase: Phase = "idle";
  paused = false;
  private time = 0;
  private countdown = 0;
  private lastCount = -1;
  private endT = 0;
  private endSent = false;
  private hudAcc = 0;
  private netAcc = 0;
  private shake = 0;
  private sensitivity = 1;

  /* input */
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private firing = false;
  private touchMove = new THREE.Vector2(0, 0);
  private locked = false;
  private dragging = false;
  private isCoarse = false;

  /* fx */
  private pCount = 460;
  private pPos!: Float32Array; private pVel!: Float32Array; private pCol!: Float32Array;
  private pBase!: Float32Array; private pLife!: Float32Array; private pMax!: Float32Array;
  private pGrav!: Float32Array;
  private pGeo!: THREE.BufferGeometry;
  private muzzle!: THREE.Mesh; private muzzleLight!: THREE.PointLight;
  private gun!: THREE.Group; private gunStrip!: THREE.MeshStandardMaterial;
  private gunKick = 0; private recoilPitch = 0; private flashT = 0;
  private bobT = 0; private trailAcc = 0;

  /* stats do jogador */
  private shots = 0; private hits = 0;

  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpV3 = new THREE.Vector3();
  private tmpBox = new THREE.Box3();
  private rcC = new THREE.Vector3();
  private losD = new THREE.Vector3();
  private trV = new THREE.Vector3();
  private muzzleV = new THREE.Vector3();
  private aimE = new THREE.Euler(0, 0, 0, "YXZ");
  private aimV = new THREE.Vector3();

  constructor(container: HTMLElement, cfg: MatchConfig, cb: EngineCallbacks) {
    this.container = container;
    this.cfg = cfg;
    this.cb = cb;
    this.mapDef = MAPS.find((m) => m.id === cfg.mapId) || MAPS[0];
    this.diff = DIFFS[Math.max(0, Math.min(DIFFS.length - 1, cfg.difficulty))] || DIFFS[1];
  }

  get role(): NetRole { return this.cfg.role; }

  /* ------------------------------ inicialização --------------------------- */

  init(): void {
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    this.isCoarse = isCoarse;
    this.renderer = new THREE.WebGLRenderer({ antialias: !isCoarse, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 1.75));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = !isCoarse;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.style.display = "block";
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.mapDef.bg);
    this.scene.fog = new THREE.FogExp2(this.mapDef.bg, 0.013);

    this.camera = new THREE.PerspectiveCamera(77, this.container.clientWidth / this.container.clientHeight, 0.08, 200);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.buildArena();
    this.buildLights();
    this.buildParticles();
    this.buildTracers();
    this.buildPads();
    this.buildGun();
    this.buildFighters();

    this.bindInput();
    window.addEventListener("resize", this.onResize);
    this.clock.start();
    this.frame();
    this.emitHud();
  }

  setSensitivity(v: number): void { this.sensitivity = Math.max(0.2, Math.min(2.5, v)); }

  private buildLights(): void {
    const m = this.mapDef;
    this.scene.add(new THREE.HemisphereLight(m.hemiSky, m.hemiGnd, 0.55));
    const dir = new THREE.DirectionalLight(m.light, 0.9);
    dir.position.set(18, 26, 12);
    dir.castShadow = this.renderer.shadowMap.enabled;
    dir.shadow.mapSize.set(1024, 1024);
    const s = 32;
    dir.shadow.camera.left = -s; dir.shadow.camera.right = s;
    dir.shadow.camera.top = s; dir.shadow.camera.bottom = -s;
    dir.shadow.camera.far = 80;
    this.scene.add(dir);
    const core = new THREE.PointLight(m.accent, 60, 46, 1.8);
    core.position.set(0, 9, 0);
    this.scene.add(core);
    const warm = new THREE.PointLight(m.accent2, 40, 40, 1.8);
    warm.position.set(-19, 7, -19);
    this.scene.add(warm);
  }

  private addBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number, opts?: { emissive?: number; ice?: boolean }): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.12 });
    if (opts?.emissive) { mat.emissive = new THREE.Color(opts.emissive); mat.emissiveIntensity = 1.6; mat.roughness = 0.4; }
    if (opts?.ice) { mat.roughness = 0.15; mat.metalness = 0.05; mat.transparent = true; mat.opacity = 0.88; }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz));
    this.colliders.push(box);
    this.boxVisuals.push({ box });
    return mesh;
  }

  private addGlow(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshBasicMaterial({ color }));
    mesh.position.set(cx, cy, cz);
    this.scene.add(mesh);
  }

  private buildArena(): void {
    const m = this.mapDef;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA, ARENA),
      new THREE.MeshStandardMaterial({ color: m.floor, roughness: 0.92, metalness: 0.08 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(ARENA, 28, m.gridA, m.gridB);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    grid.position.y = 0.02;
    this.scene.add(grid);

    const wT = 1;
    this.addBox(0, WALL_H / 2, -HALF - wT / 2, ARENA + wT * 2, WALL_H, wT, m.wall);
    this.addBox(0, WALL_H / 2, HALF + wT / 2, ARENA + wT * 2, WALL_H, wT, m.wall);
    this.addBox(-HALF - wT / 2, WALL_H / 2, 0, wT, WALL_H, ARENA, m.wall);
    this.addBox(HALF + wT / 2, WALL_H / 2, 0, wT, WALL_H, ARENA, m.wall);
    this.addGlow(0, 2.1, -HALF + 0.02, ARENA, 0.12, 0.06, m.accent2);
    this.addGlow(0, 2.1, HALF - 0.02, ARENA, 0.12, 0.06, m.accent2);
    this.addGlow(-HALF + 0.02, 4.2, 0, 0.06, 0.12, ARENA, m.accent);
    this.addGlow(HALF - 0.02, 4.2, 0, 0.06, 0.12, ARENA, m.accent);
    for (const [cx, cz] of [[-HALF + 0.8, -HALF + 0.8], [HALF - 0.8, -HALF + 0.8], [-HALF + 0.8, HALF - 0.8], [HALF - 0.8, HALF - 0.8]] as Array<[number, number]>) {
      this.addBox(cx, 3.5, cz, 1.6, 7, 1.6, m.tower);
      this.addGlow(cx, 3.5, cz, 0.18, 6.4, 0.18, m.danger);
    }

    for (const b of m.boxes) {
      const kindColor = b.k === "plat" ? m.plat : b.k === "crate" ? m.crate : b.k === "cover" ? m.cover : m.tower;
      this.addBox(b.p[0], b.p[1], b.p[2], b.s[0], b.s[1], b.s[2], kindColor, b.k === "ice" ? { ice: true } : undefined);
    }
    for (const s of m.strips) this.addGlow(s.p[0], s.p[1], s.p[2], s.s[0], s.s[1], s.s[2], s.c);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(60, 120, 48),
      new THREE.MeshBasicMaterial({ color: m.gridB, side: THREE.DoubleSide, fog: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.4;
    this.scene.add(halo);
  }

  /* ------------------------------ partículas ------------------------------ */

  private buildParticles(): void {
    const n = this.pCount;
    this.pPos = new Float32Array(n * 3); this.pVel = new Float32Array(n * 3);
    this.pCol = new Float32Array(n * 3); this.pBase = new Float32Array(n * 3);
    this.pLife = new Float32Array(n); this.pMax = new Float32Array(n); this.pGrav = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pPos[i * 3 + 1] = -50;
    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.pGeo.setAttribute("color", new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({ size: 0.17, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const points = new THREE.Points(this.pGeo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
  }

  private burst(p: THREE.Vector3, colorHex: number, count: number, speed: number, life: number, gravity: number, up = 0.35): void {
    const c = new THREE.Color(colorHex);
    let spawned = 0;
    for (let i = 0; i < this.pCount && spawned < count; i++) {
      if (this.pLife[i] > 0) continue;
      const i3 = i * 3;
      this.pPos[i3] = p.x; this.pPos[i3 + 1] = p.y; this.pPos[i3 + 2] = p.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.35 + Math.random() * 0.75);
      this.pVel[i3] = Math.sin(ph) * Math.cos(th) * sp;
      this.pVel[i3 + 1] = Math.cos(ph) * sp * 0.7 + up * speed;
      this.pVel[i3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      this.pBase[i3] = c.r; this.pBase[i3 + 1] = c.g; this.pBase[i3 + 2] = c.b;
      const lf = life * (0.5 + Math.random() * 0.5);
      this.pLife[i] = lf; this.pMax[i] = lf;
      this.pGrav[i] = gravity;
      spawned++;
    }
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < this.pCount; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      const i3 = i * 3;
      if (this.pLife[i] <= 0) {
        this.pPos[i3 + 1] = -50;
        this.pCol[i3] = 0; this.pCol[i3 + 1] = 0; this.pCol[i3 + 2] = 0;
        continue;
      }
      this.pVel[i3 + 1] -= this.pGrav[i] * dt;
      this.pPos[i3] += this.pVel[i3] * dt;
      this.pPos[i3 + 1] += this.pVel[i3 + 1] * dt;
      this.pPos[i3 + 2] += this.pVel[i3 + 2] * dt;
      if (this.pPos[i3 + 1] < 0.03) { this.pPos[i3 + 1] = 0.03; this.pVel[i3 + 1] *= -0.4; }
      const f = this.pLife[i] / this.pMax[i];
      this.pCol[i3] = this.pBase[i3] * f;
      this.pCol[i3 + 1] = this.pBase[i3 + 1] * f;
      this.pCol[i3 + 2] = this.pBase[i3 + 2] * f;
    }
    (this.pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.pGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  /* -------------------------------- tracers ------------------------------- */

  private buildTracers(): void {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 26; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.tracers.push({ mesh, mat, life: 0, max: 1 });
    }
  }

  private shootTracer(a: THREE.Vector3, b: THREE.Vector3, colorHex: number, thick: number): void {
    let t: Tracer | null = null;
    for (const tr of this.tracers) if (tr.life <= 0) { t = tr; break; }
    if (!t) t = this.tracers[0];
    const dir = this.trV.copy(b).sub(a);
    const len = Math.max(dir.length(), 0.001);
    t.mesh.position.copy(a).addScaledVector(dir, 0.5);
    t.mesh.scale.set(thick, thick, len);
    t.mesh.lookAt(b);
    t.mat.color.setHex(colorHex);
    t.mat.opacity = 0.95;
    t.life = t.max = thick > 0.1 ? 0.16 : 0.07;
    t.mesh.visible = true;
  }

  private updateTracers(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; t.mat.opacity = 0; continue; }
      t.mat.opacity = 0.95 * (t.life / t.max);
    }
  }

  /* ------------------------------- power-ups ------------------------------ */

  private buildPads(): void {
    const m = this.mapDef;
    const gemGeo = new THREE.OctahedronGeometry(0.34);
    const wireGeo = new THREE.OctahedronGeometry(0.52);
    const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 4.2, 10, 1, true);
    for (const d of m.pads) {
      const type = d.cycle[0];
      const group = new THREE.Group();
      group.position.set(d.p[0], d.p[1], d.p[2]);
      const gemMat = new THREE.MeshBasicMaterial({ color: POWER_COLOR[type] });
      const gem = new THREE.Mesh(gemGeo, gemMat);
      gem.position.y = 1;
      const wireMat = new THREE.MeshBasicMaterial({ color: POWER_COLOR[type], wireframe: true, transparent: true, opacity: 0.5 });
      const gemWire = new THREE.Mesh(wireGeo, wireMat);
      gemWire.position.y = 1;
      const beamMat = new THREE.MeshBasicMaterial({ color: POWER_COLOR[type], transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 2.1;
      const ringMat = new THREE.MeshBasicMaterial({ color: POWER_COLOR[type], transparent: true, opacity: 0.55, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 24), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      group.add(gem, gemWire, beam, ring);
      this.scene.add(group);
      this.pads.push({ pos: group.position.clone(), cycle: d.cycle, idx: 0, active: true, t: 0, type, group, gem, gemWire, beam, gemMat, beamMat, ringMat });
    }
  }

  private updatePads(dt: number, simLogic: boolean): void {
    const time = this.clock.elapsedTime;
    for (const pad of this.pads) {
      if (!pad.active) {
        pad.t -= dt;
        pad.group.visible = false;
        if (pad.t <= 0 && simLogic) {
          pad.idx = (pad.idx + 1) % pad.cycle.length;
          pad.type = pad.cycle[pad.idx];
          pad.active = true;
          this.setPadColor(pad);
          pad.group.visible = true;
          this.burst(this.tmpV.set(pad.pos.x, pad.pos.y + 1, pad.pos.z), POWER_COLOR[pad.type], 10, 3, 0.5, 4);
        }
        continue;
      }
      pad.group.visible = true;
      pad.gem.rotation.y = time * 2.2;
      pad.gemWire.rotation.y = -time * 1.4;
      pad.gem.position.y = 1 + Math.sin(time * 3 + pad.pos.x) * 0.12;
      pad.gemWire.position.y = pad.gem.position.y;
      if (!simLogic) continue;
      for (const f of this.fighters) {
        if (!f.alive || f.spawnProt > 0) continue;
        const dx = f.pos.x - pad.pos.x, dz = f.pos.z - pad.pos.z;
        const dy = f.pos.y - pad.pos.y;
        if (dx * dx + dz * dz < 1.5 && Math.abs(dy) < 1.8) {
          this.applyPower(f, pad.type);
          pad.active = false;
          pad.t = 11 + Math.random() * 3;
          this.burst(this.tmpV.copy(pad.pos).add(this.tmpV2.set(0, 1, 0)), POWER_COLOR[pad.type], 16, 4.5, 0.55, 5);
          break;
        }
      }
    }
  }

  private setPadColor(pad: Pad): void {
    pad.gemMat.color.setHex(POWER_COLOR[pad.type]);
    (pad.gemWire.material as THREE.MeshBasicMaterial).color.setHex(POWER_COLOR[pad.type]);
    pad.beamMat.color.setHex(POWER_COLOR[pad.type]);
    pad.ringMat.color.setHex(POWER_COLOR[pad.type]);
  }

  private applyPower(f: Fighter, type: PowerId): void {
    let msg = "";
    if (type === "shield") { f.shield = true; msg = "ÉGIDE ATIVA — ABSORVE 1 DISPARO"; }
    else if (type === "haste") { f.hasteT = 6; msg = "SURTO — VELOCIDADE AMPLIFICADA"; }
    else { f.weapon = type; f.weaponT = WEAPON_TIME; msg = `${WEAPONS[type].label} EQUIPADO — ${WEAPON_TIME}s`; }

    this.burst(this.tmpV.copy(f.pos).add(this.tmpV2.set(0, 1, 0)), POWER_COLOR[type], 8, 3.4, 0.4, 4);

    if (f.isSelf) {
      this.cb.onToast(msg, "pickup");
      this.sfx.pickup();
      if (type !== "shield" && type !== "haste") {
        this.gunStrip.emissive.setHex(WEAPONS[type].color);
        this.gunStrip.color.setHex(WEAPONS[type].color);
      }
    } else if (!f.isBot) {
      this.remoteEv(f.id, { k: "toast", msg, kind: "pickup" });
      this.sfx.pickup();
    } else {
      this.sfx.pickup();
    }
    this.emitHudSoon();
  }

  private remoteEv(slot: number, ev: RemoteEv): void {
    if (this.role === "host" && !this.isSlotBot(slot)) this.cb.onRemoteEvent?.(slot, ev as { k: string });
  }
  private isSlotBot(slot: number): boolean {
    const f = this.fighters.find((x) => x.id === slot);
    return !f || f.isBot;
  }

  /* --------------------------------- arma --------------------------------- */

  private buildGun(): void {
    this.gun = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x131c22, roughness: 0.5, metalness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42), dark);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
    grip.position.set(0, -0.12, 0.12);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.26), dark);
    barrel.position.set(0, 0.03, -0.3);
    this.gunStrip = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 2, roughness: 0.3 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.025, 0.36), this.gunStrip);
    strip.position.set(0, 0.07, -0.02);
    this.muzzle = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.muzzle.position.set(0, 0.03, -0.46);
    this.muzzleLight = new THREE.PointLight(0x9feaff, 0, 9, 2);
    this.muzzleLight.position.set(0, 0.05, -0.5);
    this.gun.add(body, grip, barrel, strip, this.muzzle, this.muzzleLight);
    this.gun.position.set(0.3, -0.26, -0.5);
    this.camera.add(this.gun);
  }

  /* ----------------------------- personagem humanoide --------------------- */

  private makeHumanoid(colorHex: number): Humanoid {
    const group = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.55, metalness: 0.35 });
    const suitDark = new THREE.MeshStandardMaterial({ color: 0x10181f, roughness: 0.6, metalness: 0.3 });
    const trim = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 1.2, roughness: 0.4 });
    const visor = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 2.6, roughness: 0.3 });

    /* torso */
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.26), suit);
    torso.position.y = 1.18; torso.castShadow = true;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.03), trim);
    chest.position.set(0, 1.28, 0.14);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.24), suitDark);
    belt.position.y = 0.92;
    /* cabeça + visor */
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.25, 0.26), suitDark);
    head.position.y = 1.6; head.castShadow = true;
    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.04), visor);
    visorMesh.position.set(0, 1.62, 0.13);
    const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.14, 0.025), trim);
    antenna.position.set(0.1, 1.78, -0.06);
    /* mochila */
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.12), suitDark);
    pack.position.set(0, 1.22, -0.18);

    const mkLimb = (w: number, h: number, d: number): THREE.Group => {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), suit);
      mesh.position.y = -h / 2;
      mesh.castShadow = true;
      pivot.add(mesh);
      return pivot;
    };
    const armL = mkLimb(0.12, 0.5, 0.14); armL.position.set(-0.32, 1.42, 0);
    const armR = mkLimb(0.12, 0.5, 0.14); armR.position.set(0.32, 1.42, 0);
    const gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.4), suitDark);
    gunMesh.position.set(0, -0.42, 0.16);
    const gunGlow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.3), trim);
    gunGlow.position.set(0, -0.38, 0.16);
    armR.add(gunMesh, gunGlow);
    armR.rotation.x = -1.25;
    const legL = mkLimb(0.16, 0.86, 0.18); legL.position.set(-0.13, 0.9, 0);
    const legR = mkLimb(0.16, 0.86, 0.18); legR.position.set(0.13, 0.9, 0);
    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.26), suitDark);
    bootL.position.set(0, -0.86, 0.04); legL.add(bootL);
    const bootR = bootL.clone(); legR.add(bootR);

    group.add(torso, chest, belt, head, visorMesh, antenna, pack, armL, armR, legL, legR);
    return { group, visor, armL, armR, legL, legR };
  }

  /* ------------------------------- combatentes ---------------------------- */

  private newFighter(id: number, name: string, colorHex: number, isSelf: boolean, isBot: boolean): Fighter {
    return {
      id, name, colorHex,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0,
      grounded: true, alive: true, respawnT: 0, spawnProt: 0,
      coyote: 0, jbuf: 0, prevJump: false, prevFire: false,
      weapon: "pistol", weaponT: 0, shield: false, hasteT: 0,
      kills: 0, deaths: 0, score: 0, streak: 0, bestStreak: 0,
      isSelf, isBot,
      fire: 0, lastKiller: "",
      hum: null,
      brain: isBot ? {
        wp: new THREE.Vector3(), decide: Math.random() * 0.2,
        strafe: Math.random() < 0.5 ? -1 : 1, strafeT: 1,
        target: null, react: 0.4,
        skill: this.diff.skill[0] + Math.random() * (this.diff.skill[1] - this.diff.skill[0]),
        err: this.diff.err + (1 - this.diff.skill[1]) * 0.03,
        cadence: this.diff.cadence,
        stuck: 0,
      } : null,
      input: { f: 0, s: 0, j: false, fire: false, yaw: 0, pitch: 0 },
      animPhase: Math.random() * 6, animAmp: 0, prevX: 0, prevZ: 0,
    };
  }

  private buildFighters(): void {
    const humans = this.cfg.players.length > 0 ? this.cfg.players : [{ slot: 0, name: this.cfg.playerName || "VOCÊ", host: true }];
    let usedNames = new Set<string>();
    for (const h of humans) {
      const name = h.slot === this.cfg.selfSlot ? (this.cfg.playerName || h.name) : h.name;
      const f = this.newFighter(h.slot, name, PLAYER_COLORS[h.slot % PLAYER_COLORS.length], h.slot === this.cfg.selfSlot, false);
      if (h.slot !== this.cfg.selfSlot) {
        const hum = this.makeHumanoid(f.colorHex);
        this.scene.add(hum.group);
        f.hum = hum;
      }
      this.fighters.push(f);
      usedNames.add(name);
    }
    /* bots preenchem até 12 */
    const total = 12;
    let bi = 0;
    while (this.fighters.length < Math.min(total, humans.length + Math.max(0, this.cfg.botCount))) {
      const base = BOT_NAMES[bi % BOT_NAMES.length];
      let name = base;
      let k = 2;
      while (usedNames.has(name)) name = `${base}-${k++}`;
      usedNames.add(name);
      const color = PLAYER_COLORS[(humans.length + bi) % PLAYER_COLORS.length];
      const f = this.newFighter(humans.length + bi, name, color, false, true);
      const hum = this.makeHumanoid(color);
      this.scene.add(hum.group);
      f.hum = hum;
      this.fighters.push(f);
      this.spawnFighter(f, true);
      bi++;
    }
    this.player = this.fighters.find((f) => f.id === this.cfg.selfSlot) || this.fighters[0];
    this.spawnFighter(this.player, true);
    this.yaw = Math.atan2(-this.player.pos.x, -this.player.pos.z);
  }

  private pointFree(x: number, z: number, r: number): boolean {
    for (const b of this.colliders) {
      if (x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r && b.max.y > 0.5) return false;
    }
    return Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1;
  }

  private randomWaypoint(): THREE.Vector3 {
    for (let i = 0; i < 14; i++) {
      const x = (Math.random() * 2 - 1) * (HALF - 3);
      const z = (Math.random() * 2 - 1) * (HALF - 3);
      if (this.pointFree(x, z, 0.7)) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(0, 0, 18);
  }

  private spawnFighter(f: Fighter, initial = false): void {
    let best: [number, number] = SPAWNS[0];
    let bestScore = -1;
    for (const s of SPAWNS) {
      let minD = 999;
      for (const e of this.fighters) {
        if (e === f || !e.alive) continue;
        const d = Math.hypot(e.pos.x - s[0], e.pos.z - s[1]);
        if (d < minD) minD = d;
      }
      const score = minD + Math.random() * 6;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    f.pos.set(best[0], 0, best[1]);
    f.vel.set(0, 0, 0);
    f.alive = true;
    f.spawnProt = initial ? 0 : 1.6;
    f.weapon = "pistol"; f.weaponT = 0; f.shield = false; f.hasteT = 0;
    f.coyote = 0; f.jbuf = 0;
    if (f.isSelf) {
      this.yaw = Math.atan2(-f.pos.x, -f.pos.z);
      this.pitch = 0;
      this.gunStrip.emissive.setHex(0x00e5ff);
      this.gunStrip.color.setHex(0x00e5ff);
      this.sfx.respawn();
    } else if (f.hum) {
      f.hum.group.visible = true;
      if (f.brain) { f.brain.target = null; f.brain.wp = this.randomWaypoint(); }
    }
  }

  /* --------------------------------- input -------------------------------- */

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "Tab" || e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent): void => { this.keys.delete(e.code); };
  private onMouseMove = (e: MouseEvent): void => {
    if (this.paused) return;
    if (this.locked || this.dragging) {
      this.yaw -= e.movementX * 0.0021 * this.sensitivity;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * 0.0021 * this.sensitivity));
    }
  };
  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.sfx.ensure();
      this.firing = true;
      if (!this.locked) this.dragging = true;
    }
  };
  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) { this.firing = false; this.dragging = false; }
  };
  private onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.renderer.domElement;
    this.cb.onLock(this.locked);
    if (this.locked) {
      this.sfx.ensure();
      this.firing = false;
      if (this.phase === "idle") {
        this.phase = "countdown";
        this.countdown = 3.0;
        this.lastCount = -1;
        this.emitHud();
      } else if (this.paused) {
        this.setPaused(false);
      }
    } else if ((this.phase === "playing" || this.phase === "countdown") && !this.disposed && !this.isCoarse) {
      this.setPaused(true);
    }
  };
  private onCtx = (e: Event): void => e.preventDefault();
  private onResize = (): void => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private bindInput(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    this.renderer.domElement.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("pointerlockchange", this.onLockChange);
    this.renderer.domElement.addEventListener("contextmenu", this.onCtx);
  }

  requestLock(): void {
    this.sfx.ensure();
    try {
      const res = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
      if (res && typeof res.catch === "function") res.catch(() => undefined);
    } catch { /* cooldown do navegador */ }
  }

  resume(): void {
    if (!this.paused) return;
    if (this.isCoarse) this.setPaused(false);
    else this.requestLock();
  }

  pauseGame(): void {
    if (!this.paused && (this.phase === "playing" || this.phase === "countdown")) this.setPaused(true);
  }

  startMobile(): void {
    this.sfx.ensure();
    if (this.phase === "idle") {
      this.locked = true;
      this.phase = "countdown";
      this.countdown = 3.0;
      this.lastCount = -1;
      this.emitHud();
    } else if (this.paused) {
      this.setPaused(false);
    }
  }

  private setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    if (p) { this.keys.clear(); this.firing = false; this.dragging = false; }
    this.cb.onPause(p);
  }

  /* toque */
  setTouchMove(x: number, y: number): void { this.touchMove.set(x, y); }
  addTouchLook(dx: number, dy: number): void {
    this.yaw -= dx * 0.0042 * this.sensitivity;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0042 * this.sensitivity));
  }
  setFiring(b: boolean): void { this.sfx.ensure(); this.firing = b; }
  touchJump(): void { this.keys.add("Space"); setTimeout(() => this.keys.delete("Space"), 120); }

  /* ------------------------------- rede: inputs ---------------------------- */

  getLocalInput(): InputFrame {
    let f = 0, s = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) f += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) f -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) s += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) s -= 1;
    f += this.touchMove.y; s += this.touchMove.x;
    f = Math.max(-1, Math.min(1, f)); s = Math.max(-1, Math.min(1, s));
    return { f, s, j: this.keys.has("Space"), fire: this.firing, yaw: this.yaw, pitch: this.pitch };
  }

  setRemoteInput(slot: number, inp: InputFrame): void {
    const f = this.fighters.find((x) => x.id === slot);
    if (f && !f.isBot) f.input = inp;
  }

  private buildSnapshot(): Snapshot {
    return {
      ph: this.phase,
      tm: this.time,
      f: this.fighters.map((f) => ({
        i: f.id, x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.yaw,
        a: f.alive ? 1 : 0, r: Math.max(0, f.respawnT),
        w: WEAPON_ORDER.indexOf(f.weapon), wt: Math.max(0, f.weaponT),
        sh: f.shield ? 1 : 0, h: Math.max(0, f.hasteT),
        k: f.kills, d: f.deaths, s: f.score, st: f.streak,
      })),
      p: this.pads.map((p) => ({ a: p.active ? 1 : 0, ty: p.type, t: Math.max(0, p.t) })),
    };
  }

  injectSnap(snap: Snapshot): void {
    this.phase = snap.ph;
    this.time = snap.tm;
    for (const fs of snap.f) {
      const f = this.fighters.find((x) => x.id === fs.i);
      if (!f) continue;
      f.snap = fs;
      f.kills = fs.k; f.deaths = fs.d; f.score = fs.s; f.streak = fs.st;
      f.weapon = WEAPON_ORDER[fs.w] || "pistol"; f.weaponT = fs.wt;
      f.shield = fs.sh === 1; f.hasteT = fs.h;
      if (f.isSelf) {
        /* correção autoritativa leve no próprio corpo */
        if (fs.a === 0 && f.alive) {
          f.alive = false;
          this.shake = 1;
          this.sfx.death();
        }
        if (fs.a === 1 && !f.alive) this.spawnFighter(f);
        f.respawnT = fs.r;
        const wcol = WEAPONS[WEAPON_ORDER[fs.w] || "pistol"].color;
        this.gunStrip.emissive.setHex(wcol);
        this.gunStrip.color.setHex(wcol);
        const k = 0.22;
        f.pos.x += (fs.x - f.pos.x) * k;
        f.pos.z += (fs.z - f.pos.z) * k;
        f.pos.y += (fs.y - f.pos.y) * k;
      } else {
        f.alive = fs.a === 1;
        f.respawnT = fs.r;
        if (f.hum) f.hum.group.visible = f.alive;
      }
    }
    this.pads.forEach((pad, i) => {
      const ps = snap.p[i];
      if (!ps) return;
      const wasActive = pad.active;
      pad.active = ps.a === 1;
      pad.t = ps.t;
      if (ps.a === 1 && pad.type !== ps.ty) {
        pad.type = ps.ty;
        this.setPadColor(pad);
      }
      if (ps.a === 1 && !wasActive) {
        this.burst(this.tmpV.set(pad.pos.x, pad.pos.y + 1, pad.pos.z), POWER_COLOR[pad.type], 10, 3, 0.5, 4);
      }
    });
    this.emitHudSoon();
  }

  /* --------------------------------- física ------------------------------- */

  private resolveAxis(f: Fighter, axis: 0 | 1 | 2, prevY: number): void {
    const box = this.tmpBox;
    box.min.set(f.pos.x - BODY_R, f.pos.y, f.pos.z - BODY_R);
    box.max.set(f.pos.x + BODY_R, f.pos.y + BODY_H, f.pos.z + BODY_R);
    for (const b of this.colliders) {
      if (!box.intersectsBox(b)) continue;
      if (axis === 0) {
        const cx = (b.min.x + b.max.x) / 2;
        f.pos.x = f.pos.x < cx ? b.min.x - BODY_R : b.max.x + BODY_R;
        f.vel.x = 0;
        box.min.x = f.pos.x - BODY_R; box.max.x = f.pos.x + BODY_R;
      } else if (axis === 2) {
        const cz = (b.min.z + b.max.z) / 2;
        f.pos.z = f.pos.z < cz ? b.min.z - BODY_R : b.max.z + BODY_R;
        f.vel.z = 0;
        box.min.z = f.pos.z - BODY_R; box.max.z = f.pos.z + BODY_R;
      } else {
        if (f.vel.y <= 0 && prevY >= b.max.y - 0.3) {
          f.pos.y = b.max.y;
          f.vel.y = 0;
          f.grounded = true;
        } else if (f.vel.y > 0) {
          f.pos.y = b.min.y - BODY_H;
          f.vel.y = 0;
        }
        box.min.y = f.pos.y; box.max.y = f.pos.y + BODY_H;
      }
    }
  }

  private moveEntity(f: Fighter, dt: number, wish: THREE.Vector3, speed: number): void {
    const m = this.mapDef;
    const accel = (f.grounded ? 40 : 16) * m.accelMul;
    const decel = (f.grounded ? 52 : 5) * m.decelMul;
    const ax = wish.x !== 0 ? accel : decel;
    const az = wish.z !== 0 ? accel : decel;
    f.vel.x = approach(f.vel.x, wish.x * speed, ax * dt);
    f.vel.z = approach(f.vel.z, wish.z * speed, az * dt);
    f.vel.y -= GRAV * dt;
    if (f.vel.y < -32) f.vel.y = -32;
    f.pos.x += f.vel.x * dt;
    this.resolveAxis(f, 0, f.pos.y);
    f.pos.z += f.vel.z * dt;
    this.resolveAxis(f, 2, f.pos.y);
    const prevY = f.pos.y;
    f.grounded = false;
    f.pos.y += f.vel.y * dt;
    this.resolveAxis(f, 1, prevY);
    f.pos.x = Math.max(-HALF + 0.6, Math.min(HALF - 0.6, f.pos.x));
    f.pos.z = Math.max(-HALF + 0.6, Math.min(HALF - 0.6, f.pos.z));
    if (f.pos.y < 0) { f.pos.y = 0; f.vel.y = 0; f.grounded = true; }
  }

  private tryJump(f: Fighter, jumpHeld: boolean): void {
    if (jumpHeld && !f.prevJump) f.jbuf = JBUF;
    f.prevJump = jumpHeld;
    if (f.grounded) f.coyote = COYOTE;
    if (f.jbuf > 0 && f.coyote > 0) {
      f.vel.y = JUMP;
      f.grounded = false;
      f.jbuf = 0;
      f.coyote = 0;
    }
  }

  /* --------------------------------- raycast ------------------------------ */

  private rayBoxes(o: THREE.Vector3, d: THREE.Vector3): number | null {
    let best: number | null = null;
    for (const b of this.colliders) {
      let tmin = 0, tmax = Infinity;
      let hit = true;
      const oArr = [o.x, o.y, o.z], dArr = [d.x, d.y, d.z];
      const minArr = [b.min.x, b.min.y, b.min.z], maxArr = [b.max.x, b.max.y, b.max.z];
      for (let a = 0; a < 3; a++) {
        if (Math.abs(dArr[a]) < 1e-8) {
          if (oArr[a] < minArr[a] || oArr[a] > maxArr[a]) { hit = false; break; }
        } else {
          let t1 = (minArr[a] - oArr[a]) / dArr[a];
          let t2 = (maxArr[a] - oArr[a]) / dArr[a];
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          if (tmin > tmax) { hit = false; break; }
        }
      }
      if (hit && tmin > 0 && (best === null || tmin < best)) best = tmin;
    }
    return best;
  }

  private raySphere(o: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: number): number | null {
    const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const cc = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : null;
  }

  private rayFighter(o: THREE.Vector3, d: THREE.Vector3, f: Fighter): number | null {
    const c = this.rcC;
    c.set(f.pos.x, f.pos.y + 1.0, f.pos.z);
    const tBody = this.raySphere(o, d, c, 0.52);
    c.set(f.pos.x, f.pos.y + 1.6, f.pos.z);
    const tHead = this.raySphere(o, d, c, 0.3);
    if (tBody === null) return tHead;
    if (tHead === null) return tBody;
    return Math.min(tBody, tHead);
  }

  /* --------------------------------- disparo ------------------------------ */

  private fireWeapon(f: Fighter, aimDir: THREE.Vector3 | null): void {
    const w = WEAPONS[f.weapon];
    if (f.fire > 0) return;
    f.fire = w.cd;
    if (f.isSelf) this.shots++;

    const guestVisual = this.role === "guest" && f.isSelf;

    const origin = this.tmpV;
    if (f.isSelf) this.camera.getWorldPosition(origin);
    else origin.set(f.pos.x, f.pos.y + 1.45, f.pos.z);

    const fwd = this.tmpV3;
    if (f.isSelf) this.camera.getWorldDirection(fwd);
    else fwd.copy(aimDir!);
    const muzzle = this.muzzleV.copy(origin).addScaledVector(fwd, 0.55);

    const hits: Array<{ f: Fighter; t: number }> = [];
    const tWall = this.rayBoxes(origin, fwd);
    const wallLimit = tWall ?? 90;

    for (let pi = 0; pi < w.pellets; pi++) {
      const dir = new THREE.Vector3().copy(fwd);
      if (w.spread > 0) {
        dir.x += (Math.random() * 2 - 1) * w.spread;
        dir.y += (Math.random() * 2 - 1) * w.spread;
        dir.z += (Math.random() * 2 - 1) * w.spread;
        dir.normalize();
      }
      const tW = w.pellets > 1 ? (this.rayBoxes(origin, dir) ?? 90) : wallLimit;
      const pelletHits: Array<{ f: Fighter; t: number }> = [];
      if (!guestVisual) {
        for (const e of this.fighters) {
          if (e === f || !e.alive || e.spawnProt > 0) continue;
          const t = this.rayFighter(origin, dir, e);
          if (t !== null && t < tW) pelletHits.push({ f: e, t });
        }
      }
      pelletHits.sort((a, b) => a.t - b.t);
      const chosen = w.pierce ? pelletHits : pelletHits.slice(0, 1);
      let endT = tW;
      for (const h of chosen) {
        hits.push(h);
        if (h.t < endT && !w.pierce) endT = h.t;
      }
      const end = new THREE.Vector3().copy(origin).addScaledVector(dir, Math.min(endT, w.pierce ? (chosen.length ? chosen[chosen.length - 1].t + 2 : tW) : tW));
      this.shootTracer(muzzle, end, w.color, w.pierce ? 0.14 : w.pellets > 1 ? 0.035 : 0.05);
      if (chosen.length === 0 && tW < 90 && !guestVisual) {
        const ip = new THREE.Vector3().copy(origin).addScaledVector(dir, tW);
        this.burst(ip, 0x9feaff, 5, 2.4, 0.3, 8);
        if (f.isSelf) this.sfx.impact();
      }
    }

    const uniq = new Map<number, { f: Fighter; t: number }>();
    for (const h of hits) if (!uniq.has(h.f.id) || uniq.get(h.f.id)!.t > h.t) uniq.set(h.f.id, h);
    const victims = [...uniq.values()].sort((a, b) => a.t - b.t);

    if (f.isSelf) {
      this.gunKick = 0.07;
      this.recoilPitch += f.weapon === "scatter" ? 0.03 : 0.014;
      this.flashT = 0.045;
      this.shake = Math.min(this.shake + (f.weapon === "scatter" ? 0.16 : 0.07), 0.5);
      if (f.weapon === "pistol") this.sfx.shotPistol();
      else if (f.weapon === "scatter") this.sfx.shotScatter();
      else this.sfx.shotRail();
    } else {
      const d = this.camera.position.distanceTo(f.pos);
      if (d < 34) {
        if (f.weapon === "pistol") this.sfx.shotPistol(d);
        else if (f.weapon === "scatter") this.sfx.shotScatter(d);
        else this.sfx.shotRail(d);
      }
      if (f.hum) f.hum.visor.emissiveIntensity = 4.5;
    }

    if (guestVisual) return;

    let killed = 0;
    for (const h of victims) if (this.damage(h.f, f, f.weapon)) killed++;
    if (f.isSelf && victims.length > 0) {
      this.hits += victims.length;
      this.sfx.hitmarker();
      this.cb.onHit(killed > 0);
      if (killed >= 2) this.sfx.multiKill(killed);
    }
  }

  private damage(victim: Fighter, attacker: Fighter, weapon: WeaponId): boolean {
    if (victim.shield) {
      victim.shield = false;
      this.burst(this.tmpV.copy(victim.pos).add(this.tmpV2.set(0, 1, 0)), 0x37ffb4, 18, 5, 0.5, 6);
      this.sfx.shieldBreak();
      if (victim.isSelf) this.cb.onToast("ÉGIDE ABSORVEU O DISPARO", "warn");
      else if (!victim.isBot) this.remoteEv(victim.id, { k: "toast", msg: "ÉGIDE ABSORVEU O DISPARO", kind: "warn" });
      this.emitHudSoon();
      return false;
    }
    victim.alive = false;
    victim.deaths++;
    victim.streak = 0;
    victim.respawnT = victim.isSelf ? 3 : 2.4;
    victim.lastKiller = attacker.name;
    if (victim.hum) victim.hum.group.visible = false;

    attacker.kills++;
    attacker.streak++;
    attacker.bestStreak = Math.max(attacker.bestStreak, attacker.streak);
    const bonus = 100 + 50 * (attacker.streak - 1);
    attacker.score += bonus;

    const boom = this.tmpV.copy(victim.pos).add(this.tmpV2.set(0, 1, 0));
    this.burst(boom, victim.colorHex, 26, 7, 0.7, 10);
    this.burst(boom, 0xffffff, 10, 9, 0.4, 10);

    this.cb.onFeed({
      id: ++this.feedId,
      killer: attacker.name, kColor: "#" + attacker.colorHex.toString(16).padStart(6, "0"),
      victim: victim.name, vColor: "#" + victim.colorHex.toString(16).padStart(6, "0"),
      weapon: WEAPONS[weapon].label,
      pKiller: attacker.isSelf, pVictim: victim.isSelf,
    });

    if (attacker.isSelf) {
      this.sfx.kill();
      this.cb.onToast(`ELIMINAÇÃO +${bonus}`, "kill");
      this.streakToast(attacker);
    } else if (!attacker.isBot) {
      this.remoteEv(attacker.id, { k: "hit", kill: true });
      this.remoteEv(attacker.id, { k: "toast", msg: `ELIMINAÇÃO +${bonus}`, kind: "kill" });
      if (attacker.streak === 3) this.remoteEv(attacker.id, { k: "toast", msg: "SEQUÊNCIA ×3", kind: "info" });
      if (attacker.streak === 5) this.remoteEv(attacker.id, { k: "toast", msg: "IMPARÁVEL ×5", kind: "info" });
      if (attacker.streak === 8) this.remoteEv(attacker.id, { k: "toast", msg: "LENDÁRIO ×8", kind: "info" });
    }
    if (victim.isSelf) {
      this.shake = 1;
      this.sfx.death();
      this.burst(this.camera.position, 0xff3860, 20, 5, 0.6, 8);
      this.cb.onDamaged(attacker.name);
    } else if (!victim.isBot) {
      this.remoteEv(victim.id, { k: "dmg", by: attacker.name });
    }
    this.emitHudSoon();
    return true;
  }

  private streakToast(attacker: Fighter): void {
    if (attacker.streak === 3) { this.cb.onToast("SEQUÊNCIA ×3", "info"); this.sfx.streak(); }
    else if (attacker.streak === 5) { this.cb.onToast("IMPARÁVEL ×5", "info"); this.sfx.streak(); }
    else if (attacker.streak === 8) { this.cb.onToast("LENDÁRIO ×8", "info"); this.sfx.streak(); }
  }

  /* ---------------------------------- IA ---------------------------------- */

  private hasLOS(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const d = this.losD.copy(to).sub(from);
    const dist = d.length();
    if (dist < 0.001) return true;
    d.normalize();
    const t = this.rayBoxes(from, d);
    return t === null || t > dist;
  }

  private botDecide(bot: Fighter): void {
    const b = bot.brain!;
    let best: Fighter | null = null;
    let bd = 46;
    const eye = this.tmpV.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
    for (const e of this.fighters) {
      if (e === bot || !e.alive || e.spawnProt > 0) continue;
      const d = e.pos.distanceTo(bot.pos);
      if (d < bd) {
        const head = this.tmpV2.set(e.pos.x, e.pos.y + 1.2, e.pos.z);
        if (this.hasLOS(eye, head)) { best = e; bd = d; }
      }
    }
    if (best !== b.target) {
      b.target = best;
      if (best) b.react = this.diff.react[0] + Math.random() * (this.diff.react[1] - this.diff.react[0]) + (1 - b.skill) * 0.2;
    }
    let padTarget: Pad | null = null;
    let padD = 999;
    for (const pad of this.pads) {
      if (!pad.active) continue;
      const d = pad.pos.distanceTo(bot.pos);
      if (d < padD) { padD = d; padTarget = pad; }
    }
    if (!b.target || (padTarget && padD < 14 && padD < bd * 0.75)) {
      if (padTarget) b.wp.set(padTarget.pos.x, 0, padTarget.pos.z);
      else if (b.wp.distanceTo(bot.pos) < 2.5 || !this.pointFree(b.wp.x, b.wp.z, 0.6)) b.wp = this.randomWaypoint();
    }
  }

  private updateBot(bot: Fighter, dt: number): void {
    const b = bot.brain!;
    b.decide -= dt;
    b.strafeT -= dt;
    b.react -= dt;
    if (b.decide <= 0) {
      b.decide = 0.11 + Math.random() * 0.06;
      this.botDecide(bot);
    }

    const wish = this.tmpV2.set(0, 0, 0);
    const speed = bot.hasteT > 0 ? 8.2 : 5.6;
    let wantJump = false;
    const target = b.target && b.target.alive ? b.target : null;
    if (target) {
      const dx = target.pos.x - bot.pos.x, dz = target.pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (b.strafeT <= 0) { b.strafe *= -1; b.strafeT = 0.55 + Math.random() * 0.95; }
      const px = -dz / (dist || 1), pz = dx / (dist || 1);
      const radial = dist > 17 ? 0.75 : dist < 7 ? -0.7 : 0;
      wish.set(px * b.strafe * 0.92 + (dx / (dist || 1)) * radial, 0, pz * b.strafe * 0.92 + (dz / (dist || 1)) * radial);
      bot.yaw = Math.atan2(dx, dz);
      if (bot.fire <= 0 && b.react <= 0 && dist < 42) {
        const eye = this.tmpV3.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
        const head = this.tmpV.set(target.pos.x, target.pos.y + 1.1, target.pos.z);
        if (this.hasLOS(eye, head)) {
          const aim = new THREE.Vector3().copy(head).sub(eye).normalize();
          const err = b.err + 0.012 + Math.min(dist * 0.0012, 0.03);
          aim.x += (Math.random() * 2 - 1) * err;
          aim.y += (Math.random() * 2 - 1) * err * 0.7;
          aim.z += (Math.random() * 2 - 1) * err;
          aim.normalize();
          this.fireWeapon(bot, aim);
          bot.fire += b.cadence + Math.random() * 0.12;
        }
      }
    } else {
      const dx = b.wp.x - bot.pos.x, dz = b.wp.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.2) {
        wish.set(dx / dist, 0, dz / dist);
        bot.yaw = Math.atan2(dx, dz);
      }
      const ahead = this.tmpV.set(bot.pos.x + wish.x * 1.9, bot.pos.y + 0.9, bot.pos.z + wish.z * 1.9);
      let blocked = false;
      let blockTop = 0;
      for (const bx of this.colliders) {
        if (ahead.x > bx.min.x && ahead.x < bx.max.x && ahead.z > bx.min.z && ahead.z < bx.max.z && bx.max.y > bot.pos.y + 0.2 && bx.min.y < bot.pos.y + 1.7) {
          blocked = true;
          blockTop = Math.max(blockTop, bx.max.y);
        }
      }
      if (blocked) {
        if (blockTop - bot.pos.y < 1.05 && bot.grounded) wantJump = true;
        const ang = 0.8 * b.strafe;
        const wx = wish.x * Math.cos(ang) - wish.z * Math.sin(ang);
        const wz = wish.x * Math.sin(ang) + wish.z * Math.cos(ang);
        wish.set(wx, 0, wz);
        b.stuck += dt;
        if (b.stuck > 0.7) { b.stuck = 0; b.strafe *= -1; b.wp = this.randomWaypoint(); }
      } else b.stuck = 0;
    }

    if (wantJump) this.tryJump(bot, true);
    else this.tryJump(bot, false);
    this.moveEntity(bot, dt, wish, speed);

    bot.fire -= dt;
    if (bot.spawnProt > 0) bot.spawnProt -= dt;
    if (bot.hasteT > 0) {
      bot.hasteT -= dt;
      this.trailAcc += dt;
      if (this.trailAcc > 0.05) {
        this.trailAcc = 0;
        this.burst(this.tmpV.copy(bot.pos).add(this.tmpV2.set(0, 0.2, 0)), 0xaef3ff, 1, 0.6, 0.3, 0);
      }
    }
    if (bot.weapon !== "pistol") {
      bot.weaponT -= dt;
      if (bot.weaponT <= 0) bot.weapon = "pistol";
    }
    if (bot.hum && bot.hum.visor.emissiveIntensity > 2.6) bot.hum.visor.emissiveIntensity = 2.6;
  }

  /* --------------------------- humano remoto (host) ------------------------ */

  private updateRemoteHuman(f: Fighter, dt: number): void {
    const inp = f.input;
    f.yaw = inp.yaw;
    f.pitch = inp.pitch;
    /* mesmos vetores da câmera do convidado (ordem YXZ, -Z é a frente) */
    const fwd = new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
    const rgt = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    const wish = new THREE.Vector3().addScaledVector(fwd, inp.f).addScaledVector(rgt, inp.s);
    if (wish.lengthSq() > 1) wish.normalize();
    const speed = f.hasteT > 0 ? 8.7 : 6.1;
    this.tryJump(f, inp.j);
    this.moveEntity(f, dt, wish, speed);

    if (inp.fire && !f.prevFire) {
      this.aimE.set(inp.pitch, inp.yaw, 0);
      this.aimV.set(0, 0, -1).applyEuler(this.aimE);
      this.fireWeapon(f, this.aimV);
    }
    f.prevFire = inp.fire;

    f.fire -= dt;
    if (f.spawnProt > 0) f.spawnProt -= dt;
    if (f.hasteT > 0) f.hasteT -= dt;
    if (f.weapon !== "pistol") {
      f.weaponT -= dt;
      if (f.weaponT <= 0) {
        f.weapon = "pistol";
        this.remoteEv(f.id, { k: "toast", msg: "ARMA ESPECIAL ESGOTADA", kind: "warn" });
      }
    }
  }

  /* ------------------------------ loop principal -------------------------- */

  private frame = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (!this.paused) {
      if (this.phase === "countdown") this.updateCountdown(dt);
      else if (this.phase === "playing") this.update(dt);
      else if (this.phase === "ended") {
        this.endT -= dt;
        if (this.endT <= 0 && !this.endSent) {
          this.endSent = true;
          this.sendEnd();
        }
      }
      const simPads = this.role !== "guest" && this.phase === "playing";
      this.updatePads(dt, simPads);
      if (this.role === "guest") this.guestInterpolate(dt);
      this.updateHumanoids(dt);
      this.updateParticles(dt);
      this.updateTracers(dt);

      if (this.role === "host" && this.phase !== "idle") {
        this.netAcc += dt;
        if (this.netAcc >= 0.05) {
          this.netAcc = 0;
          this.cb.onSnapshot?.(this.buildSnapshot());
        }
      }
    }
    this.syncCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private guestInterpolate(dt: number): void {
    const k = 1 - Math.exp(-14 * dt);
    for (const f of this.fighters) {
      if (f.isSelf || !f.snap) continue;
      f.pos.x += (f.snap.x - f.pos.x) * k;
      f.pos.y += (f.snap.y - f.pos.y) * k;
      f.pos.z += (f.snap.z - f.pos.z) * k;
      f.yaw = angLerp(f.yaw, f.snap.yaw, k);
    }
  }

  private updateHumanoids(dt: number): void {
    for (const f of this.fighters) {
      if (f.isSelf || !f.hum) continue;
      const hum = f.hum.group;
      if (!f.alive) { hum.visible = false; continue; }
      hum.position.copy(f.pos);
      hum.rotation.y = f.yaw;
      if (f.spawnProt > 0) hum.visible = Math.floor(performance.now() / 90) % 2 === 0;
      else hum.visible = true;

      const speed = Math.hypot(f.pos.x - f.prevX, f.pos.z - f.prevZ) / Math.max(dt, 1e-4);
      f.prevX = f.pos.x; f.prevZ = f.pos.z;
      const ampTarget = Math.min(1, speed / 5.5) * (f.grounded ? 1 : 0.4);
      f.animAmp += (ampTarget - f.animAmp) * Math.min(1, dt * 10);
      f.animPhase += dt * (4 + speed * 1.5);
      const h = f.hum;
      const sw = Math.sin(f.animPhase) * 0.62 * f.animAmp;
      h.legL.rotation.x = sw;
      h.legR.rotation.x = -sw;
      h.armL.rotation.x = -sw * 0.75;
      h.armR.rotation.x = -1.25 + sw * 0.28;
      h.group.position.y = f.pos.y + Math.abs(Math.sin(f.animPhase)) * 0.045 * f.animAmp;
      if (!f.grounded) { h.legL.rotation.x = 0.4; h.legR.rotation.x = -0.25; }
    }
  }

  private updateCountdown(dt: number): void {
    if (this.role === "guest") return; /* o convidado segue o snapshot */
    this.countdown -= dt;
    const c = Math.ceil(this.countdown);
    if (c !== this.lastCount && c > 0) {
      this.lastCount = c;
      this.cb.onCountdown(c);
      this.sfx.beep();
    }
    if (this.countdown <= 0) {
      this.phase = "playing";
      this.time = this.cfg.duration;
      this.cb.onCountdown(0);
      this.sfx.beep(true);
      this.emitHud();
    }
  }

  private update(dt: number): void {
    this.time -= dt;
    if (this.time <= 5.05 && this.time + dt > 5.05) this.startBeeps();
    if (this.time <= 0) {
      this.time = 0;
      this.phase = "ended";
      this.endT = 1.5;
      const rows = this.buildRows();
      const rank = rows.findIndex((r) => r.isPlayer);
      this.sfx.fanfare(rank === 0);
      this.firing = false;
      if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
      this.emitHud();
      return;
    }

    /* jogador local */
    const p = this.player;
    p.fire -= dt;
    if (p.spawnProt > 0) p.spawnProt -= dt;
    if (p.hasteT > 0) {
      p.hasteT -= dt;
      this.trailAcc += dt;
      if (this.trailAcc > 0.045) {
        this.trailAcc = 0;
        this.burst(this.tmpV.copy(p.pos).add(this.tmpV2.set(0, 0.2, 0)), 0xaef3ff, 1, 0.5, 0.28, 0);
      }
    }
    if (p.weapon !== "pistol") {
      p.weaponT -= dt;
      if (p.weaponT <= 0) {
        p.weapon = "pistol";
        this.gunStrip.emissive.setHex(0x00e5ff);
        this.gunStrip.color.setHex(0x00e5ff);
        this.cb.onToast("ARMA ESPECIAL ESGOTADA", "warn");
      }
    }

    if (p.alive) {
      const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const wish = new THREE.Vector3();
      let inF = 0, inR = 0;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) inF += 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) inF -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) inR += 1;
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) inR -= 1;
      wish.addScaledVector(f, inF + this.touchMove.y).addScaledVector(r, inR + this.touchMove.x);
      if (wish.lengthSq() > 1) wish.normalize();
      const speed = p.hasteT > 0 ? 8.7 : 6.1;
      this.tryJump(p, this.keys.has("Space"));
      p.coyote -= dt; p.jbuf -= dt;
      this.moveEntity(p, dt, wish, speed);
      if (this.firing && (this.locked || this.isCoarse)) this.fireWeapon(p, null);
    } else {
      p.respawnT -= dt;
      if (this.role !== "guest" && p.respawnT <= 0) this.spawnFighter(p);
    }

    /* outros combatentes */
    for (const f of this.fighters) {
      if (f.isSelf) continue;
      if (this.role === "guest") continue; /* convidados não simulam os demais */
      if (f.isBot) {
        if (f.alive) this.updateBot(f, dt);
        else {
          f.respawnT -= dt;
          if (f.respawnT <= 0) this.spawnFighter(f);
        }
      } else {
        if (f.alive) this.updateRemoteHuman(f, dt);
        else {
          f.respawnT -= dt;
          if (f.respawnT <= 0) this.spawnFighter(f);
        }
      }
    }

    this.hudAcc += dt;
    if (this.hudAcc >= 1 / 12) {
      this.hudAcc = 0;
      this.emitHud();
    }
  }

  private beepTrack = 0;
  private startBeeps(): void {
    if (this.beepTrack) return;
    this.beepTrack = 1;
    const tick = () => {
      if (this.phase !== "playing" || this.disposed || this.paused) { this.beepTrack = 0; return; }
      const whole = Math.ceil(this.time);
      if (this.time <= 0) { this.beepTrack = 0; return; }
      this.sfx.beep(whole <= 1);
      setTimeout(tick, 1000);
    };
    tick();
  }

  /* -------------------------------- câmera -------------------------------- */

  private syncCamera(dt: number): void {
    const p = this.player;
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.gunKick = Math.max(0, this.gunKick - dt * 0.5);
    this.recoilPitch = Math.max(0, this.recoilPitch - dt * 0.12);
    this.flashT = Math.max(0, this.flashT - dt);

    const horiz = Math.hypot(p.vel.x, p.vel.z);
    if (p.alive && p.grounded) this.bobT += horiz * dt * 1.6;
    const bobY = p.alive && p.grounded ? Math.sin(this.bobT * 5.2) * 0.03 * Math.min(horiz / 6, 1) : 0;

    this.camera.position.set(
      p.pos.x + (Math.random() * 2 - 1) * this.shake * 0.09,
      p.pos.y + EYE + bobY + (Math.random() * 2 - 1) * this.shake * 0.09,
      p.pos.z + (Math.random() * 2 - 1) * this.shake * 0.09
    );
    this.camera.rotation.y = this.yaw;
    const targetPitch = p.alive ? this.pitch + this.recoilPitch : -0.55;
    this.camera.rotation.x += (targetPitch - this.camera.rotation.x) * Math.min(1, dt * (p.alive ? 30 : 3));
    this.camera.rotation.z = (Math.random() * 2 - 1) * this.shake * 0.02;

    this.gun.position.set(0.3, -0.26 + bobY * 0.5, -0.5 + this.gunKick);
    this.gun.visible = p.alive;
    (this.muzzle.material as THREE.MeshBasicMaterial).opacity = this.flashT > 0 ? 0.9 : 0;
    this.muzzle.rotation.z = Math.random() * Math.PI;
    this.muzzleLight.intensity = this.flashT > 0 ? 26 : 0;
  }

  /* -------------------------------- minimapa ------------------------------ */

  drawMinimap(cv: HTMLCanvasElement): void {
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const S = cv.width;
    const sc = S / (ARENA + 6);
    const toX = (x: number) => S / 2 + x * sc;
    const toY = (z: number) => S / 2 + z * sc;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = "rgba(4,15,19,0.78)";
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "rgba(0,229,255,0.25)";
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
    /* obstáculos */
    ctx.fillStyle = "rgba(111,163,176,0.28)";
    for (const b of this.colliders) {
      if (b.max.y < 0.5) continue;
      const x = toX(b.min.x), y = toY(b.min.z);
      ctx.fillRect(x, y, (b.max.x - b.min.x) * sc, (b.max.z - b.min.z) * sc);
    }
    /* power-ups */
    for (const pad of this.pads) {
      if (!pad.active) continue;
      const c = "#" + POWER_COLOR[pad.type].toString(16).padStart(6, "0");
      ctx.fillStyle = c;
      ctx.save();
      ctx.translate(toX(pad.pos.x), toY(pad.pos.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
      ctx.restore();
    }
    /* combatentes */
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const c = "#" + f.colorHex.toString(16).padStart(6, "0");
      if (f.isSelf) {
        ctx.save();
        ctx.translate(toX(f.pos.x), toY(f.pos.z));
        ctx.rotate(-f.yaw + Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(0, -5.5); ctx.lineTo(4, 4); ctx.lineTo(-4, 4);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(toX(f.pos.x), toY(f.pos.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ---------------------------------- HUD --------------------------------- */

  private hudSoonT = 0;
  private emitHudSoon(): void {
    if (this.hudSoonT) return;
    this.hudSoonT = window.setTimeout(() => {
      this.hudSoonT = 0;
      this.emitHud();
    }, 40);
  }

  private buildRows(): ScoreRow[] {
    return this.fighters
      .map((f) => ({
        name: f.name,
        color: "#" + f.colorHex.toString(16).padStart(6, "0"),
        kills: f.kills, deaths: f.deaths, score: f.score, streak: f.streak,
        isPlayer: f.isSelf, alive: f.alive,
      }))
      .sort((a, b) => b.score - a.score || b.kills - a.kills);
  }

  private emitHud(): void {
    const p = this.player;
    this.cb.onHud({
      phase: this.phase,
      time: this.time,
      duration: this.cfg.duration,
      score: p.score, kills: p.kills, deaths: p.deaths, streak: p.streak,
      weapon: p.weapon,
      weaponT: p.weapon === "pistol" ? -1 : p.weaponT,
      shield: p.shield,
      hasteT: p.hasteT,
      respawn: p.alive ? 0 : Math.max(0, p.respawnT),
      lastKiller: p.lastKiller,
      rows: this.buildRows(),
      shots: this.shots, hits: this.hits, bestStreak: p.bestStreak,
    });
  }

  private sendEnd(): void {
    const rows = this.buildRows();
    const rank = rows.findIndex((r) => r.isPlayer);
    this.cb.onEnd(rows, rank, rank === 0);
  }

  /** Placar com slot de rede (usado no evento de fim para convidados). */
  getFinalRows(): Array<ScoreRow & { slot: number }> {
    return this.fighters
      .map((f) => ({
        slot: f.id,
        name: f.name,
        color: "#" + f.colorHex.toString(16).padStart(6, "0"),
        kills: f.kills, deaths: f.deaths, score: f.score, streak: f.streak,
        isPlayer: f.isSelf, alive: f.alive,
      }))
      .sort((a, b) => b.score - a.score || b.kills - a.kills);
  }

  /* --------------------------------- teardown ----------------------------- */

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
