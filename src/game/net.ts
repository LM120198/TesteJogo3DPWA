/* VETOR-12 — Camada de rede (WebRTC P2P, sinalização PeerJS cloud)
 * Modelo host-autoritativo: o anfitrião roda a simulação completa
 * (a mesma classe ArenaEngine) e os convidados enviam inputs 30 Hz,
 * recebendo snapshots de estado 20 Hz + eventos confiáveis.
 */
import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import type { InputFrame, Snapshot } from "./engine";

const PREFIX = "vetor12-arena-";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genCode(): string {
  let c = "";
  for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

export interface StartCfg {
  mapId: string;
  difficulty: number;
  duration: number;
  players: Array<{ slot: number; name: string; host: boolean }>;
}

/* --------------------------------- HOST ---------------------------------- */

export class NetHost {
  peer: Peer;
  code: string;
  ready = false;
  started = false;
  private conns = new Map<number, DataConnection>();
  private names = new Map<number, string>();
  private nextSlot = 1;

  onReady: () => void = () => undefined;
  onError: (msg: string) => void = () => undefined;
  onRoster: (players: Array<{ slot: number; name: string; host: boolean }>) => void = () => undefined;
  onInput: (slot: number, inp: InputFrame) => void = () => undefined;

  constructor() {
    this.code = genCode();
    this.peer = new Peer(PREFIX + this.code);
    this.peer.on("open", () => {
      this.ready = true;
      this.onReady();
    });
    this.peer.on("error", (err: Error & { type?: string }) => {
      if (err.type === "unavailable-id") {
        /* colisão improvável de código — regenera */
        this.peer.destroy();
        this.code = genCode();
        this.peer = new Peer(PREFIX + this.code);
        this.peer.on("open", () => { this.ready = true; this.onReady(); });
      } else {
        this.onError("Falha de conexão com o relé WebRTC. Verifique sua rede.");
      }
    });
    this.peer.on("connection", (conn) => this.accept(conn));
  }

  private accept(conn: DataConnection): void {
    let slot = -1;
    conn.on("open", () => {
      if (this.started || this.conns.size >= 11) {
        conn.send({ t: "full" });
        window.setTimeout(() => conn.close(), 400);
        return;
      }
      slot = this.nextSlot++;
      this.conns.set(slot, conn);
    });
    conn.on("data", (raw) => {
      const d = raw as { t: string; [k: string]: unknown };
      if (d.t === "hello") {
        this.names.set(slot, String(d.name || "PILOTO").slice(0, 12).toUpperCase());
        conn.send({ t: "welcome", slot, players: this.roster() });
        this.broadcast({ t: "roster", players: this.roster() });
        this.onRoster(this.roster());
      } else if (d.t === "input" && slot > 0) {
        this.onInput(slot, d.in as InputFrame);
      }
    });
    const drop = () => {
      if (slot > 0 && this.conns.has(slot)) {
        this.conns.delete(slot);
        this.names.delete(slot);
        this.broadcast({ t: "roster", players: this.roster() });
        this.onRoster(this.roster());
      }
    };
    conn.on("close", drop);
    conn.on("error", drop);
  }

  roster(): Array<{ slot: number; name: string; host: boolean }> {
    const list = [{ slot: 0, name: this.hostName, host: true }];
    this.conns.forEach((_, slot) => list.push({ slot, name: this.names.get(slot) || "PILOTO", host: false }));
    return list.sort((a, b) => a.slot - b.slot);
  }
  hostName = "ANFITRIÃO";

  broadcast(msg: unknown): void {
    this.conns.forEach((c) => { try { c.send(msg); } catch { /* canal fechado */ } });
  }
  sendTo(slot: number, msg: unknown): void {
    const c = this.conns.get(slot);
    if (c) { try { c.send(msg); } catch { /* canal fechado */ } }
  }
  start(cfg: StartCfg): void {
    this.started = true;
    this.broadcast({ t: "start", cfg });
  }
  close(): void {
    this.broadcast({ t: "bye" });
    try { this.peer.destroy(); } catch { /* já destruído */ }
  }
}

/* --------------------------------- GUEST --------------------------------- */

export class NetGuest {
  peer: Peer;
  conn: DataConnection | null = null;
  slot = -1;
  private timer = 0;

  onWelcome: (slot: number, players: Array<{ slot: number; name: string; host: boolean }>) => void = () => undefined;
  onRoster: (players: Array<{ slot: number; name: string; host: boolean }>) => void = () => undefined;
  onStart: (cfg: StartCfg) => void = () => undefined;
  onSnap: (snap: Snapshot) => void = () => undefined;
  onEv: (ev: { k: string; [key: string]: unknown }) => void = () => undefined;
  onError: (msg: string) => void = () => undefined;
  onClose: () => void = () => undefined;

  constructor(code: string, name: string) {
    this.peer = new Peer();
    this.timer = window.setTimeout(() => {
      if (this.slot < 0) this.onError("Tempo esgotado — sala não encontrada. Confira o código.");
    }, 10000);
    this.peer.on("open", () => {
      this.conn = this.peer.connect(PREFIX + code.toUpperCase(), { reliable: true });
      this.conn.on("open", () => {
        this.conn!.send({ t: "hello", name });
      });
      this.conn.on("data", (raw) => {
        const d = raw as { t: string; [k: string]: unknown };
        if (d.t === "welcome") {
          window.clearTimeout(this.timer);
          this.slot = d.slot as number;
          this.onWelcome(this.slot, d.players as Array<{ slot: number; name: string; host: boolean }>);
        } else if (d.t === "roster") this.onRoster(d.players as Array<{ slot: number; name: string; host: boolean }>);
        else if (d.t === "start") { window.clearTimeout(this.timer); this.onStart(d.cfg as StartCfg); }
        else if (d.t === "snap") this.onSnap(d.s as Snapshot);
        else if (d.t === "ev") this.onEv(d.e as { k: string });
        else if (d.t === "full") this.onError("A sala está cheia ou a partida já começou.");
        else if (d.t === "bye") this.onClose();
      });
      const drop = () => { window.clearTimeout(this.timer); this.onClose(); };
      this.conn.on("close", drop);
      this.conn.on("error", drop);
    });
    this.peer.on("error", (err: Error & { type?: string }) => {
      window.clearTimeout(this.timer);
      if (err.type === "peer-unavailable") this.onError("Sala não encontrada. Confira o código de 5 letras.");
      else this.onError("Falha de conexão com o relé WebRTC. Verifique sua rede.");
    });
  }

  sendInput(inp: InputFrame): void {
    if (this.conn && this.conn.open) { try { this.conn.send({ t: "input", in: inp }); } catch { /* canal fechado */ } }
  }
  close(): void {
    window.clearTimeout(this.timer);
    try { this.peer.destroy(); } catch { /* já destruído */ }
  }
}
