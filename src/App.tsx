import { useEffect, useRef, useState } from "react";
import { ArenaEngine } from "./game/engine";
import type { FeedEntry, HudData, ScoreRow } from "./game/engine";
import Docs from "./components/Docs";

/* ------------------------------- utilidades ------------------------------ */

const fmt = (t: number): string => {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
};

const isTouchDevice = (): boolean => window.matchMedia("(pointer: coarse)").matches;

interface Toast { id: number; msg: string; kind: "info" | "kill" | "warn" | "pickup"; }

const toastColor: Record<string, string> = {
  info: "var(--ice)", kill: "var(--amber)", warn: "var(--red)", pickup: "var(--green)",
};

/* --------------------------------- ícones -------------------------------- */

const IconTarget = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="8" strokeDasharray="9 5" />
    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);
const IconSound = ({ muted }: { muted: boolean }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" />
    {muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12" />}
  </svg>
);
const IconPause = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
);
const IconBolt = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>
);
const IconShield = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" /></svg>
);
const WeaponGlyph = ({ w }: { w: string }) => {
  if (w === "rail")
    return (
      <svg width="34" height="14" viewBox="0 0 40 16" fill="none" stroke="var(--red)" strokeWidth="1.6">
        <path d="M2 8h30M36 8h2" strokeLinecap="round" />
        <path d="M8 4v8M14 5v6M20 4v8" strokeLinecap="round" opacity="0.7" />
      </svg>
    );
  if (w === "scatter")
    return (
      <svg width="34" height="14" viewBox="0 0 40 16" fill="none" stroke="var(--amber)" strokeWidth="1.7" strokeLinecap="round">
        <path d="M4 8h10" />
        <path d="M18 8h4M17 4l5-2M17 12l5 2M18 6l6-1M18 10l6 1" />
      </svg>
    );
  return (
    <svg width="34" height="14" viewBox="0 0 40 16" fill="none" stroke="var(--cyan)" strokeWidth="1.7" strokeLinecap="round">
      <path d="M6 10h18l4-3h6" />
      <path d="M10 10v4h5" />
      <circle cx="34" cy="7" r="1.4" fill="var(--cyan)" stroke="none" />
    </svg>
  );
};

/* ---------------------------------- menu --------------------------------- */

