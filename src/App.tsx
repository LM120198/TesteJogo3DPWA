import { useEffect, useRef, useState } from "react";
import { ArenaEngine, DIFFS, MAPS } from "./game/engine";
import type { FeedEntry, HudData, InputFrame, LobbyPlayer, MapId, MatchConfig, ScoreRow, Snapshot } from "./game/engine";
import { NetGuest, NetHost, genCode } from "./game/net";
import type { StartCfg } from "./game/net";
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

interface Settings {
  mode: "local" | "online";
  mapId: MapId;
  difficulty: number;
  total: number;
  duration: number;
  name: string;
  sens: number;
}
const loadSettings = (): Settings => {
  try {
    const raw = localStorage.getItem("vetor12-settings");
    if (raw) return { mode: "local", mapId: "nucleo", difficulty: 1, total: 12, duration: 120, sens: 1, ...JSON.parse(raw) };
  } catch { /* padrão */ }
  return { mode: "local", mapId: "nucleo", difficulty: 1, total: 12, duration: 120, name: "PILOTO", sens: 1 };
};

/* --------------------------------- ícones -------------------------------- */

const IconTarget = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="8" strokeDasharray="9 5" />
    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);
const IconGlobe = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
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
const colorOf = (hex: number): string => "#" + hex.toString(16).padStart(6, "0");

/* ---------------------------------- menu --------------------------------- */

