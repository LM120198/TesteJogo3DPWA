import { useEffect, useRef } from "react";

function ArchDiagram() {
  return (
    <svg viewBox="0 0 920 380" className="w-full h-auto" role="img" aria-label="Diagrama de arquitetura">
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="rgba(0,229,255,0.8)" />
        </marker>
        <marker id="arrA" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="rgba(255,179,0,0.8)" />
        </marker>
      </defs>

      {/* cliente */}
      <rect x="24" y="40" width="250" height="300" rx="4" className="diag-box" />
      <text x="149" y="68" textAnchor="middle" className="diag-title">CLIENTE — PWA</text>
      <rect x="44" y="86" width="210" height="40" rx="3" className="diag-box" />
      <text x="149" y="103" textAnchor="middle" className="diag-sub">Three.js · WebGL2 (fallback WebGPU)</text>
      <text x="149" y="117" textAnchor="middle" className="diag-sub">Render 60 fps · LOD · pooling</text>
      <rect x="44" y="134" width="210" height="40" rx="3" className="diag-box" />
      <text x="149" y="151" textAnchor="middle" className="diag-sub">Input unificado (mouse/toque/gamepad)</text>
      <text x="149" y="165" textAnchor="middle" className="diag-sub">Predição local + reconciliação</text>
      <rect x="44" y="182" width="210" height="40" rx="3" className="diag-box" />
      <text x="149" y="199" textAnchor="middle" className="diag-sub">Interpolação de snapshots (100 ms)</text>
      <text x="149" y="213" textAnchor="middle" className="diag-sub">Buffer anti-jitter</text>
      <rect x="44" y="230" width="210" height="40" rx="3" className="diag-box green" />
      <text x="149" y="247" textAnchor="middle" className="diag-sub">Service Worker · cache-first</text>
      <text x="149" y="261" textAnchor="middle" className="diag-sub">Manifest · instalável · offline</text>
      <text x="149" y="306" textAnchor="middle" className="diag-sub">Raycast client-side APENAS p/ feedback</text>
      <text x="149" y="322" textAnchor="middle" className="diag-sub">(hit marker otimista, nunca pontua)</text>

      {/* setas cliente <-> servidor */}
      <path d="M274 120 C 340 120, 360 100, 428 100" className="diag-flow" markerEnd="url(#arr)" />
      <text x="352" y="92" textAnchor="middle" className="diag-label">INPUT 30 Hz (seq, bits)</text>
      <path d="M428 150 C 360 150, 340 170, 274 170" className="diag-flow amber" markerEnd="url(#arrA)" />
      <text x="352" y="196" textAnchor="middle" className="diag-label">SNAPSHOT 20 Hz (delta, ~40 B/jogador)</text>
      <path d="M274 230 C 340 230, 360 246, 428 246" className="diag-flow" markerEnd="url(#arr)" />
      <text x="352" y="272" textAnchor="middle" className="diag-label">EVENTOS: disparo, dano, pickup</text>

      {/* servidor */}
      <rect x="428" y="40" width="268" height="300" rx="4" className="diag-box amber" />
      <text x="562" y="68" textAnchor="middle" className="diag-title">SERVIDOR AUTORITATIVO</text>
      <rect x="448" y="86" width="228" height="40" rx="3" className="diag-box amber" />
      <text x="562" y="103" textAnchor="middle" className="diag-sub">Node.js + Colyseus (salas até 12)</text>
      <text x="562" y="117" textAnchor="middle" className="diag-sub">WebSocket binário · TLS</text>
      <rect x="448" y="134" width="228" height="40" rx="3" className="diag-box amber" />
      <text x="562" y="151" textAnchor="middle" className="diag-sub">Simulação fixa 30 Hz · determinística</text>
      <text x="562" y="165" textAnchor="middle" className="diag-sub">Física AABB · mesmo código do cliente</text>
      <rect x="448" y="182" width="228" height="40" rx="3" className="diag-box red" />
      <text x="562" y="199" textAnchor="middle" className="diag-sub">Raycast de acerto NO SERVIDOR</text>
      <text x="562" y="213" textAnchor="middle" className="diag-sub">Lag comp.: rewind de hitboxes (≤150 ms)</text>
      <rect x="448" y="230" width="228" height="52" rx="3" className="diag-box red" />
      <text x="562" y="247" textAnchor="middle" className="diag-sub">Anti-cheat: clamp de velocidade,</text>
      <text x="562" y="261" textAnchor="middle" className="diag-sub">rate-limit de disparo, validação de</text>
      <text x="562" y="275" textAnchor="middle" className="diag-sub">estado, kick por divergência</text>
      <text x="562" y="306" textAnchor="middle" className="diag-sub">Ciclo de vida: lobby → contagem →</text>
      <text x="562" y="322" textAnchor="middle" className="diag-sub">rodada (90–180 s) → resultados → dispose</text>

      {/* bordas */}
      <rect x="716" y="40" width="180" height="140" rx="4" className="diag-box green" />
      <text x="806" y="68" textAnchor="middle" className="diag-title">MATCHMAKING</text>
      <text x="806" y="92" textAnchor="middle" className="diag-sub">Filas por MMR ±200</text>
      <text x="806" y="110" textAnchor="middle" className="diag-sub">Backfill em partida</text>
      <text x="806" y="128" textAnchor="middle" className="diag-sub">em andamento</text>
      <text x="806" y="146" textAnchor="middle" className="diag-sub">Região por ping</text>

      <rect x="716" y="200" width="180" height="140" rx="4" className="diag-box" />
      <text x="806" y="228" textAnchor="middle" className="diag-title">CDN / EDGE</text>
      <text x="806" y="252" textAnchor="middle" className="diag-sub">Assets imutáveis (hash)</text>
      <text x="806" y="270" textAnchor="middle" className="diag-sub">Brotli · HTTP/2 push</text>
      <text x="806" y="288" textAnchor="middle" className="diag-sub">texturas KTX2/ASTC</text>
      <text x="806" y="306" textAnchor="middle" className="diag-sub">DRACO p/ geometria</text>

      <path d="M696 110 L716 110" className="diag-flow" markerEnd="url(#arr)" />
      <path d="M696 270 L716 270" className="diag-flow" markerEnd="url(#arr)" />
    </svg>
  );
}