function Menu({
  cfg, setCfg, onPlay, onDocs,
}: {
  cfg: { botCount: number; duration: number };
  setCfg: (c: { botCount: number; duration: number }) => void;
  onPlay: () => void;
  onDocs: () => void;
}) {
  const touch = isTouchDevice();
  return (
    <div className="relative w-full h-full menu-bg scanlines overflow-hidden">
      <div className="grid-floor" />
      <div className="vignette absolute inset-0 pointer-events-none" />

      <div className="relative z-10 h-full max-w-[1200px] mx-auto px-5 md:px-10 flex flex-col justify-center">
        <div className="grid lg:grid-cols-[1.25fr_1fr] gap-10 items-center">
          {/* identidade */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <span className="chip" style={{ color: "var(--green)", borderColor: "rgba(55,255,180,0.5)" }}>PWA · OFFLINE</span>
              <span className="chip" style={{ color: "var(--cyan)", borderColor: "rgba(0,229,255,0.5)" }}>12 JOGADORES</span>
              <span className="chip" style={{ color: "var(--amber)", borderColor: "rgba(255,179,0,0.5)" }}>1 TIRO = 1 ABATE</span>
            </div>
            <h1 className="font-display font-900 leading-[0.95] title-glow" style={{ fontSize: "clamp(2.6rem, 7.2vw, 5.2rem)", fontWeight: 900, color: "var(--ice)", letterSpacing: "0.04em" }}>
              VETOR<span style={{ color: "var(--cyan)" }}>-</span>12
            </h1>
            <p className="font-display text-sm md:text-base tracking-[0.42em] mt-3" style={{ color: "var(--amber)" }}>
              ARENA NEON · TODOS CONTRA TODOS
            </p>
            <p className="mt-5 max-w-xl text-lg font-medium leading-relaxed" style={{ color: "var(--dim)" }}>
              Rodadas cronometradas numa arena compacta. Pistola <strong className="text-[var(--text)]">PULSO-9</strong> com
              munição infinita, power-ups que viram o jogo — <span style={{ color: "var(--red)" }}>TRILHO-X</span> perfurante,
              <span style={{ color: "var(--amber)" }}> DISPERSSOR</span>, <span style={{ color: "var(--green)" }}>ÉGIDE</span> e
              <span style={{ color: "var(--ice)" }}> SURTO</span> — e respawn em 2,5 s para o confronto nunca parar.
            </p>

            <div className="flex flex-wrap gap-x-8 gap-y-4 mt-7 mb-8">
              <div>
                <p className="hud-label mb-2">Combatentes</p>
                <div className="flex gap-2">
                  {[5, 8, 11].map((n) => (
                    <button key={n} className={`opt-btn clip-btn ${cfg.botCount === n ? "sel" : ""}`}
                      onClick={() => setCfg({ ...cfg, botCount: n })}>
                      {n + 1}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="hud-label mb-2">Duração da rodada</p>
                <div className="flex gap-2">
                  {[90, 120, 180].map((n) => (
                    <button key={n} className={`opt-btn clip-btn ${cfg.duration === n ? "sel" : ""}`}
                      onClick={() => setCfg({ ...cfg, duration: n })}>
                      {n}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="btn clip-btn pulseglow" style={{ fontSize: "1.05rem", padding: "1rem 2.4rem" }} onClick={onPlay}>
                Iniciar partida
              </button>
              <button className="btn clip-btn btn-amber" onClick={onDocs}>Dossiê técnico</button>
            </div>
          </div>

          {/* painel de controles */}
          <div className="clip-panel hud-panel p-6 floaty">
            <div className="flex items-center justify-between mb-4">
              <p className="font-display text-xs tracking-[0.3em]" style={{ color: "var(--cyan)" }}>PROTOCOLO DE COMBATE</p>
              <span style={{ color: "var(--cyan)" }}><IconTarget /></span>
            </div>
            {!touch ? (
              <div className="space-y-2.5 text-sm font-semibold" style={{ color: "var(--dim)" }}>
                {[
                  [["W", "A", "S", "D"], "Mover"],
                  [["MOUSE"], "Mirar"],
                  [["CLIQUE"], "Disparar (segure p/ rajada)"],
                  [["ESPAÇO"], "Saltar"],
                  [["TAB"], "Placar da sala"],
                  [["ESC"], "Pausar"],
                ].map(([keys, label], i) => (
                  <div key={i} className="flex items-center justify-between gap-3 border-b border-[rgba(111,163,176,0.12)] pb-2">
                    <div className="flex gap-1.5 flex-wrap">
                      {(keys as string[]).map((k) => <span key={k} className="kbd">{k}</span>)}
                    </div>
                    <span>{label as string}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2.5 text-sm font-semibold" style={{ color: "var(--dim)" }}>
                {[
                  ["JOYSTICK ESQUERDO", "Mover"],
                  ["ARRASTAR À DIREITA", "Mirar"],
                  ["BOTÃO VERMELHO", "Disparar"],
                  ["BOTÃO CIANO", "Saltar"],
                ].map(([k, label], i) => (
                  <div key={i} className="flex items-center justify-between gap-3 border-b border-[rgba(111,163,176,0.12)] pb-2">
                    <span className="kbd">{k}</span><span>{label}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-[rgba(0,229,255,0.15)] grid grid-cols-2 gap-2 text-xs font-semibold" style={{ color: "var(--dim)" }}>
              <div className="flex items-center gap-2"><span style={{ color: "var(--red)" }}><IconBolt /></span>TRILHO-X perfura alvos</div>
              <div className="flex items-center gap-2"><span style={{ color: "var(--green)" }}><IconShield /></span>ÉGIDE segura 1 disparo</div>
              <div className="flex items-center gap-2"><span style={{ color: "var(--amber)" }}><IconBolt /></span>SURTO: +43% velocidade</div>
              <div className="flex items-center gap-2"><span style={{ color: "var(--cyan)" }}><IconTarget size={13} /></span>Sequência = bônus</div>
            </div>
          </div>
        </div>

        <p className="mt-8 text-xs font-semibold tracking-[0.2em] font-display" style={{ color: "rgba(111,163,176,0.55)" }}>
          PROTÓTIPO LOCAL · MESMA SIMULAÇÃO DO SERVIDOR AUTORITATIVO · INSTALÁVEL VIA PWA
        </p>
      </div>
    </div>
  );
}

/* ------------------------------ placar (tabela) --------------------------- */

function ScoreTable({ rows, compact = false }: { rows: ScoreRow[]; compact?: boolean }) {
  return (
    <div className={compact ? "" : "clip-panel hud-panel p-4 min-w-[440px]"}>
      <div className="score-row head">
        <span>#</span><span>COMBATENTE</span><span className="text-right">ABATES</span>
        <span className="text-right">MORTES</span><span className="text-right">PONTOS</span><span className="text-right">SÉRIE</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.name} className={`score-row ${r.isPlayer ? "me" : ""} ${r.alive ? "" : "dead"}`}>
          <span className="font-display text-xs" style={{ color: i === 0 ? "var(--amber)" : "var(--dim)" }}>{i + 1}</span>
          <span className="flex items-center gap-2 truncate">
            <i className="inline-block w-2.5 h-2.5 shrink-0" style={{ background: r.color, boxShadow: `0 0 8px ${r.color}` }} />
            <span className="truncate">{r.name}</span>
            {!r.alive && <span className="text-[0.6rem] font-display tracking-widest" style={{ color: "var(--red)" }}>FORA</span>}
          </span>
          <span className="text-right font-display text-sm">{r.kills}</span>
          <span className="text-right font-display text-sm" style={{ color: "var(--dim)" }}>{r.deaths}</span>
          <span className="text-right font-display text-sm" style={{ color: "var(--amber)" }}>{r.score}</span>
          <span className="text-right font-display text-xs" style={{ color: r.streak >= 3 ? "var(--red)" : "var(--dim)" }}>
            {r.streak >= 2 ? `×${r.streak}` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- game view ------------------------------ */

function GameView({
  cfg, onExit, onRematch, onDocs,
}: {
  cfg: { botCount: number; duration: number };
  onExit: () => void;
  onRematch: () => void;
  onDocs: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ArenaEngine | null>(null);
  const [hud, setHud] = useState<HudData | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [countdown, setCountdown] = useState<{ n: number; key: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [locked, setLocked] = useState(false);
  const [end, setEnd] = useState<{ rows: ScoreRow[]; rank: number; won: boolean } | null>(null);
  const [showScore, setShowScore] = useState(false);
  const [hitTick, setHitTick] = useState<{ t: number; kill: boolean } | null>(null);
  const [dmgTick, setDmgTick] = useState(0);
  const [muted, setMuted] = useState(false);
  const [touch] = useState(isTouchDevice);
  const toastId = useRef(0);
  const crossRef = useRef<HTMLDivElement>(null);
  const firingRef = useRef(false);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const engine = new ArenaEngine(el, cfg, {
      onHud: setHud,
      onFeed: (f) => {
        setFeed((prev) => [...prev.slice(-4), f]);
        window.setTimeout(() => setFeed((prev) => prev.filter((x) => x.id !== f.id)), 4200);
      },
      onToast: (msg, kind) => {
        const id = ++toastId.current;
        setToasts((prev) => [...prev.slice(-2), { id, msg, kind }]);
        window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 1650);
      },
      onCountdown: (n) => {
        if (n <= 0) {
          setCountdown({ n: 0, key: Date.now() });
          window.setTimeout(() => setCountdown(null), 950);
        } else setCountdown({ n, key: Date.now() });
      },
      onHit: (killed) => setHitTick({ t: Date.now(), kill: killed }),
      onDamaged: () => setDmgTick((t) => t + 1),
      onEnd: (rows, rank, won) => setEnd({ rows, rank, won }),
      onLock: setLocked,
      onPause: setPaused,
    });
    engine.init();
    engineRef.current = engine;
    if (isTouchDevice()) engine.startMobile();

    const kd = (e: KeyboardEvent) => { if (e.code === "Tab") { e.preventDefault(); setShowScore(true); } };
    const ku = (e: KeyboardEvent) => { if (e.code === "Tab") setShowScore(false); };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* classe de disparo na mira */
  useEffect(() => {
    const el = crossRef.current;
    if (!el) return;
    const down = () => { firingRef.current = true; el.classList.add("firing"); };
    const up = () => { firingRef.current = false; el.classList.remove("firing"); };
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("mouseup", up); };
  }, []);

  useEffect(() => {
    const el = crossRef.current;
    if (!el || !hitTick) return;
    el.classList.remove("hit", "kill");
    void el.offsetWidth;
    el.classList.add(hitTick.kill ? "kill" : "hit");
    const t = window.setTimeout(() => el.classList.remove("hit", "kill"), 220);
    return () => window.clearTimeout(t);
  }, [hitTick]);

  const eng = () => engineRef.current;
  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      if (eng()) eng()!.sfx.muted = next;
      return next;
    });
  };

  const phase = hud?.phase ?? "idle";
  const timeCritical = phase === "playing" && (hud?.time ?? 99) <= 10;
  const rank = hud ? hud.rows.findIndex((r) => r.isPlayer) + 1 : 0;
  const total = hud?.rows.length ?? 12;
  const showEntryOverlay = !touch && !locked && !paused && !end && (phase === "idle" || phase === "countdown" || phase === "playing");

  /* joystick */
  const joyRef = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const joyBase = useRef({ x: 0, y: 0 });
  const [joyKnob, setJoyKnob] = useState({ x: 33, y: 33, visible: false, bx: 0, by: 0 });

  const joyStart = (e: React.PointerEvent) => {
    joyId.current = e.pointerId;
    joyBase.current = { x: e.clientX, y: e.clientY };
    setJoyKnob({ x: 33, y: 33, visible: true, bx: e.clientX, by: e.clientY });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const joyMove = (e: React.PointerEvent) => {
    if (e.pointerId !== joyId.current) return;
    let dx = e.clientX - joyBase.current.x;
    let dy = e.clientY - joyBase.current.y;
    const len = Math.hypot(dx, dy);
    const max = 46;
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    setJoyKnob((k) => ({ ...k, x: 33 + dx, y: 33 + dy }));
    eng()?.setTouchMove(dx / max, -dy / max);
  };
  const joyEnd = (e: React.PointerEvent) => {
    if (e.pointerId !== joyId.current) return;
    joyId.current = null;
    setJoyKnob((k) => ({ ...k, visible: false }));
    eng()?.setTouchMove(0, 0);
  };

  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const lookStart = (e: React.PointerEvent) => {
    lookId.current = e.pointerId;
    lookLast.current = { x: e.clientX, y: e.clientY };
  };
  const lookMove = (e: React.PointerEvent) => {
    if (e.pointerId !== lookId.current) return;
    const dx = e.clientX - lookLast.current.x;
    const dy = e.clientY - lookLast.current.y;
    lookLast.current = { x: e.clientX, y: e.clientY };
    eng()?.addTouchLook(dx, dy);
  };
  const lookEnd = (e: React.PointerEvent) => { if (e.pointerId === lookId.current) lookId.current = null; };

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* canvas */}
      <div ref={mountRef} className="absolute inset-0" />
      <div className="vignette absolute inset-0 pointer-events-none z-10" />

      {/* flash de dano + véu de morte */}
      <div key={`dmg-${dmgTick}`} className={`dmg-flash ${dmgTick ? "show" : ""}`} />
      {hud && hud.respawn > 0 && <div className="death-veil" />}

      {/* HUD superior */}
      {hud && !end && (
        <>
          {/* timer */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none">
            <div className={`hud-panel clip-panel px-6 py-1.5 ${timeCritical ? "timer-critical" : ""}`}>
              <span className="font-display text-3xl font-800 tracking-[0.12em]" style={{ fontWeight: 800, color: timeCritical ? "var(--red)" : "var(--ice)" }}>
                {phase === "countdown" ? "--:--" : fmt(hud.time)}
              </span>
            </div>
            <p className="hud-label mt-1">RODADA FFA · {total} COMBATENTES</p>
          </div>

          {/* posição + pontos (esq.) */}
          <div className="absolute top-3 left-3 z-20 pointer-events-none">
            <div className="hud-panel clip-panel px-4 py-2">
              <p className="hud-label">Posição</p>
              <p className="font-display text-2xl" style={{ fontWeight: 800, color: "var(--amber)" }}>
                {rank}<span className="text-sm" style={{ color: "var(--dim)" }}>/{total}</span>
              </p>
            </div>
          </div>

          {/* botões utilitários */}
          <div className="absolute top-3 right-3 z-40 flex gap-2">
            <button className="btn clip-btn btn-ghost" style={{ padding: "0.45rem 0.6rem" }} onClick={toggleMute} aria-label="Som">
              <IconSound muted={muted} />
            </button>
            {touch && (
              <button className="btn clip-btn btn-ghost" style={{ padding: "0.45rem 0.6rem" }} onClick={() => eng()?.pauseGame()} aria-label="Pausar">
                <IconPause />
              </button>
            )}
          </div>

          {/* kill feed */}
          <div className="absolute top-14 right-3 z-20 flex flex-col items-end gap-1.5 pointer-events-none">
            {feed.map((f) => (
              <div key={f.id} className={`feed-item ${f.pKiller || f.pVictim ? "me" : ""}`}>
                <span style={{ color: f.kColor, textShadow: `0 0 8px ${f.kColor}` }}>{f.killer}</span>
                <span className="feed-weapon">{f.weapon}</span>
                <span style={{ color: f.vColor }}>{f.victim}</span>
              </div>
            ))}
          </div>

          {/* painel do jogador (inf. esq.) */}
          <div className="absolute bottom-3 left-3 z-20 pointer-events-none">
            <div className="hud-panel clip-panel px-5 py-3 flex gap-6 items-end">
              <div>
                <p className="hud-label">Pontos</p>
                <p className="font-display text-3xl leading-none" style={{ fontWeight: 800, color: "var(--ice)" }}>{hud.score}</p>
              </div>
              <div>
                <p className="hud-label">Abates</p>
                <p className="font-display text-xl leading-none" style={{ color: "var(--amber)" }}>{hud.kills}</p>
              </div>
              <div>
                <p className="hud-label">Série</p>
                <p className="font-display text-xl leading-none" style={{ color: hud.streak >= 3 ? "var(--red)" : "var(--dim)" }}>
                  {hud.streak >= 2 ? `×${hud.streak}` : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* arma + status (inf. dir.) */}
          <div className="absolute bottom-3 right-3 z-20 pointer-events-none">
            <div className="hud-panel clip-panel px-5 py-3 w-[230px]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="hud-label">Arma</p>
                  <p className="font-display text-sm tracking-[0.16em]" style={{ color: hud.weapon === "pistol" ? "var(--cyan)" : hud.weapon === "rail" ? "var(--red)" : "var(--amber)" }}>
                    {hud.weapon === "pistol" ? "PULSO-9" : hud.weapon === "rail" ? "TRILHO-X" : "DISPERSSOR"}
                  </p>
                </div>
                <WeaponGlyph w={hud.weapon} />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="hud-label">Munição</span>
                <span className="font-display text-xs" style={{ color: "var(--green)" }}>∞ INFINITA</span>
              </div>
              {hud.weaponT > 0 && (
                <div className="pwr-bar mt-1.5">
                  <div style={{ width: `${(hud.weaponT / 8) * 100}%`, background: hud.weapon === "rail" ? "var(--red)" : "var(--amber)" }} />
                </div>
              )}
              <div className="flex items-center gap-3 mt-2 min-h-[18px]">
                {hud.shield && (
                  <span className="flex items-center gap-1 text-[0.62rem] font-display tracking-[0.14em]" style={{ color: "var(--green)" }}>
                    <IconShield /> ÉGIDE
                  </span>
                )}
                {hud.hasteT > 0 && (
                  <span className="flex items-center gap-1 text-[0.62rem] font-display tracking-[0.14em]" style={{ color: "var(--ice)" }}>
                    <IconBolt /> SURTO
                  </span>
                )}
              </div>
              {hud.hasteT > 0 && (
                <div className="pwr-bar mt-1">
                  <div style={{ width: `${(hud.hasteT / 6) * 100}%`, background: "var(--ice)" }} />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* mira + hitmarker */}
      {!end && phase !== "idle" && !paused && (
        <>
          <div ref={crossRef} className="crosshair">
            <i className="c-t" /><i className="c-b" /><i className="c-l" /><i className="c-r" /><i className="c-d" />
          </div>
          {hitTick && (
            <div key={hitTick.t} className={`hitmarker show ${hitTick.kill ? "killmark" : ""}`}>
              <i className="h1" /><i className="h2" /><i className="h3" /><i className="h4" />
            </div>
          )}
        </>
      )}

      {/* toasts centrais */}
      <div className="absolute left-1/2 top-[30%] -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="toast-center text-lg md:text-xl" style={{ color: toastColor[t.kind] }}>{t.msg}</div>
        ))}
      </div>

      {/* contagem regressiva */}
      {countdown && !paused && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div key={countdown.key} className="countdown-num text-[7rem] md:text-[9rem]" style={{ color: countdown.n === 0 ? "var(--green)" : "var(--cyan)" }}>
            {countdown.n === 0 ? "LUTE" : countdown.n}
          </div>
        </div>
      )}

      {/* overlay de respawn */}
      {hud && hud.respawn > 0 && !end && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="font-display text-2xl md:text-4xl tracking-[0.2em]" style={{ color: "var(--red)", fontWeight: 800, textShadow: "0 0 26px rgba(255,56,96,0.6)" }}>
              ELIMINADO
            </p>
            <p className="mt-2 font-semibold tracking-[0.14em]" style={{ color: "var(--dim)" }}>
              abatido por <span style={{ color: "var(--amber)" }}>{hud.lastKiller}</span>
            </p>
            <p className="mt-4 font-display text-xl tracking-[0.24em]" style={{ color: "var(--ice)" }}>
              RESSURGINDO EM <span style={{ color: "var(--cyan)", fontSize: "1.6rem", fontWeight: 800 }}>{Math.ceil(hud.respawn)}</span>
            </p>
          </div>
        </div>
      )}

      {/* placar (Tab) */}
      {showScore && hud && !end && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(3,10,13,0.55)] pointer-events-none">
          <ScoreTable rows={hud.rows} />
        </div>
      )}

      {/* controles touch */}
      {touch && !end && !paused && (
        <>
          <div className="touch-zone left-0 w-1/2" onPointerDown={joyStart} onPointerMove={joyMove} onPointerUp={joyEnd} onPointerCancel={joyEnd}>
            {joyKnob.visible && (
              <div className="joy-base" style={{ left: joyKnob.bx - 59, top: joyKnob.by - 59 }}>
                <div className="joy-knob" style={{ left: joyKnob.x, top: joyKnob.y }} />
              </div>
            )}
          </div>
          <div className="touch-zone right-0 w-1/2" onPointerDown={lookStart} onPointerMove={lookMove} onPointerUp={lookEnd} onPointerCancel={lookEnd} />
          <button
            className="touch-btn"
            style={{ right: 26, bottom: 30, width: 92, height: 92, zIndex: 35 }}
            onPointerDown={(e) => { e.preventDefault(); eng()?.setFiring(true); }}
            onPointerUp={() => eng()?.setFiring(false)}
            onPointerLeave={() => eng()?.setFiring(false)}
            onPointerCancel={() => eng()?.setFiring(false)}
          >
            TIRO
          </button>
          <button
            className="touch-btn jump"
            style={{ right: 132, bottom: 44, width: 62, height: 62, zIndex: 35 }}
            onPointerDown={(e) => { e.preventDefault(); eng()?.touchJump(); }}
          >
            SALTO
          </button>
        </>
      )}

      {/* overlay de entrada (pointer lock) */}
      {showEntryOverlay && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(3,10,13,0.78)] backdrop-blur-[2px] cursor-pointer"
          onClick={() => eng()?.requestLock()}>
          <div className="text-center">
            <div className="flex justify-center mb-5" style={{ color: "var(--cyan)" }}><IconTarget size={54} /></div>
            <p className="font-display text-2xl md:text-4xl tracking-[0.24em] title-glow" style={{ color: "var(--ice)", fontWeight: 800 }}>
              {phase === "idle" ? "ENTRAR NA ARENA" : "CLIQUE PARA CONTINUAR"}
            </p>
            <p className="mt-3 font-semibold tracking-[0.1em]" style={{ color: "var(--dim)" }}>
              clique para capturar o mouse · <span className="kbd">ESC</span> pausa a partida
            </p>
          </div>
        </div>
      )}

      {/* pausa */}
      {paused && !end && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(3,10,13,0.82)] scanlines">
          <div className="clip-panel hud-panel p-8 w-[min(92vw,430px)] text-center">
            <p className="font-display text-3xl tracking-[0.3em] mb-1" style={{ color: "var(--amber)", fontWeight: 800 }}>PAUSADO</p>
            <p className="hud-label mb-6">simulação congelada</p>
            {hud && <div className="mb-6 text-left"><ScoreTable rows={hud.rows} compact /></div>}
            <div className="flex flex-col gap-2.5">
              <button className="btn clip-btn" onClick={() => eng()?.resume()}>{touch ? "Continuar" : "Continuar (clique)"}</button>
              <button className="btn clip-btn btn-amber" onClick={onRematch}>Reiniciar partida</button>
              <button className="btn clip-btn btn-ghost" onClick={onDocs}>Dossiê técnico</button>
              <button className="btn clip-btn btn-red" onClick={onExit}>Abandonar arena</button>
              <button className="btn clip-btn btn-ghost" onClick={toggleMute}>
                Som: {muted ? "desligado" : "ligado"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* fim de partida */}
      {end && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(3,10,13,0.88)] scanlines overflow-y-auto py-6">
          <div className="w-[min(94vw,640px)] text-center">
            <p className="hud-label mb-2">fim da rodada</p>
            <p className="font-display tracking-[0.16em] title-glow mb-1" style={{
              fontSize: "clamp(2rem,6vw,3.6rem)", fontWeight: 900,
              color: end.won ? "var(--green)" : end.rank <= 3 ? "var(--amber)" : "var(--red)",
            }}>
              {end.won ? "VITÓRIA" : end.rank <= 3 ? `TOP ${end.rank + 1}` : "DERROTA"}
            </p>
            <p className="font-semibold tracking-[0.12em] mb-6" style={{ color: "var(--dim)" }}>
              {end.won ? "você dominou a arena" : `vencedor: ${end.rows[0]?.name} · você terminou em ${end.rank + 1}º`}
            </p>
            <div className="text-left mb-7"><ScoreTable rows={end.rows} /></div>
            <div className="flex flex-wrap justify-center gap-3">
              <button className="btn clip-btn pulseglow" onClick={onRematch}>Revanche</button>
              <button className="btn clip-btn btn-amber" onClick={onDocs}>Dossiê técnico</button>
              <button className="btn clip-btn btn-ghost" onClick={onExit}>Menu principal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- app ---------------------------------- */

export default function App() {
  const [screen, setScreen] = useState<"menu" | "game" | "docs">("menu");
  const [cfg, setCfg] = useState({ botCount: 11, duration: 120 });
  const [matchKey, setMatchKey] = useState(0);

  return (
    <div className="w-full h-full">
      {screen === "menu" && (
        <Menu cfg={cfg} setCfg={setCfg} onPlay={() => { setMatchKey((k) => k + 1); setScreen("game"); }} onDocs={() => setScreen("docs")} />
      )}
      {screen === "game" && (
        <GameView
          key={matchKey}
          cfg={cfg}
          onExit={() => setScreen("menu")}
          onRematch={() => setMatchKey((k) => k + 1)}
          onDocs={() => setScreen("docs")}
        />
      )}
      {screen === "docs" && (
        <Docs onBack={() => setScreen("menu")} onPlay={() => { setMatchKey((k) => k + 1); setScreen("game"); }} />
      )}
    </div>
  );
}
