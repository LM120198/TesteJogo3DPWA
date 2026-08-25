/* VETOR-12 — Motor da arena (Three.js)
 * FFA 12 combatentes · um tiro elimina · rodada cronometrada · power-ups.
 * Arquiteturado como simulação autoritativa local: a mesma classe de
 * simulação (hitscan, colisões AABB, física) é o que rodaria no servidor.
 */
import * as THREE from "three";
import { AudioFX } from "./audio";

export type WeaponId = "pistol" | "scatter" | "rail";
export type PowerId = WeaponId | "shield" | "haste";
export type Phase = "idle" | "countdown" | "playing" | "ended";

export interface MatchConfig {
  botCount: number;
  duration: number;
}

export interface ScoreRow {
  name: string;
  color: string;
  kills: number;
  deaths: number;
  score: number;
  streak: number;
  isPlayer: boolean;
  alive: boolean;
}

export interface FeedEntry {
  id: number;
  killer: string;
  kColor: string;
  victim: string;
  vColor: string;
  weapon: string;
  pKiller: boolean;
  pVictim: boolean;
}

export interface HudData {
  phase: Phase;
  time: number;
  duration: number;
  score: number;
  kills: number;
  deaths: number;
  streak: number;
  weapon: WeaponId;
  weaponT: number;
  shield: boolean;
  hasteT: number;
  respawn: number;
  lastKiller: string;
  rows: ScoreRow[];
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
}

/* ------------------------------- constantes ------------------------------ */

const ARENA = 56;
const HALF = ARENA / 2;
const WALL_H = 6;
const EYE = 1.62;
const GRAV = 22;
const JUMP = 7.7;
const BODY_R = 0.42;
const BODY_H = 1.8;
const WEAPON_TIME = 8;

const WEAPONS: Record<WeaponId, { label: string; cd: number; color: number; pellets: number; spread: number; pierce: boolean }> = {
  pistol: { label: "PULSO-9", cd: 0.16, color: 0x00e5ff, pellets: 1, spread: 0.012, pierce: false },
  scatter: { label: "DISPERSSOR", cd: 0.72, color: 0xffb300, pellets: 7, spread: 0.055, pierce: false },
  rail: { label: "TRILHO-X", cd: 0.6, color: 0xff3860, pellets: 1, spread: 0.0, pierce: true },
};

const POWER_COLOR: Record<PowerId, number> = {
  pistol: 0x00e5ff,
  scatter: 0xffb300,
  rail: 0xff3860,
  shield: 0x37ffb4,
  haste: 0xaef3ff,
};

const POWER_LABEL: Record<PowerId, string> = {
  pistol: "PULSO-9",
  scatter: "DISPERSSOR",
  rail: "TRILHO-X",
  shield: "ÉGIDE",
  haste: "SURTO",
};

const BOT_NAMES = ["VEGA", "KRON", "NOVA", "DANT", "RIFT", "HALO", "ZULU", "LYRA", "BRUT", "ECHO", "ONYX"];
const BOT_COLORS = [0xff3860, 0xffb300, 0x37ffb4, 0xf78c6b, 0x7cf5ff, 0xc8ff4d, 0xff8a3d, 0x5ad1e6, 0xffd166, 0x06d6a0, 0xef476f];

const SPAWNS: Array<[number, number]> = [
  [-24, -24], [24, -24], [-24, 24], [24, 24], [0, -24], [0, 24], [-24, 0], [24, 0],
];

function approach(cur: number, target: number, delta: number): number {
  if (cur < target) return Math.min(cur + delta, target);
  return Math.max(cur - delta, target);
}

/* --------------------------------- entidades ----------------------------- */

interface BotBrain {
  wp: THREE.Vector3;
  decide: number;
  strafe: number;
  strafeT: number;
  target: Fighter | null;
  react: number;
  skill: number;
  stuck: number;
}