const section = "clip-panel hud-panel p-5 md:p-7 reveal";

export default function Docs({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.08, root: el }
    );
    el.querySelectorAll(".reveal").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <div className="w-full h-full menu-bg scanlines relative">
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 md:px-8 py-3 border-b border-[rgba(0,229,255,0.18)] bg-[rgba(5,19,26,0.92)] backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="1.6">
            <circle cx="12" cy="12" r="8" strokeDasharray="9 5" />
            <path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="var(--red)" />
            <circle cx="12" cy="12" r="2" fill="var(--cyan)" stroke="none" />
          </svg>
          <span className="font-display text-sm tracking-[0.3em] text-[var(--ice)]">VETOR-12 · DOSSIÊ TÉCNICO</span>
        </div>
        <div className="flex gap-2">
          <button className="btn clip-btn btn-ghost text-xs" onClick={onBack}>Menu</button>
          <button className="btn clip-btn text-xs" onClick={onPlay}>Jogar agora</button>
        </div>
      </header>

      <div ref={ref} className="docs-scroll h-[calc(100%-57px)] px-4 md:px-8 lg:px-16 py-8 max-w-[1180px] mx-auto space-y-8">
        {/* resumo */}
        <section className={section}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="hud-label mb-2">Plano de implementação · v1.0</p>
              <h1 className="font-display text-2xl md:text-4xl font-800 tracking-[0.12em] text-[var(--ice)] title-glow">
                FPS DE ARENA · 12 JOGADORES · PWA
              </h1>
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className="chip" style={{ color: "var(--cyan)", borderColor: "rgba(0,229,255,0.5)" }}>60 FPS DESKTOP</span>
              <span className="chip" style={{ color: "var(--amber)", borderColor: "rgba(255,179,0,0.5)" }}>30+ FPS MOBILE</span>
              <span className="chip" style={{ color: "var(--green)", borderColor: "rgba(55,255,180,0.5)" }}>≤ 1.5 MB INICIAL</span>
            </div>
          </div>
          <p className="mt-4 text-[var(--dim)] font-medium text-lg leading-relaxed max-w-4xl">
            Arena futurista compacta, todos-contra-todos, rodadas de 90–180 s com <strong className="text-[var(--text)]">eliminação em um tiro</strong>.
            Pistola inicial com munição infinita e power-ups temporários que definem o ritmo. O protótipo jogável
            embutido neste app executa a simulação completa localmente (mesma lógica que rodaria no servidor autoritativo),
            com 11 bots de skill variável ocupando as vagas da sala.
          </p>
        </section>

        {/* arquitetura */}
        <section className={section}>
          <h2 className="doc-h text-base md:text-lg mb-5">01 · Diagrama de arquitetura</h2>
          <div className="clip-panel border border-[rgba(0,229,255,0.15)] bg-[rgba(3,14,18,0.6)] p-3 md:p-5">
            <ArchDiagram />
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-5 text-sm">
            <div className="border-l-2 border-[var(--cyan)] pl-3">
              <p className="font-display text-xs tracking-[0.2em] text-[var(--cyan)] mb-1">SERVIDOR AUTORITATIVO</p>
              <p className="text-[var(--dim)] font-medium">Toda pontuação, hit-validation e spawn passam pelo servidor. O cliente só prevê o próprio movimento e renderiza feedback otimista.</p>
            </div>
            <div className="border-l-2 border-[var(--amber)] pl-3">
              <p className="font-display text-xs tracking-[0.2em] text-[var(--amber)] mb-1">VALIDAÇÃO DE ACERTOS</p>
              <p className="text-[var(--dim)] font-medium">Raycast no servidor com rewinding de hitboxes (lag compensation de até 150 ms). Cliente envia origem, direção e timestamp do disparo.</p>
            </div>
            <div className="border-l-2 border-[var(--green)] pl-3">
              <p className="font-display text-xs tracking-[0.2em] text-[var(--green)] mb-1">PWA OFFLINE</p>
              <p className="text-[var(--dim)] font-medium">Service Worker cache-first para shell e assets com hash; rede com fallback para fontes. Partida offline contra bots já no primeiro reload.</p>
            </div>
          </div>
        </section>

        {/* stack */}
        <section className={section}>
          <h2 className="doc-h text-base md:text-lg mb-5">02 · Justificativa da pilha</h2>
          <table className="doc-table">
            <thead>
              <tr><th>Camada</th><th>Escolha</th><th>Por quê</th><th>Alternativa</th></tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-[var(--ice)] font-semibold">Render 3D</td>
                <td>Three.js (WebGL2)</td>
                <td className="text-[var(--dim)] font-medium">Bundle menor (~150 KB gzip), ecossistema maduro, controle fino de draw calls e pooling. Caminho de migração para <code className="text-[var(--cyan)]">three/webgpu</code> sem reescrever a cena.</td>
                <td className="text-[var(--dim)] font-medium">Babylon.js (mais baterias incluídas, bundle maior); WebGPU puro (cobertura ainda parcial em mobile)</td>
              </tr>
              <tr>
                <td className="text-[var(--ice)] font-semibold">Servidor de salas</td>
                <td>Colyseus (Node.js)</td>
                <td className="text-[var(--dim)] font-medium">TypeScript de ponta a ponta (tipos de estado compartilhados com o cliente), rooms com lifecycle pronto, scale-out por processos de sala, deploy simples.</td>
                <td className="text-[var(--dim)] font-medium">Nakama (Go, melhor para centenas de salas + presença social); Node + ws raw (controle total, mais código próprio)</td>
              </tr>
              <tr>
                <td className="text-[var(--ice)] font-semibold">Transporte</td>
                <td>WebSocket binário</td>
                <td className="text-[var(--dim)] font-medium">Ordenado e confiável — ideal para snapshots 20 Hz. WebRTC DataChannel (não confiável) fica reservado para fase 2, para voice e estado de alta frequência.</td>
                <td className="text-[var(--dim)] font-medium">WebTransport/QUIC quando houver suporte amplo em mobile</td>
              </tr>
              <tr>
                <td className="text-[var(--ice)] font-semibold">Simulação</td>
                <td>Física AABB própria, passo fixo 30 Hz</td>
                <td className="text-[var(--dim)] font-medium">Mapa pequeno com geometria axial → AABB resolve 12 corpos em &lt;0,2 ms. Determinística (fixed-point nos inputs) permite replay e verificação anti-cheat. Sem motor de física pesado.</td>
                <td className="text-[var(--dim)] font-medium">rapier.js (WASM) só se o mapa ganhar geometria arbitrária</td>
              </tr>
              <tr>
                <td className="text-[var(--ice)] font-semibold">PWA</td>
                <td>SW próprio + manifest</td>
                <td className="text-[var(--dim)] font-medium">Controle fino de versionamento e atualização ("nova versão disponível") sem depender de plugin de build; cache-first para shell.</td>
                <td className="text-[var(--dim)] font-medium">vite-plugin-pwa em projeto fora deste sandbox</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* rede */}
        <section className={section}>
          <h2 className="doc-h text-base md:text-lg mb-5">03 · Rede: taxas, pacotes e anti-cheat</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <table className="doc-table">
                <thead><tr><th>Canal</th><th>Taxa</th><th>Detalhe</th></tr></thead>
                <tbody>
                  <tr><td className="text-[var(--ice)]">Input cliente → servidor</td><td>30 Hz</td><td className="text-[var(--dim)] font-medium">seq + yaw/pitch (int16) + botões (bitfield) + wish-dir (2×int8). ~9 B/pacote.</td></tr>
                  <tr><td className="text-[var(--ice)]">Snapshot servidor → cliente</td><td>20 Hz</td><td className="text-[var(--dim)] font-medium">Delta vs. snapshot anterior ACKado; pos quantizada 12 bits/eixo; ~35–45 B/jogador.</td></tr>
                  <tr><td className="text-[var(--ice)]">Eventos</td><td>Sob demanda</td><td className="text-[var(--dim)] font-medium">Disparo (para som/VFX remotos), morte, pickup, fim de rodada — confiáveis.</td></tr>
                  <tr><td className="text-[var(--ice)]">Interpolação</td><td>Buffer 100 ms</td><td className="text-[var(--dim)] font-medium">Render 2 snapshots atrás; extrapolação limitada a 120 ms com correção suave.</td></tr>
                </tbody>
              </table>
            </div>
            <div className="space-y-3 text-sm">
              <div className="border border-[rgba(255,56,96,0.3)] clip-panel p-4 bg-[rgba(40,6,12,0.25)]">
                <p className="font-display text-xs tracking-[0.2em] text-[var(--red)] mb-2">ANTI-CHEAT — CAMADAS</p>
                <ul className="space-y-1.5 text-[var(--dim)] font-medium list-none">
                  <li>· Raycast de dano exclusivamente no servidor (hitbox rewind ≤150 ms)</li>
                  <li>· Clamp de velocidade/teleporte e rate-limit de disparo por arma</li>
                  <li>· Validação de sequência de inputs (descarta seq fora de ordem)</li>
                  <li>· Snapshot com hash de estado a cada 5 s p/ auditoria de replay</li>
                  <li>· TLS obrigatório; salas descartáveis; kick por divergência &gt;3σ</li>
                </ul>
              </div>
              <div className="border border-[rgba(0,229,255,0.25)] clip-panel p-4 bg-[rgba(4,22,28,0.4)]">
                <p className="font-display text-xs tracking-[0.2em] text-[var(--cyan)] mb-2">CICLO DE VIDA DA SALA (12 VAGAS)</p>
                <p className="text-[var(--dim)] font-medium">
                  <span className="text-[var(--text)]">waiting</span> (lobby, backfill ativo) → <span className="text-[var(--text)]">countdown</span> (3 s, trava de entrada) →
                  <span className="text-[var(--text)]"> playing</span> (rodada 90–180 s, respawn em 2,5 s) → <span className="text-[var(--text)]">results</span> (placar 8 s) →
                  <span className="text-[var(--text)]"> dispose</span> ou nova rodada. Reconexão aceita em até 20 s mantendo placar.
                </p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-[var(--dim)] font-medium border-l-2 border-[var(--amber)] pl-3">
            <span className="text-[var(--amber)] font-display text-xs tracking-[0.18em]">PROTÓTIPO DE REDE (neste build):</span>{" "}
            a simulação roda em modo <em>local-authoritative</em> — um único loop executa os 12 combatentes com as mesmas regras
            (hitscan, cooldowns, spawn protection), o que valida o design de gameplay e o modelo de estado antes de plugar Colyseus.
          </p>
        </section>

        {/* desempenho */}
        <section className={section}>
          <h2 className="doc-h text-base md:text-lg mb-5">04 · Metas e orçamento de desempenho</h2>
          <table className="doc-table">
            <thead><tr><th>Recurso</th><th>Orçamento</th><th>Estratégia</th></tr></thead>
            <tbody>
              <tr><td className="text-[var(--ice)] font-semibold">Frame rate</td><td>60 fps desktop · 30+ mobile</td><td className="text-[var(--dim)] font-medium">DPR limitado (1.75/1.5), sombras só desktop, sem pós-processamento na v1.</td></tr>
              <tr><td className="text-[var(--ice)] font-semibold">Draw calls</td><td>&lt; 120</td><td className="text-[var(--dim)] font-medium">Materiais compartilhados por classe; partículas em um único Points; tracers pool de 26.</td></tr>
              <tr><td className="text-[var(--ice)] font-semibold">Triângulos</td><td>&lt; 80 k em cena</td><td className="text-[var(--dim)] font-medium">Bots low-poly (~700 tri) com LOD de 2 níveis; arena ~12 k tri estática.</td></tr>
              <tr><td className="text-[var(--ice)] font-semibold">Texturas</td><td>0 MB na v1 (procedural)</td><td className="text-[var(--dim)] font-medium">Materiais paramétricos + emissivos; quando entrar arte: KTX2 ASTC/ETC2, mip streaming.</td></tr>
              <tr><td className="text-[var(--ice)] font-semibold">Memória</td><td>&lt; 180 MB</td><td className="text-[var(--dim)] font-medium">Pooling de partículas/tracers/projéteis; geometrias únicas compartilhadas.</td></tr>
              <tr><td className="text-[var(--ice)] font-semibold">CPU simulação</td><td>&lt; 2 ms/frame</td><td className="text-[var(--dim)] font-medium">AABB slab-test (~20 caixas × 12 corpos), IA em decisões escalonadas a 8–10 Hz.</td></tr>
              <tr><td className="text-[var(--ice)] font-semibold">Download inicial</td><td>≤ 1.5 MB gzip</td><td className="text-[var(--dim)] font-medium">Three.js tree-shaken; code-split do dossiê; fontes com display=swap.</td></tr>
            </tbody>
          </table>
        </section>

        {/* QA */}
        <section className={section}>
          <h2 className="doc-h text-base md:text-lg mb-5">05 · Plano de controle de qualidade</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <table className="doc-table">
              <thead><tr><th>Nível</th><th>O quê</th></tr></thead>
              <tbody>
                <tr><td className="text-[var(--ice)] font-semibold">Unitário</td><td className="text-[var(--dim)] font-medium">Simulação determinística: mesmo seed de inputs → mesmo resultado (replay bit-a-bit).</td></tr>
                <tr><td className="text-[var(--ice)] font-semibold">Integração</td><td className="text-[var(--dim)] font-medium">12 bots headless jogando 500 rodadas; assert em invariantes (score, respawn, sem NaN).</td></tr>
                <tr><td className="text-[var(--ice)] font-semibold">Chaos de rede</td><td className="text-[var(--dim)] font-medium">200 ms + 5% de perda + reorder; validar reconciliação e lag comp sem rubber-banding visível.</td></tr>
                <tr><td className="text-[var(--ice)] font-semibold">Perf regression</td><td className="text-[var(--dim)] font-medium">Captura de frame-time p95 por build em 3 dispositivos-alvo; bloqueio de merge se p95 &gt; meta.</td></tr>
              </tbody>
            </table>
            <table className="doc-table">
              <thead><tr><th>Matriz de dispositivos</th><th>Meta</th></tr></thead>
              <tbody>
                <tr><td className="text-[var(--ice)] font-semibold">Desktop Chrome/Edge (GTX 1060+)</td><td className="text-[var(--dim)] font-medium">60 fps estável, DPR 1.75</td></tr>
                <tr><td className="text-[var(--ice)] font-semibold">Android mid (Snapdragon 6xx)</td><td className="text-[var(--dim)] font-medium">40 fps, DPR 1.25, sem sombras</td></tr>
                <tr><td className="text-[var(--ice)] font-semibold">iPhone 11+</td><td className="text-[var(--dim)] font-medium">60 fps, DPR 1.5</td></tr>
                <tr><td className="text-[var(--ice)] font-semibold">Safari / iOS PWA standalone</td><td className="text-[var(--dim)] font-medium">Pointer lock via touch-look fallback, áudio após gesto</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* marcos e riscos */}
        <section className={section}>
          <h2 className="doc-h text-base md:text-lg mb-5">06 · Marcos priorizados & riscos</h2>
          <div className="grid md:grid-cols-5 gap-3 mb-6">
            {[
              ["M0", "SEMANA 1–2", "Loop jogável single-player: arena, tiro, um-tiro-um-abate, HUD. (este protótipo)", "var(--cyan)"],
              ["M1", "SEMANA 3–4", "Colyseus: sala 12 vagas, snapshots 20 Hz, predição + reconciliação do movimento.", "var(--cyan)"],
              ["M2", "SEMANA 5–6", "Hitscan autoritativo + lag comp, power-ups sincronizados, feed/placar em rede.", "var(--amber)"],
              ["M3", "SEMANA 7", "PWA final: SW, instalabilidade, controles touch/gamepad, orçamento de bundle.", "var(--amber)"],
              ["M4", "SEMANA 8", "Matchmaking MMR, anti-cheat camadas 3–5, QA chaos, deploy + monitoria.", "var(--red)"],
            ].map(([id, quando, txt, cor]) => (
              <div key={id} className="clip-panel border p-3 bg-[rgba(4,22,28,0.5)]" style={{ borderColor: `color-mix(in srgb, ${cor} 45%, transparent)` }}>
                <p className="font-display text-lg font-800" style={{ color: cor }}>{id}</p>
                <p className="font-display text-[0.55rem] tracking-[0.2em] text-[var(--dim)] mb-1.5">{quando}</p>
                <p className="text-xs text-[var(--dim)] font-medium leading-relaxed">{txt}</p>
              </div>
            ))}
          </div>
          <table className="doc-table">
            <thead><tr><th>Risco</th><th>Prioridade</th><th>Mitigação</th></tr></thead>
            <tbody>
              <tr>
                <td className="text-[var(--ice)] font-semibold">Mobile &lt; 30 fps com 12 corpos + sombras</td>
                <td><span className="chip" style={{ color: "var(--red)", borderColor: "rgba(255,56,96,0.6)" }}>ALTA</span></td>
                <td className="text-[var(--dim)] font-medium">DPR adaptativo em runtime (monitora frame-time), sombras off em coarse-pointer, LOD agressivo, cap de partículas.</td>
              </tr>
              <tr>
                <td className="text-[var(--ice)] font-semibold">Rubber-banding com jitter &gt; 120 ms</td>
                <td><span className="chip" style={{ color: "var(--red)", borderColor: "rgba(255,56,96,0.6)" }}>ALTA</span></td>
                <td className="text-[var(--dim)] font-medium">Buffer de interpolação adaptativo (80–140 ms), extrapolação curta, correção &lt; 0,4 m aplicada em 200 ms.</td>
              </tr>
              <tr>
                <td className="text-[var(--ice)] font-semibold">Um-tiro-um-abate × cheaters = frustração</td>
                <td><span className="chip" style={{ color: "var(--amber)", borderColor: "rgba(255,179,0,0.6)" }}>ALTA</span></td>
                <td className="text-[var(--dim)] font-medium">Spawn protection 1,5 s, raycast server-side obrigatório, rate-limit e replay auditável.</td>
              </tr>
              <tr>
                <td className="text-[var(--ice)] font-semibold">Pointer lock / áudio bloqueados no iOS</td>
                <td><span className="chip" style={{ color: "var(--amber)", borderColor: "rgba(255,179,0,0.6)" }}>MÉDIA</span></td>
                <td className="text-[var(--dim)] font-medium">Touch-look por drag como caminho primário mobile; AudioContext retomado no primeiro toque (já implementado).</td>
              </tr>
              <tr>
                <td className="text-[var(--ice)] font-semibold">Crescimento de bundle além de 1.5 MB</td>
                <td><span className="chip" style={{ color: "var(--cyan)", borderColor: "rgba(0,229,255,0.5)" }}>BAIXA</span></td>
                <td className="text-[var(--dim)] font-medium">Budget por rota no CI, lazy-load do dossiê e de modos extras, import seletivo do three.</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* deploy */}
        <section className={section}>
          <h2 className="doc-h text-base md:text-lg mb-5">07 · Checklist de implantação</h2>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {[
              "HTTPS em todo o domínio (SW e pointer lock exigem contexto seguro)",
              "Service Worker com versionamento + fluxo de atualização visível ao jogador",
              "manifest.webmanifest com ícones any/maskable e orientação landscape",
              "Assets imutáveis com hash no CDN + Brotli + cabeçalhos de cache longos",
              "index.html com cache curto (300 s) para troca rápida de versão",
              "Servidor de salas atrás de LB com sticky por sala; autoscale por CPU",
              "TLS 1.3 no WebSocket (wss://) e HSTS habilitado",
              "Telemetria de frame-time p95 e de latência por região",
              "Feature flags: sombras, DPR máx., taxa de snapshot (20/15 Hz)",
              "Plano de rollback: duas versões anteriores mantidas no CDN",
              "Teste de instalabilidade (Lighthouse PWA ≥ 95) no pipeline",
              "Partida de fumaça automatizada pós-deploy com 12 bots headless",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 py-1.5 border-b border-[rgba(111,163,176,0.1)]">
                <svg width="15" height="15" viewBox="0 0 24 24" className="mt-0.5 shrink-0" fill="none" stroke="var(--green)" strokeWidth="2.4"><path d="M4 12.5 9.5 18 20 6.5" /></svg>
                <span className="text-[var(--dim)] font-medium">{item}</span>
              </div>
            ))}
          </div>
        </section>

        <footer className="pb-10 pt-2 flex flex-wrap items-center justify-between gap-4">
          <p className="text-[var(--dim)] text-sm font-medium">
            VETOR-12 · protótipo de jogabilidade + plano de engenharia · Three.js · React · PWA
          </p>
          <button className="btn clip-btn btn-amber" onClick={onPlay}>Entrar na arena</button>
        </footer>
      </div>
    </div>
  );
}