function Menu({
  s, setS, onPlayLocal, onOnline, onDocs,
}: {
  s: Settings;
  setS: (v: Settings) => void;
  onPlayLocal: () => void;
  onOnline: () => void;
  onDocs: () => void;
}) {
  const touch = isTouchDevice();
  const map = MAPS.find((m) => m.id === s.mapId) || MAPS[0];
  return (
    <div className="relative w-full h-full menu-bg scanlines overflow-y-auto">
      <div className="grid-floor" />
      <div className="vignette absolute inset-0 pointer-events-none" />

      <div className="relative z-10 min-h-full max-w-[1240px] mx-auto px-5 md:px-10 py-8 flex flex-col justify-center">
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10 items-start">
          {/* identidade + modo */}
          <div className="pt-4">
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <span className="chip" style={{ color: "var(--green)", borderColor: "rgba(55,255,180,0.5)" }}>PWA · OFFLINE</span>
              <span className="chip" style={{ color: "var(--cyan)", borderColor: "rgba(0,229,255,0.5)" }}>12 JOGADORES</span>
              <span className="chip" style={{ color: "var(--amber)", borderColor: "rgba(255,179,0,0.5)" }}>1 TIRO = 1 ABATE</span>
            </div>
            <h1 className="font-display font-900 leading-[0.95] title-glow" style={{ fontSize: "clamp(2.6rem, 6.5vw, 4.8rem)", fontWeight: 900, color: "var(--ice)", letterSpacing: "0.04em" }}>
              VETOR<span style={{ color: "var(--cyan)" }}>-</span>12
            </h1>
            <p className="font-display text-sm md:text-base tracking-[0.42em] mt-3" style={{ color: "var(--amber)" }}>
              ARENA NEON · TODOS CONTRA TODOS
            </p>
            <p className="mt-5 max-w-xl text-base md:text-lg font-medium leading-relaxed" style={{ color: "var(--dim)" }}>
              Pistola <strong className="text-[var(--text)]">PULSO-9</strong> infinita, power-ups que viram o jogo e respawn em
              2,5 s. Escolha a arena, calibre a dificuldade — e chame até 11 amigos para a sala online.
            </p>

            <div className="seg mt-7" style={{ maxWidth: 360 }}>
              <button className={`seg-btn ${s.mode === "local" ? "sel" : ""}`} onClick={() => setS({ ...s, mode: "local" })}>
                <IconTarget size={15} /> PARTIDA LOCAL
              </button>
              <button className={`seg-btn ${s.mode === "online" ? "sel" : ""}`} onClick={() => setS({ ...s, mode: "online" })}>
                <IconGlobe size={15} /> ONLINE
              </button>
            </div>

            {s.mode === "local" && (
              <div className="flex flex-wrap gap-x-10 gap-y-4 mt-6">
                <div>
                  <p className="hud-label mb-2">Combatentes</p>
                  <div className="flex gap-2">
                    {[6, 9, 12].map((n) => (
                      <button key={n} className={`opt-btn clip-btn ${s.total === n ? "sel" : ""}`} onClick={() => setS({ ...s, total: n })}>{n}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="hud-label mb-2">Duração</p>
                  <div className="flex gap-2">
                    {[90, 120, 180].map((n) => (
                      <button key={n} className={`opt-btn clip-btn ${s.duration === n ? "sel" : ""}`} onClick={() => setS({ ...s, duration: n })}>{n}s</button>
                    ))}
                  </div>
                </div>
                <div className="w-52">
                  <p className="hud-label mb-2">Dificuldade dos bots</p>
                  <div className="seg">
                    {DIFFS.map((d, i) => (
                      <button key={d.name} className={`seg-btn tiny ${s.difficulty === i ? "sel" : ""}`} title={d.desc} onClick={() => setS({ ...s, difficulty: i })}>
                        {d.name.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs mt-1.5 font-semibold" style={{ color: "var(--dim)" }}>{DIFFS[s.difficulty].desc}</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 mt-8">
              {s.mode === "local" ? (
                <button className="btn clip-btn pulseglow" style={{ fontSize: "1.05rem", padding: "1rem 2.4rem" }} onClick={onPlayLocal}>
                  Iniciar partida
                </button>
              ) : (
                <button className="btn clip-btn pulseglow" style={{ fontSize: "1.05rem", padding: "1rem 2.4rem" }} onClick={onOnline}>
                  <span className="inline-flex items-center gap-2"><IconGlobe /> Sala online</span>
                </button>
              )}
              <button className="btn clip-btn btn-amber" onClick={onDocs}>Dossiê técnico</button>
            </div>

            <p className="mt-8 text-xs font-semibold tracking-[0.2em] font-display" style={{ color: "rgba(111,163,176,0.55)" }}>
              SIMULAÇÃO AUTORITATIVA · WEBRTC P2P · INSTALÁVEL VIA PWA
            </p>
          </div>

          {/* painel de configuração */}
          <div className="clip-panel hud-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="font-display text-xs tracking-[0.3em]" style={{ color: "var(--cyan)" }}>CONFIGURAÇÃO DE COMBATE</p>
              <span style={{ color: "var(--cyan)" }}><IconTarget /></span>
            </div>

            <p className="hud-label mb-1.5">Codinome</p>
            <input
              className="name-input clip-btn"
              maxLength={12}
              value={s.name}
              onChange={(e) => setS({ ...s, name: e.target.value.toUpperCase().replace(/[^A-Z0-9\-_ ]/g, "") || "PILOTO" })}
            />

            <p className="hud-label mb-1.5 mt-4">Arena</p>
            <div className="space-y-2">
              {MAPS.map((m) => (
                <button key={m.id} className={`map-row clip-btn ${s.mapId === m.id ? "sel" : ""}`} onClick={() => setS({ ...s, mapId: m.id })}>
                  <span className="map-swatch">
                    <i style={{ background: colorOf(m.accent) }} />
                    <i style={{ background: colorOf(m.accent2) }} />
                    <i style={{ background: colorOf(m.danger) }} />
                  </span>
                  <span className="text-left flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <b className="font-display tracking-[0.14em] text-sm">{m.name}</b>
                      <em className="map-tag" style={{ color: colorOf(m.accent), borderColor: colorOf(m.accent) + "66" }}>{m.tag}</em>
                    </span>
                    <small className="block truncate" style={{ color: "var(--dim)" }}>{m.desc}</small>
                  </span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="hud-label mb-1.5">Sensibilidade · {s.sens.toFixed(1)}×</p>
                <input type="range" min={0.4} max={2.2} step={0.1} value={s.sens} className="range"
                  onChange={(e) => setS({ ...s, sens: parseFloat(e.target.value) })} />
              </div>
              <div>
                <p className="hud-label mb-1.5">Atrito da arena</p>
                <p className="text-sm font-semibold" style={{ color: map.id === "glacial" ? "var(--ice)" : "var(--dim)" }}>
                  {map.id === "glacial" ? "BAIXO — derrapa" : "PADRÃO"}
                </p>
                <p className="text-xs font-semibold mt-1" style={{ color: "var(--dim)" }}>
                  {s.mode === "online" ? "Online preenche a sala até 12 com bots." : `Bots na dificuldade ${DIFFS[s.difficulty].name}.`}
                </p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-[rgba(0,229,255,0.15)]">
              <p className="hud-label mb-2.5">{touch ? "Controles (toque)" : "Controles"}</p>
              {!touch ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-semibold" style={{ color: "var(--dim)" }}>
                  <div className="flex items-center justify-between gap-2"><span className="flex gap-1"><span className="kbd">W</span><span className="kbd">A</span><span className="kbd">S</span><span className="kbd">D</span></span> mover</div>
                  <div className="flex items-center justify-between gap-2"><span className="kbd">MOUSE</span> mirar</div>
                  <div className="flex items-center justify-between gap-2"><span className="kbd">CLIQUE</span> disparar</div>
                  <div className="flex items-center justify-between gap-2"><span className="kbd">ESPAÇO</span> saltar</div>
                  <div className="flex items-center justify-between gap-2"><span className="kbd">TAB</span> placar</div>
                  <div className="flex items-center justify-between gap-2"><span className="kbd">ESC</span> pausar</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-semibold" style={{ color: "var(--dim)" }}>
                  <div>Joystick esquerdo — mover</div>
                  <div>Arrastar à direita — mirar</div>
                  <div>Botão vermelho — tiro</div>
                  <div>Botão ciano — salto</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- lobby -------------------------------- */

function Lobby({
  s, onBack, onLaunch, netRef,
}: {
  s: Settings;
  onBack: () => void;
  onLaunch: (cfg: StartCfg, guest: NetGuest | null, host: NetHost | null, code: string) => void;
  netRef: React.MutableRefObject<{ host: NetHost | null; guest: NetGuest | null }>;
}) {
  const [mode, setMode] = useState<"choose" | "host" | "join">("choose");
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roster, setRoster] = useState<LobbyPlayer[]>([]);
  const [err, setErr] = useState("");
  const [state, setState] = useState<"idle" | "connecting" | "ready">("idle");
  const [copied, setCopied] = useState(false);
  const launched = useRef(false);

  const cleanup = () => {
    netRef.current.host?.close();
    netRef.current.guest?.close();
    netRef.current.host = null;
    netRef.current.guest = null;
  };
  useEffect(() => () => { if (!launched.current) cleanup(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hostIt = () => {
    setErr(""); cleanup();
    const host = new NetHost();
    netRef.current.host = host;
    host.hostName = s.name || "ANFITRIÃO";
    host.onReady = () => { setCode(host.code); setState("ready"); setRoster(host.roster()); };
    host.onError = (m) => setErr(m);
    host.onRoster = (r) => setRoster(r);
    setMode("host");
    setState("connecting");
  };

  const joinIt = () => {
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) { setErr("Digite o código de 5 caracteres da sala."); return; }
    setErr(""); cleanup();
    setState("connecting");
    const guest = new NetGuest(c, s.name || "PILOTO");
    netRef.current.guest = guest;
    guest.onWelcome = (slot, players) => {
      setState("ready");
      setRoster(players.map((p) => ({ ...p })));
    };
    guest.onRoster = (r) => setRoster(r);
    guest.onError = (m) => { setErr(m); setState("idle"); };
    guest.onClose = () => { if (launched.current) return; setErr("Conexão encerrada pela sala."); setState("idle"); };
    guest.onStart = (cfg) => {
      if (launched.current) return;
      launched.current = true;
      onLaunch(cfg, guest, null, c);
    };
    setMode("join");
  };

  const startMatch = () => {
    const host = netRef.current.host;
    if (!host) return;
    const players = host.roster();
    launched.current = true;
    const cfg: StartCfg = { mapId: s.mapId, difficulty: s.difficulty, duration: s.duration, players };
    host.start(cfg);
    onLaunch(cfg, null, host, host.code);
  };

  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }).catch(() => undefined);
  };

  return (
    <div className="relative w-full h-full menu-bg scanlines overflow-y-auto">
      <div className="grid-floor" />
      <div className="vignette absolute inset-0 pointer-events-none" />
      <div className="relative z-10 min-h-full max-w-[860px] mx-auto px-5 py-10 flex flex-col justify-center">
        <button className="btn clip-btn btn-ghost self-start mb-6" onClick={() => { cleanup(); onBack(); }}>← Voltar ao menu</button>

        <p className="hud-label mb-1">multiplayer</p>
        <h2 className="font-display title-glow mb-2" style={{ fontSize: "clamp(1.8rem,4.5vw,2.8rem)", fontWeight: 900, color: "var(--ice)", letterSpacing: "0.06em" }}>
          SALA DE COMBATE
        </h2>
        <p className="font-semibold mb-7 max-w-xl" style={{ color: "var(--dim)" }}>
          Conexão P2P via WebRTC — o anfitrião simula a partida e valida cada disparo. Vagas restantes são preenchidas por bots.
        </p>

        {mode === "choose" && (
          <div className="space-y-3 max-w-xl">
            <button className="lobby-opt clip-btn" onClick={hostIt}>
              <span className="lobby-opt-ic" style={{ color: "var(--cyan)" }}><IconGlobe size={26} /></span>
              <span className="text-left flex-1">
                <b className="font-display tracking-[0.14em]">CRIAR SALA</b>
                <small style={{ color: "var(--dim)" }}>Gere um código de 5 letras e compartilhe com até 11 amigos.</small>
              </span>
              <span className="font-display text-xl" style={{ color: "var(--cyan)" }}>→</span>
            </button>
            <button className="lobby-opt clip-btn" onClick={() => setMode("join")}>
              <span className="lobby-opt-ic" style={{ color: "var(--amber)" }}><IconTarget size={26} /></span>
              <span className="text-left flex-1">
                <b className="font-display tracking-[0.14em]">ENTRAR COM CÓDIGO</b>
                <small style={{ color: "var(--dim)" }}>Recebeu um código? Cole abaixo e entre na arena.</small>
              </span>
              <span className="font-display text-xl" style={{ color: "var(--amber)" }}>→</span>
            </button>
          </div>
        )}

        {mode === "join" && state === "idle" && (
          <div className="clip-panel hud-panel p-6 max-w-xl">
            <p className="hud-label mb-2">Código da sala</p>
            <div className="flex gap-2">
              <input
                className="name-input clip-btn lobby-input flex-1"
                placeholder="EX.: K7Q2M"
                maxLength={5}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
              <button className="btn clip-btn" onClick={joinIt}>Conectar</button>
            </div>
            {err && <p className="net-err mt-3">{err}</p>}
            <button className="btn clip-btn btn-ghost mt-4" onClick={() => { setMode("choose"); setErr(""); }}>← Escolher outra opção</button>
          </div>
        )}

        {mode === "join" && state === "connecting" && (
          <div className="clip-panel hud-panel p-8 max-w-xl text-center">
            <p className="blink font-display tracking-[0.3em]" style={{ color: "var(--cyan)" }}>CONECTANDO À SALA…</p>
            {err && <p className="net-err mt-3">{err}</p>}
          </div>
        )}

        {mode === "host" && state === "connecting" && (
          <div className="clip-panel hud-panel p-8 max-w-xl text-center">
            <p className="blink font-display tracking-[0.3em]" style={{ color: "var(--cyan)" }}>ABRINDO SALA…</p>
            {err && <p className="net-err mt-3">{err}</p>}
          </div>
        )}

        {state === "ready" && (
          <div className="grid md:grid-cols-[1fr_1.2fr] gap-4 max-w-3xl">
            <div className="clip-panel hud-panel p-6">
              <p className="hud-label mb-2">{mode === "host" ? "Código da sala" : "Conectado à sala"}</p>
              {mode === "host" ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="lobby-code font-display">{code}</span>
                    <button className="btn clip-btn btn-ghost" onClick={copy} style={{ padding: "0.5rem 0.9rem" }}>
                      {copied ? "COPIADO" : "COPIAR"}
                    </button>
                  </div>
                  <p className="text-xs font-semibold mt-3" style={{ color: "var(--dim)" }}>
                    Compartilhe o código. A partida começa quando você apertar iniciar.
                  </p>
                </>
              ) : (
                <>
                  <span className="lobby-code font-display">{joinCode}</span>
                  <p className="blink text-xs font-display tracking-[0.2em] mt-3" style={{ color: "var(--green)" }}>
                    AGUARDANDO O ANFITRIÃO INICIAR…
                  </p>
                </>
              )}
              <p className="hud-label mt-5 mb-2">Configuração</p>
              <p className="text-sm font-semibold" style={{ color: "var(--dim)" }}>
                Arena <b style={{ color: "var(--text)" }}>{(MAPS.find((m) => m.id === (mode === "host" ? s.mapId : s.mapId)) || MAPS[0]).name}</b> · {s.duration}s · dificuldade {DIFFS[s.difficulty].name}
              </p>
            </div>
            <div className="clip-panel hud-panel p-6">
              <p className="hud-label mb-3">Combatentes na sala · {roster.length}/12</p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {roster.map((p, i) => (
                  <div key={p.slot} className="roster-item clip-btn">
                    <i style={{ background: ["#00e5ff", "#ffb300", "#ff3860", "#37ffb4", "#f78c6b", "#7cf5ff", "#c8ff4d", "#ff8a3d", "#5ad1e6", "#ffd166", "#06d6a0", "#ef476f"][p.slot % 12] }} />
                    <span className="font-display text-sm tracking-[0.1em]">{p.name}</span>
                    {p.host && <em className="map-tag" style={{ color: "var(--cyan)", borderColor: "rgba(0,229,255,0.4)" }}>ANFITRIÃO</em>}
                    <span className="ml-auto text-xs font-semibold" style={{ color: "var(--dim)" }}>vaga {i + 1}</span>
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 12 - roster.length) }).slice(0, 4).map((_, i) => (
                  <div key={`e${i}`} className="roster-item empty clip-btn">
                    <i style={{ background: "rgba(111,163,176,0.25)" }} />
                    <span className="text-sm font-semibold" style={{ color: "rgba(111,163,176,0.5)" }}>vaga aberta</span>
                  </div>
                ))}
              </div>
              {mode === "host" && (
                <button className="btn clip-btn pulseglow w-full mt-5" style={{ padding: "0.9rem" }} onClick={startMatch}>
                  Iniciar partida · {roster.length} humano{roster.length > 1 ? "s" : ""} + {12 - roster.length} bots
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ placar (tabela) --------------------------- */

function ScoreTable({ rows, compact = false }: { rows: ScoreRow[]; compact?: boolean }) {
  return (
    <div className={compact ? "" : "clip-panel hud-panel p-4 min-w-[min(92vw,460px)]"}>
      <div className="score-row head">
        <span>#</span><span>COMBATENTE</span><span className="text-right">ABATES</span>
        <span className="text-right">MORTES</span><span className="text-right">PONTOS</span><span className="text-right">SÉRIE</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.name + i} className={`score-row ${r.isPlayer ? "me" : ""} ${r.alive ? "" : "dead"}`}>
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

interface NetBundle { host: NetHost | null; guest: NetGuest | null; code: string; online: boolean; }

function GameView({
  cfg, net, onExit, onRematch, onDocs,
}: {
  cfg: MatchConfig;
  net: NetBundle;
  onExit: () => void;
  onRematch: () => void;
  onDocs: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
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

  const addFeed = (f: FeedEntry) => {
    setFeed((prev) => [...prev.slice(-4), f]);
    window.setTimeout(() => setFeed((prev) => prev.filter((x) => x.id !== f.id)), 4200);
  };
  const addToast = (msg: string, kind: Toast["kind"]) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-2), { id, msg, kind }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 1650);
  };
  const showCount = (n: number) => {
    if (n <= 0) {
      setCountdown({ n: 0, key: Date.now() });
      window.setTimeout(() => setCountdown(null), 950);
    } else setCountdown({ n, key: Date.now() });
  };

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const engine = new ArenaEngine(el, cfg, {
      onHud: setHud,
      onFeed: (f) => {
        addFeed(f);
        if (net.host) net.host.broadcast({ t: "ev", e: { k: "feed", f } });
      },
      onToast: addToast,
      onCountdown: (n) => {
        showCount(n);
        if (net.host) net.host.broadcast({ t: "ev", e: { k: "count", n } });
      },
      onHit: (killed) => setHitTick({ t: Date.now(), kill: killed }),
      onDamaged: () => setDmgTick((t) => t + 1),
      onEnd: (rows, rank, won) => {
        setEnd({ rows, rank, won });
        if (net.host) {
          const raw = engine.getFinalRows();
          net.host.broadcast({ t: "ev", e: { k: "end", rows: raw } });
        }
      },
      onLock: setLocked,
      onPause: setPaused,
      onSnapshot: (s) => { if (net.host) net.host.broadcast({ t: "snap", s }); },
      onRemoteEvent: (slot, ev) => { if (net.host) net.host.sendTo(slot, { t: "ev", e: ev }); },
    });
    engine.init();
    engineRef.current = engine;
    if (isTouchDevice()) engine.startMobile();

    /* rede: hospedeiro recebe inputs; convidado envia inputs e aplica snapshots */
    let inputTimer = 0;
    if (net.host) {
      net.host.onInput = (slot: number, inp: InputFrame) => engine.setRemoteInput(slot, inp);
    }
    if (net.guest) {
      net.guest.onSnap = (s: Snapshot) => engine.injectSnap(s);
      net.guest.onEv = (ev) => {
        const e = ev as { k: string; [key: string]: unknown };
        if (e.k === "feed") addFeed(e.f as FeedEntry);
        else if (e.k === "count") showCount(e.n as number);
        else if (e.k === "hit") setHitTick({ t: Date.now(), kill: !!e.kill });
        else if (e.k === "dmg") { setDmgTick((t) => t + 1); addToast(`ELIMINADO POR ${e.by}`, "warn"); }
        else if (e.k === "toast") addToast(e.msg as string, (e.kind as Toast["kind"]) || "info");
        else if (e.k === "end") {
          const rows = (e.rows as Array<ScoreRow & { slot: number }>).map((r) => ({ ...r, isPlayer: r.slot === cfg.selfSlot }));
          rows.sort((a, b) => b.score - a.score || b.kills - a.kills);
          const rank = rows.findIndex((r) => r.isPlayer);
          setEnd({ rows, rank, won: rank === 0 });
        }
      };
      inputTimer = window.setInterval(() => {
        net.guest?.sendInput(engine.getLocalInput());
      }, 33);
    }

    const miniTimer = window.setInterval(() => {
      if (miniRef.current && engine) engine.drawMinimap(miniRef.current);
    }, 80);

    const kd = (e: KeyboardEvent) => { if (e.code === "Tab") { e.preventDefault(); setShowScore(true); } };
    const ku = (e: KeyboardEvent) => { if (e.code === "Tab") setShowScore(false); };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.clearInterval(miniTimer);
      if (inputTimer) window.clearInterval(inputTimer);
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* sensibilidade vinda das configurações */
  useEffect(() => {
    engineRef.current?.setSensitivity((loadSettings().sens) || 1);
  }, []);

  useEffect(() => {
    const el = crossRef.current;
    if (!el) return;
    const down = () => el.classList.add("firing");
    const up = () => el.classList.remove("firing");
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
  const mapName = (MAPS.find((m) => m.id === cfg.mapId) || MAPS[0]).name;

  /* joystick */
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
  const lookStart = (e: React.PointerEvent) => { lookId.current = e.pointerId; lookLast.current = { x: e.clientX, y: e.clientY }; };
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
      <div ref={mountRef} className="absolute inset-0" />
      <div className="vignette absolute inset-0 pointer-events-none z-10" />

      <div key={`dmg-${dmgTick}`} className={`dmg-flash ${dmgTick ? "show" : ""}`} />
      {hud && hud.respawn > 0 && <div className="death-veil" />}

      {hud && !end && (
        <>
          {/* timer */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none">
            <div className={`hud-panel clip-panel px-6 py-1.5 ${timeCritical ? "timer-critical" : ""}`}>
              <span className="font-display text-3xl tracking-[0.12em]" style={{ fontWeight: 800, color: timeCritical ? "var(--red)" : "var(--ice)" }}>
                {phase === "countdown" ? "--:--" : fmt(hud.time)}
              </span>
            </div>
            <p className="hud-label mt-1">{mapName} · {net.online ? `SALA ${net.code}` : "PARTIDA LOCAL"} · {total} COMBATENTES</p>
          </div>

          {/* posição */}
          <div className="absolute top-3 left-3 z-20 pointer-events-none">
            <div className="hud-panel clip-panel px-4 py-2">
              <p className="hud-label">Posição</p>
              <p className="font-display text-2xl" style={{ fontWeight: 800, color: "var(--amber)" }}>
                {rank}<span className="text-sm" style={{ color: "var(--dim)" }}>/{total}</span>
              </p>
            </div>
            {net.online && (
              <div className="hud-panel clip-panel px-3 py-1.5 mt-2">
                <p className="text-[0.6rem] font-display tracking-[0.2em] flex items-center gap-1.5" style={{ color: "var(--green)" }}>
                  <span className="dot-live" /> ONLINE
                </p>
              </div>
            )}
          </div>

          {/* utilitários */}
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

          {/* minimapa */}
          <div className="minimap absolute right-3 z-20" style={{ bottom: 200 }}>
            <canvas ref={miniRef} width={148} height={148} />
          </div>

          {/* painel do jogador */}
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

          {/* arma */}
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

      {/* mira */}
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

      {/* toasts */}
      <div className="absolute left-1/2 top-[30%] -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="toast-center text-lg md:text-xl" style={{ color: toastColor[t.kind] }}>{t.msg}</div>
        ))}
      </div>

      {/* contagem */}
      {countdown && !paused && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div key={countdown.key} className="countdown-num text-[7rem] md:text-[9rem]" style={{ color: countdown.n === 0 ? "var(--green)" : "var(--cyan)" }}>
            {countdown.n === 0 ? "LUTE" : countdown.n}
          </div>
        </div>
      )}

      {/* respawn */}
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

      {/* placar Tab */}
      {showScore && hud && !end && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(3,10,13,0.55)] pointer-events-none">
          <ScoreTable rows={hud.rows} />
        </div>
      )}

      {/* touch */}
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
          <button className="touch-btn" style={{ right: 26, bottom: 30, width: 92, height: 92, zIndex: 35 }}
            onPointerDown={(e) => { e.preventDefault(); eng()?.setFiring(true); }}
            onPointerUp={() => eng()?.setFiring(false)}
            onPointerLeave={() => eng()?.setFiring(false)}
            onPointerCancel={() => eng()?.setFiring(false)}>
            TIRO
          </button>
          <button className="touch-btn jump" style={{ right: 132, bottom: 44, width: 62, height: 62, zIndex: 35 }}
            onPointerDown={(e) => { e.preventDefault(); eng()?.touchJump(); }}>
            SALTO
          </button>
        </>
      )}

      {/* entrada */}
      {showEntryOverlay && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(3,10,13,0.78)] backdrop-blur-[2px] cursor-pointer"
          onClick={() => eng()?.requestLock()}>
          <div className="text-center">
            <div className="flex justify-center mb-5" style={{ color: "var(--cyan)" }}><IconTarget size={54} /></div>
            <p className="font-display text-2xl md:text-4xl tracking-[0.24em] title-glow" style={{ color: "var(--ice)", fontWeight: 800 }}>
              {phase === "idle" ? "ENTRAR NA ARENA" : "CLIQUE PARA CONTINUAR"}
            </p>
            <p className="mt-3 font-semibold tracking-[0.1em]" style={{ color: "var(--dim)" }}>
              clique para capturar o mouse · <span className="kbd">ESC</span> pausa · arraste para olhar sem capturar
            </p>
          </div>
        </div>
      )}

      {/* pausa */}
      {paused && !end && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(3,10,13,0.82)] scanlines">
          <div className="clip-panel hud-panel p-8 w-[min(92vw,440px)] text-center">
            <p className="font-display text-3xl tracking-[0.3em] mb-1" style={{ color: "var(--amber)", fontWeight: 800 }}>PAUSADO</p>
            <p className="hud-label mb-6">{net.online ? "simulação continua no anfitrião" : "simulação congelada"}</p>
            {hud && <div className="mb-6 text-left max-h-60 overflow-y-auto"><ScoreTable rows={hud.rows} compact /></div>}
            <div className="flex flex-col gap-2.5">
              <button className="btn clip-btn" onClick={() => eng()?.resume()}>{touch ? "Continuar" : "Continuar (clique)"}</button>
              {!net.online && <button className="btn clip-btn btn-amber" onClick={onRematch}>Reiniciar partida</button>}
              {net.online && net.host && <button className="btn clip-btn btn-amber" onClick={onRematch}>Reiniciar para todos</button>}
              <button className="btn clip-btn btn-ghost" onClick={onDocs}>Dossiê técnico</button>
              <button className="btn clip-btn btn-red" onClick={onExit}>Abandonar arena</button>
              <button className="btn clip-btn btn-ghost" onClick={toggleMute}>Som: {muted ? "desligado" : "ligado"}</button>
            </div>
          </div>
        </div>
      )}

      {/* fim */}
      {end && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(3,10,13,0.88)] scanlines overflow-y-auto py-6">
          <div className="w-[min(94vw,680px)] text-center">
            <p className="hud-label mb-2">fim da rodada · {mapName}</p>
            <p className="font-display tracking-[0.16em] title-glow mb-1" style={{
              fontSize: "clamp(2rem,6vw,3.6rem)", fontWeight: 900,
              color: end.won ? "var(--green)" : end.rank <= 2 ? "var(--amber)" : "var(--red)",
            }}>
              {end.won ? "VITÓRIA" : end.rank <= 2 ? `TOP ${end.rank + 1}` : "DERROTA"}
            </p>
            <p className="font-semibold tracking-[0.12em] mb-4" style={{ color: "var(--dim)" }}>
              {end.won ? "você dominou a arena" : `vencedor: ${end.rows[0]?.name} · você terminou em ${end.rank + 1}º`}
            </p>
            {hud && (
              <p className="font-display text-xs tracking-[0.18em] mb-6" style={{ color: "var(--dim)" }}>
                PRECISÃO <b style={{ color: "var(--cyan)" }}>{hud.shots > 0 ? Math.round((hud.hits / hud.shots) * 100) : 0}%</b>
                {" · "}MELHOR SÉRIE <b style={{ color: "var(--red)" }}>×{Math.max(1, hud.bestStreak)}</b>
              </p>
            )}
            <div className="text-left mb-7"><ScoreTable rows={end.rows} /></div>
            <div className="flex flex-wrap justify-center gap-3">
              {net.online && net.host && <button className="btn clip-btn pulseglow" onClick={onRematch}>Revanche (todos)</button>}
              {!net.online && <button className="btn clip-btn pulseglow" onClick={onRematch}>Revanche</button>}
              {net.online && !net.host && <p className="w-full text-xs font-semibold" style={{ color: "var(--dim)" }}>A revanche é iniciada pelo anfitrião.</p>}
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
  const [screen, setScreen] = useState<"menu" | "lobby" | "game" | "docs">("menu");
  const [s, setSState] = useState<Settings>(loadSettings);
  const [matchKey, setMatchKey] = useState(0);
  const [engineCfg, setEngineCfg] = useState<MatchConfig | null>(null);
  const [netBundle, setNetBundle] = useState<NetBundle>({ host: null, guest: null, code: "", online: false });
  const netRef = useRef<{ host: NetHost | null; guest: NetGuest | null }>({ host: null, guest: null });
  const startCfgRef = useRef<StartCfg | null>(null);

  const setS = (v: Settings) => {
    setSState(v);
    try { localStorage.setItem("vetor12-settings", JSON.stringify(v)); } catch { /* privado */ }
  };

  const makeEngineCfg = (mapId: MapId, difficulty: number, duration: number, total: number, players: LobbyPlayer[], role: "local" | "host" | "guest", selfSlot: number): MatchConfig => ({
    botCount: role === "local" ? total - 1 : Math.max(0, 12 - players.length),
    duration, mapId, difficulty, role, selfSlot, players,
    playerName: s.name || "PILOTO",
  });

  const playLocal = () => {
    netRef.current.host?.close(); netRef.current.guest?.close();
    netRef.current = { host: null, guest: null };
    setNetBundle({ host: null, guest: null, code: "", online: false });
    setEngineCfg(makeEngineCfg(s.mapId, s.difficulty, s.duration, s.total, [{ slot: 0, name: s.name || "PILOTO", host: true }], "local", 0));
    setMatchKey((k) => k + 1);
    setScreen("game");
  };

  const launchOnline = (cfg: StartCfg, guest: NetGuest | null, host: NetHost | null, code: string) => {
    startCfgRef.current = cfg;
    const selfSlot = guest ? guest.slot : 0;
    setEngineCfg(makeEngineCfg(cfg.mapId as MapId, cfg.difficulty, cfg.duration, 12, cfg.players, guest ? "guest" : "host", selfSlot));
    setNetBundle({ host, guest, code, online: true });
    setMatchKey((k) => k + 1);
    setScreen("game");
  };

  /* convidado: o anfitrião pode (re)iniciar a qualquer momento */
  useEffect(() => {
    const g = netBundle.guest;
    if (!g) return;
    g.onStart = (cfg) => launchOnline(cfg, g, null, netBundle.code);
    g.onClose = () => {
      if (screen === "game") setScreen("menu");
    };
    return () => { g.onStart = () => undefined; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netBundle, screen]);

  const rematch = () => {
    if (netBundle.online && netBundle.host && startCfgRef.current) {
      netBundle.host.started = true;
      netBundle.host.start(startCfgRef.current);
      setMatchKey((k) => k + 1);
      return;
    }
    if (!netBundle.online) {
      setEngineCfg((c) => (c ? { ...c } : c));
      setMatchKey((k) => k + 1);
    }
  };

  const exitToMenu = () => {
    if (netBundle.online) {
      netRef.current.host?.close();
      netRef.current.guest?.close();
      netRef.current = { host: null, guest: null };
      setNetBundle({ host: null, guest: null, code: "", online: false });
    }
    setScreen("menu");
  };

  return (
    <div className="w-full h-full">
      {screen === "menu" && (
        <Menu s={s} setS={setS} onPlayLocal={playLocal} onOnline={() => setScreen("lobby")} onDocs={() => setScreen("docs")} />
      )}
      {screen === "lobby" && (
        <Lobby s={s} netRef={netRef} onBack={() => setScreen("menu")} onLaunch={launchOnline} />
      )}
      {screen === "game" && engineCfg && (
        <GameView
          key={matchKey}
          cfg={engineCfg}
          net={netBundle}
          onExit={exitToMenu}
          onRematch={rematch}
          onDocs={() => setScreen("docs")}
        />
      )}
      {screen === "docs" && (
        <Docs onBack={() => setScreen("menu")} onPlay={() => playLocal()} />
      )}
    </div>
  );
}