interface Fighter {
  id: number;
  name: string;
  colorHex: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  grounded: boolean;
  alive: boolean;
  respawnT: number;
  spawnProt: number;
  weapon: WeaponId;
  weaponT: number;
  shield: boolean;
  hasteT: number;
  kills: number;
  deaths: number;
  score: number;
  streak: number;
  bestStreak: number;
  isPlayer: boolean;
  fire: number;
  lastKiller: string;
  mesh: THREE.Group | null;
  visorMat: THREE.MeshStandardMaterial | null;
  brain: BotBrain | null;
}

interface Pad {
  pos: THREE.Vector3;
  cycle: PowerId[];
  idx: number;
  active: boolean;
  t: number;
  type: PowerId;
  group: THREE.Group;
  gem: THREE.Mesh;
  gemWire: THREE.Mesh;
  beam: THREE.Mesh;
  gemMat: THREE.MeshBasicMaterial;
  beamMat: THREE.MeshBasicMaterial;
}

interface Tracer {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  max: number;
}

/* ---------------------------------- motor -------------------------------- */

export class ArenaEngine {
  private container: HTMLElement;
  private cfg: MatchConfig;
  private cb: EngineCallbacks;
  readonly sfx = new AudioFX();

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  private colliders: THREE.Box3[] = [];
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
  private shake = 0;

  /* input */
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private firing = false;
  private touchMove = new THREE.Vector2(0, 0);
  private locked = false;

  /* fx */
  private pCount = 460;
  private pPos!: Float32Array;
  private pVel!: Float32Array;
  private pCol!: Float32Array;
  private pBase!: Float32Array;
  private pLife!: Float32Array;
  private pMax!: Float32Array;
  private pGrav!: Float32Array;
  private pGeo!: THREE.BufferGeometry;
  private rcC = new THREE.Vector3();
  private losD = new THREE.Vector3();
  private trV = new THREE.Vector3();
  private muzzleV = new THREE.Vector3();
  private muzzle!: THREE.Mesh;
  private muzzleLight!: THREE.PointLight;
  private gun!: THREE.Group;
  private gunStrip!: THREE.MeshStandardMaterial;
  private gunKick = 0;
  private recoilPitch = 0;
  private flashT = 0;
  private bobT = 0;
  private trailAcc = 0;

  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpV3 = new THREE.Vector3();
  private tmpBox = new THREE.Box3();
  private isCoarse = false;

  constructor(container: HTMLElement, cfg: MatchConfig, cb: EngineCallbacks) {
    this.container = container;
    this.cfg = cfg;
    this.cb = cb;
  }

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
    this.scene.background = new THREE.Color(0x06141b);
    this.scene.fog = new THREE.FogExp2(0x06141b, 0.013);

    this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.08, 200);
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

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0x8fd8ff, 0x0a1f26, 0.55);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xcfefff, 0.9);
    dir.position.set(18, 26, 12);
    dir.castShadow = this.renderer.shadowMap.enabled;
    dir.shadow.mapSize.set(1024, 1024);
    const s = 32;
    dir.shadow.camera.left = -s; dir.shadow.camera.right = s;
    dir.shadow.camera.top = s; dir.shadow.camera.bottom = -s;
    dir.shadow.camera.far = 80;
    this.scene.add(dir);
    const core = new THREE.PointLight(0x00e5ff, 60, 46, 1.8);
    core.position.set(0, 9, 0);
    this.scene.add(core);
    const warm = new THREE.PointLight(0xffb300, 40, 40, 1.8);
    warm.position.set(-19, 7, -19);
    this.scene.add(warm);
  }

  private addBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number, emissive = 0): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.12 });
    if (emissive) { mat.emissive = new THREE.Color(emissive); mat.emissiveIntensity = 1.6; mat.roughness = 0.4; }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz)));
    return mesh;
  }

  private addGlow(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number): void {
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(cx, cy, cz);
    this.scene.add(mesh);
  }

  private buildArena(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA, ARENA),
      new THREE.MeshStandardMaterial({ color: 0x0a222b, roughness: 0.92, metalness: 0.08 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(ARENA, 28, 0x147487, 0x0c3b47);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    grid.position.y = 0.02;
    this.scene.add(grid);

    /* perímetro */
    const wT = 1;
    this.addBox(0, WALL_H / 2, -HALF - wT / 2, ARENA + wT * 2, WALL_H, wT, 0x0d2833);
    this.addBox(0, WALL_H / 2, HALF + wT / 2, ARENA + wT * 2, WALL_H, wT, 0x0d2833);
    this.addBox(-HALF - wT / 2, WALL_H / 2, 0, wT, WALL_H, ARENA, 0x0d2833);
    this.addBox(HALF + wT / 2, WALL_H / 2, 0, wT, WALL_H, ARENA, 0x0d2833);
    this.addGlow(0, 2.1, -HALF + 0.02, ARENA, 0.12, 0.06, 0xffb300);
    this.addGlow(0, 2.1, HALF - 0.02, ARENA, 0.12, 0.06, 0xffb300);
    this.addGlow(-HALF + 0.02, 4.2, 0, 0.06, 0.12, ARENA, 0x00e5ff);
    this.addGlow(HALF - 0.02, 4.2, 0, 0.06, 0.12, ARENA, 0x00e5ff);
    for (const [cx, cz] of [[-HALF + 0.8, -HALF + 0.8], [HALF - 0.8, -HALF + 0.8], [-HALF + 0.8, HALF - 0.8], [HALF - 0.8, HALF - 0.8]] as Array<[number, number]>) {
      this.addBox(cx, 3.5, cz, 1.6, 7, 1.6, 0x0f2f3a);
      this.addGlow(cx, 3.5, cz, 0.18, 6.4, 0.18, 0xff3860);
    }

    /* plataforma central + escadas (degraus de 0.8 — saltáveis) */
    this.addBox(0, 1.2, 0, 12, 2.4, 12, 0x0e2a35);
    this.addGlow(0, 2.42, -6.02, 12.2, 0.08, 0.14, 0xffb300);
    this.addGlow(0, 2.42, 6.02, 12.2, 0.08, 0.14, 0xffb300);
    this.addGlow(-6.02, 2.42, 0, 0.14, 0.08, 12.2, 0xffb300);
    this.addGlow(6.02, 2.42, 0, 0.14, 0.08, 12.2, 0xffb300);
    this.addBox(7.3, 0.8, 0, 2.6, 1.6, 5, 0x0e2a35);
    this.addBox(9.9, 0.4, 0, 2.6, 0.8, 5, 0x0e2a35);

    /* caixas e coberturas */
    this.addBox(-17, 1.1, -17, 3.4, 2.2, 3.4, 0x123844);
    this.addBox(17, 0.8, -15, 4, 1.6, 3, 0x123844);
    this.addBox(-15, 0.9, 16, 3, 1.8, 4, 0x123844);
    this.addBox(16.5, 1.3, 16.5, 2.6, 2.6, 2.6, 0x123844);
    this.addBox(-4, 0.65, -13, 8, 1.3, 0.5, 0x10313c);
    this.addBox(4, 0.65, 13, 8, 1.3, 0.5, 0x10313c);
    this.addBox(-13, 0.65, 4, 0.5, 1.3, 8, 0x10313c);
    this.addBox(13, 0.65, -4, 0.5, 1.3, 8, 0x10313c);
    this.addBox(9, 2.5, -9, 1.4, 5, 1.4, 0x0e2a35);
    this.addBox(-9, 2.5, 9, 1.4, 5, 1.4, 0x0e2a35);
    this.addGlow(9, 4.4, -9, 0.16, 1.2, 0.16, 0x00e5ff);
    this.addGlow(-9, 4.4, 9, 0.16, 1.2, 0.16, 0x00e5ff);

    /* halo no horizonte */
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(60, 120, 48),
      new THREE.MeshBasicMaterial({ color: 0x0a3540, side: THREE.DoubleSide, fog: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.4;
    this.scene.add(halo);
  }

  /* ------------------------------ partículas ------------------------------ */

  private buildParticles(): void {
    const n = this.pCount;
    this.pPos = new Float32Array(n * 3);
    this.pVel = new Float32Array(n * 3);
    this.pCol = new Float32Array(n * 3);
    this.pBase = new Float32Array(n * 3);
    this.pLife = new Float32Array(n);
    this.pMax = new Float32Array(n);
    this.pGrav = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pPos[i * 3 + 1] = -50;
    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.pGeo.setAttribute("color", new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      size: 0.17, vertexColors: true, blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true,
    });
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
    const defs: Array<{ p: [number, number, number]; cycle: PowerId[] }> = [
      { p: [0, 2.4, 0], cycle: ["rail"] },
      { p: [0, 0, 10.5], cycle: ["scatter", "shield", "haste"] },
      { p: [0, 0, -10.5], cycle: ["rail", "haste", "scatter"] },
      { p: [-10.5, 0, 0], cycle: ["shield", "scatter", "rail"] },
      { p: [18, 0, 10], cycle: ["haste", "rail", "shield"] },
    ];
    const gemGeo = new THREE.OctahedronGeometry(0.34);
    const wireGeo = new THREE.OctahedronGeometry(0.52);
    const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 4.2, 10, 1, true);
    for (const d of defs) {
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
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 24), new THREE.MeshBasicMaterial({ color: POWER_COLOR[type], transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      group.add(gem, gemWire, beam, ring);
      this.scene.add(group);
      this.pads.push({
        pos: group.position.clone(), cycle: d.cycle, idx: 0, active: true, t: 0, type,
        group, gem, gemWire, beam, gemMat, beamMat,
      });
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
          pad.gemMat.color.setHex(POWER_COLOR[pad.type]);
          (pad.gemWire.material as THREE.MeshBasicMaterial).color.setHex(POWER_COLOR[pad.type]);
          pad.beamMat.color.setHex(POWER_COLOR[pad.type]);
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
        if (!f.alive) continue;
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

  private applyPower(f: Fighter, type: PowerId): void {
    if (type === "shield") {
      f.shield = true;
      if (f.isPlayer) { this.cb.onToast("ÉGIDE ATIVA — ABSORVE 1 DISPARO", "pickup"); this.sfx.pickup(); }
    } else if (type === "haste") {
      f.hasteT = 6;
      if (f.isPlayer) { this.cb.onToast("SURTO — VELOCIDADE AMPLIFICADA", "pickup"); this.sfx.pickup(); }
    } else {
      f.weapon = type;
      f.weaponT = WEAPON_TIME;
      if (f.isPlayer) {
        this.cb.onToast(`${WEAPONS[type].label} EQUIPADO — ${WEAPON_TIME}s`, "pickup");
        this.sfx.pickup();
        this.gunStrip.emissive.setHex(WEAPONS[type].color);
        this.gunStrip.color.setHex(WEAPONS[type].color);
      }
    }
    if (!f.isPlayer) this.sfx.pickup();
    this.emitHudSoon();
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

  /* ------------------------------- combatentes ---------------------------- */

  private makeFighterMesh(colorHex: number): { group: THREE.Group; visor: THREE.MeshStandardMaterial } {
    const group = new THREE.Group();
    const c = new THREE.Color(colorHex);
    const bodyMat = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.5), roughness: 0.55, metalness: 0.25 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.78, 4, 10), bodyMat);
    body.position.y = 0.78;
    body.castShadow = true;
    const visor = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 2.4, roughness: 0.3 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.24), visor);
    head.position.set(0, 1.42, 0.2);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x10181e, roughness: 0.5, metalness: 0.7 });
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.5), gunMat);
    gun.position.set(0.3, 1.05, 0.28);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 24), new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.75 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    group.add(body, head, gun, ring);
    return { group, visor };
  }

  private buildFighters(): void {
    /* jogador */
    const p: Fighter = {
      id: 0, name: "VOCÊ", colorHex: 0x00e5ff,
      pos: new THREE.Vector3(-24, 0, -24), vel: new THREE.Vector3(), yaw: 0,
      grounded: true, alive: true, respawnT: 0, spawnProt: 0,
      weapon: "pistol", weaponT: 0, shield: false, hasteT: 0,
      kills: 0, deaths: 0, score: 0, streak: 0, bestStreak: 0,
      isPlayer: true, fire: 0, lastKiller: "", mesh: null, visorMat: null, brain: null,
    };
    this.player = p;
    this.fighters.push(p);

    const n = Math.max(1, Math.min(11, this.cfg.botCount));
    for (let i = 0; i < n; i++) {
      const color = BOT_COLORS[i % BOT_COLORS.length];
      const { group, visor } = this.makeFighterMesh(color);
      this.scene.add(group);
      const f: Fighter = {
        id: i + 1, name: BOT_NAMES[i % BOT_NAMES.length], colorHex: color,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: Math.random() * Math.PI * 2,
        grounded: true, alive: true, respawnT: 0, spawnProt: 0,
        weapon: "pistol", weaponT: 0, shield: false, hasteT: 0,
        kills: 0, deaths: 0, score: 0, streak: 0, bestStreak: 0,
        isPlayer: false, fire: 0, lastKiller: "", mesh: group, visorMat: visor,
        brain: {
          wp: new THREE.Vector3(), decide: Math.random() * 0.2, strafe: Math.random() < 0.5 ? -1 : 1,
          strafeT: 1, target: null, react: 0.4, skill: 0.35 + Math.random() * 0.5, stuck: 0,
        },
      };
      this.fighters.push(f);
      this.spawnFighter(f, true);
    }
    this.spawnFighter(p, true);
    this.yaw = Math.atan2(-p.pos.x, -p.pos.z);
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
    f.weapon = "pistol";
    f.weaponT = 0;
    f.shield = false;
    f.hasteT = 0;
    if (f.isPlayer) {
      this.yaw = Math.atan2(-f.pos.x, -f.pos.z);
      this.pitch = 0;
      this.gunStrip.emissive.setHex(0x00e5ff);
      this.gunStrip.color.setHex(0x00e5ff);
      this.sfx.respawn();
    } else if (f.mesh) {
      f.mesh.visible = true;
      if (f.brain) {
        f.brain.target = null;
        f.brain.wp = this.randomWaypoint();
      }
    }
  }

  /* --------------------------------- input -------------------------------- */

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "Tab" || e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked || this.paused) return;
    this.yaw -= e.movementX * 0.0021;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * 0.0021));
  };
  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.sfx.ensure();
      this.firing = true;
    }
  };
  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.firing = false;
  };
  private onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.renderer.domElement;
    this.cb.onLock(this.locked);
    if (this.locked) {
      this.sfx.ensure();
      if (this.phase === "idle") {
        this.phase = "countdown";
        this.countdown = 3.0;
        this.lastCount = -1;
        this.emitHud();
      } else if (this.paused) {
        this.setPaused(false);
      }
    } else if ((this.phase === "playing" || this.phase === "countdown") && !this.disposed) {
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
    } catch {
      /* navegadores com cooldown de pointer-lock: o clique seguinte resolve */
    }
  }

  resume(): void {
    if (!this.paused) return;
    if (this.isCoarse) this.setPaused(false);
    else this.requestLock();
  }

  pauseGame(): void {
    if (!this.paused && (this.phase === "playing" || this.phase === "countdown")) this.setPaused(true);
  }

  /** Inicia a contagem em dispositivos touch (sem pointer lock). */
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
    if (p) { this.keys.clear(); this.firing = false; }
    this.cb.onPause(p);
  }

  /* toque */
  setTouchMove(x: number, y: number): void { this.touchMove.set(x, y); }
  addTouchLook(dx: number, dy: number): void {
    this.yaw -= dx * 0.0042;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0042));
  }
  setFiring(b: boolean): void { this.sfx.ensure(); this.firing = b; }
  touchJump(): void { this.keys.add("Space"); setTimeout(() => this.keys.delete("Space"), 120); }

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
    const accel = f.grounded ? 42 : 14;
    f.vel.x = approach(f.vel.x, wish.x * speed, accel * dt);
    f.vel.z = approach(f.vel.z, wish.z * speed, accel * dt);
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
    c.set(f.pos.x, f.pos.y + 1.66, f.pos.z);
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

    const origin = this.tmpV;
    if (f.isPlayer) {
      this.camera.getWorldPosition(origin);
    } else {
      origin.set(f.pos.x, f.pos.y + 1.45, f.pos.z);
    }

    const fwd = this.tmpV3;
    if (f.isPlayer) {
      this.camera.getWorldDirection(fwd);
    } else {
      fwd.copy(aimDir!);
    }
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
      for (const e of this.fighters) {
        if (e === f || !e.alive || e.spawnProt > 0) continue;
        const t = this.rayFighter(origin, dir, e);
        if (t !== null && t < tW) pelletHits.push({ f: e, t });
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
      if (chosen.length === 0 && tW < 90) {
        const ip = new THREE.Vector3().copy(origin).addScaledVector(dir, tW);
        this.burst(ip, 0x9feaff, 5, 2.4, 0.3, 8);
        if (f.isPlayer) this.sfx.impact();
      }
    }

    /* dedupe (rail perfurante pode registrar o mesmo alvo por pellet — pistol/scatter 1 pellet ou 1 alvo) */
    const uniq = new Map<number, { f: Fighter; t: number }>();
    for (const h of hits) if (!uniq.has(h.f.id) || uniq.get(h.f.id)!.t > h.t) uniq.set(h.f.id, h);
    const victims = [...uniq.values()].sort((a, b) => a.t - b.t);

    /* recuo / flash / som */
    if (f.isPlayer) {
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
      if (f.visorMat) f.visorMat.emissiveIntensity = 4;
    }

    let killed = 0;
    for (const h of victims) {
      if (this.damage(h.f, f, f.weapon)) killed++;
    }
    if (f.isPlayer && victims.length > 0) {
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
      if (victim.isPlayer) this.cb.onToast("ÉGIDE ABSORVEU O DISPARO", "warn");
      this.emitHudSoon();
      return false;
    }
    victim.alive = false;
    victim.deaths++;
    victim.streak = 0;
    victim.respawnT = victim.isPlayer ? 3 : 2.4;
    victim.lastKiller = attacker.name;
    if (victim.mesh) victim.mesh.visible = false;

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
      pKiller: attacker.isPlayer, pVictim: victim.isPlayer,
    });

    if (attacker.isPlayer) {
      this.sfx.kill();
      this.cb.onToast(`ELIMINAÇÃO +${bonus}`, "kill");
      if (attacker.streak === 3) { this.cb.onToast("SEQUÊNCIA ×3", "info"); this.sfx.streak(); }
      else if (attacker.streak === 5) { this.cb.onToast("IMPARÁVEL ×5", "info"); this.sfx.streak(); }
      else if (attacker.streak === 8) { this.cb.onToast("LENDÁRIO ×8", "info"); this.sfx.streak(); }
    }
    if (victim.isPlayer) {
      this.shake = 1;
      this.sfx.death();
      this.burst(this.camera.position, 0xff3860, 20, 5, 0.6, 8);
      this.cb.onDamaged(attacker.name);
    }
    this.emitHudSoon();
    return true;
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
    /* alvo */
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
      if (best) b.react = 0.18 + (1 - b.skill) * 0.4;
    }
    /* power-up próximo */
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
      /* disparo */
      if (bot.fire <= 0 && b.react <= 0 && dist < 42) {
        const eye = this.tmpV3.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
        const head = this.tmpV.set(target.pos.x, target.pos.y + 1.1, target.pos.z);
        if (this.hasLOS(eye, head)) {
          const aim = new THREE.Vector3().copy(head).sub(eye).normalize();
          const err = (1 - b.skill) * 0.085 + 0.012 + Math.min(dist * 0.0012, 0.03);
          aim.x += (Math.random() * 2 - 1) * err;
          aim.y += (Math.random() * 2 - 1) * err * 0.7;
          aim.z += (Math.random() * 2 - 1) * err;
          aim.normalize();
          this.fireWeapon(bot, aim);
          /* cadência humana: bots não disparam no limite teórico da arma */
          bot.fire += (1 - b.skill) * 0.2 + Math.random() * 0.12;
        }
      }
    } else {
      const dx = b.wp.x - bot.pos.x, dz = b.wp.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.2) {
        wish.set(dx / dist, 0, dz / dist);
        bot.yaw = Math.atan2(dx, dz);
      }
      /* sonda de obstáculo à frente */
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

    if (wantJump && bot.grounded) bot.vel.y = JUMP * 0.92;
    this.moveEntity(bot, dt, wish, speed);

    /* decaimentos */
    bot.fire -= dt;
    if (bot.spawnProt > 0) bot.spawnProt -= dt;
    if (bot.hasteT > 0) bot.hasteT -= dt;
    if (bot.weapon !== "pistol") {
      bot.weaponT -= dt;
      if (bot.weaponT <= 0) bot.weapon = "pistol";
    }
    if (bot.visorMat && bot.visorMat.emissiveIntensity > 2.4) bot.visorMat.emissiveIntensity = 2.4;

    /* rastro de surto */
    if (bot.hasteT > 0) {
      this.trailAcc += dt;
      if (this.trailAcc > 0.05) {
        this.trailAcc = 0;
        this.burst(this.tmpV.copy(bot.pos).add(this.tmpV2.set(0, 0.2, 0)), 0xaef3ff, 1, 0.6, 0.3, 0);
      }
    }

    /* sincroniza mesh */
    if (bot.mesh) {
      bot.mesh.position.copy(bot.pos);
      bot.mesh.rotation.y = bot.yaw;
      if (bot.spawnProt > 0) bot.mesh.visible = Math.floor(performance.now() / 90) % 2 === 0;
      else bot.mesh.visible = true;
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
      this.updatePads(dt, this.phase === "playing");
      this.updateParticles(dt);
      this.updateTracers(dt);
    }
    this.syncCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private updateCountdown(dt: number): void {
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

    /* jogador */
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
      /* touchMove: x = strafe (direita +), y = avanço (frente +), no espaço da câmera */
      wish.addScaledVector(f, inF + this.touchMove.y).addScaledVector(r, inR + this.touchMove.x);
      if (wish.lengthSq() > 1) wish.normalize();
      const speed = p.hasteT > 0 ? 8.7 : 6.1;
      if (this.keys.has("Space") && p.grounded) { p.vel.y = JUMP; p.grounded = false; }
      this.moveEntity(p, dt, wish, speed);
      if (this.firing) this.fireWeapon(p, null);
    } else {
      p.respawnT -= dt;
      if (p.respawnT <= 0) this.spawnFighter(p);
    }

    /* bots */
    for (const f of this.fighters) {
      if (f.isPlayer) continue;
      if (f.alive) this.updateBot(f, dt);
      else {
        f.respawnT -= dt;
        if (f.respawnT <= 0) this.spawnFighter(f);
      }
    }

    /* HUD 12 Hz */
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
    const bobY = p.alive && p.grounded ? Math.sin(this.bobT * 5.2) * 0.032 * Math.min(horiz / 6, 1) : 0;

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
        isPlayer: f.isPlayer, alive: f.alive,
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
    });
  }

  private sendEnd(): void {
    const rows = this.buildRows();
    const rank = rows.findIndex((r) => r.isPlayer);
    this.cb.onEnd(rows, rank, rank === 0);
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
