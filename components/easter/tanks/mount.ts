"use client";
/* ═══ Тело пасхалки «Броневик» ═══
   Как и у башен, подключается ТОЛЬКО динамическим import() — весь движок и
   стили лежат за ним и обычному посетителю дашборда не достаются. */
import "@/styles/tanks.css";
import { buildArena } from "./arena";
import { Game, Hooks, Stats } from "./game";

/* ── звук: тот же приём, что и в башнях, — короткий синтез без единого файла ── */
function makeSfx() {
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let noise: AudioBuffer | null = null;
  const lastAt = new Map<string, number>();

  const ensure = () => {
    if (ac) return ac;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ac = new Ctor();
    master = ac.createGain();
    master.gain.value = 0.1;
    master.connect(ac.destination);
    const len = ac.sampleRate * 0.4;
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  };
  const tone = (f: number, to: number, dur: number, type: OscillatorType, gain: number) => {
    const c = ensure();
    if (!c || !master) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
    o.connect(g).connect(master);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  };
  const hiss = (dur: number, f: number, gain: number) => {
    const c = ensure();
    if (!c || !master || !noise) return;
    const src = c.createBufferSource();
    src.buffer = noise;
    const flt = c.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.setValueAtTime(f, c.currentTime);
    flt.frequency.exponentialRampToValueAtTime(Math.max(80, f * 0.25), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
    src.connect(flt).connect(g).connect(master);
    src.start();
    src.stop(c.currentTime + dur + 0.02);
  };

  return {
    play(n: string) {
      if (muted) return;
      const now = performance.now();
      if (now - (lastAt.get(n) ?? -1e9) < 45) return;
      lastAt.set(n, now);
      switch (n) {
        case "shot": tone(660, 240, 0.06, "square", 0.09); break;
        case "brick": hiss(0.1, 2600, 0.16); break;
        case "steel": tone(1500, 700, 0.05, "square", 0.07); break;
        case "boom": hiss(0.26, 1200, 0.3); tone(140, 42, 0.28, "triangle", 0.15); break;
        case "spawn": tone(300, 900, 0.16, "sawtooth", 0.07); break;
        case "hurt": hiss(0.34, 900, 0.28); tone(320, 60, 0.36, "sine", 0.18); break;
        case "vault": tone(200, 40, 0.7, "sawtooth", 0.26); hiss(0.6, 700, 0.24); break;
      }
    },
    resume() { ensure()?.resume?.(); },
    setMuted(v: boolean) { muted = v; },
    close() { ac?.close(); ac = null; master = null; },
  };
}

export function mount(): () => void {
  const sfx = makeSfx();
  document.body.classList.add("tk-armed");

  const veil = document.createElement("div");
  veil.className = "tk-veil";
  const canvas = document.createElement("canvas");
  canvas.className = "tk-canvas";

  const hud = document.createElement("div");
  hud.className = "tk-hud";
  hud.innerHTML =
    `<div class="tk-cell"><span>УРОВЕНЬ</span><b data-f="level">1</b></div>` +
    `<div class="tk-cell"><span>БРОНЕВИКИ</span><b data-f="lives">3</b></div>` +
    `<div class="tk-cell"><span>ОСТАЛОСЬ</span><b data-f="left">0</b></div>` +
    `<div class="tk-cell tk-cell-vault"><span>ХРАНИЛИЩЕ</span><b data-f="vault">цело</b></div>` +
    `<button class="tk-btn" data-f="pause" type="button" aria-label="Пауза (P)">❚❚</button>` +
    `<button class="tk-btn" data-f="mute" type="button" aria-label="Звук">♪</button>`;

  const help = document.createElement("div");
  help.className = "tk-help";
  help.innerHTML =
    `<b>Броневик</b>` +
    `<p><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> или <kbd>WASD</kbd> — ехать</p>` +
    `<p><kbd>Пробел</kbd> — выстрел · <kbd>P</kbd> — пауза</p>` +
    `<p class="tk-help-note">Кирпич простреливается, сталь — нет. В кустах вас не видно. Не пустите их к хранилищу.</p>`;

  const toast = document.createElement("div");
  toast.className = "tk-toast";
  toast.innerHTML = `<b></b><i></i>`;

  const over = document.createElement("div");
  over.className = "tk-over";
  over.innerHTML =
    `<div class="tk-over-in"><b data-f="ot"></b><i data-f="os"></i>` +
    `<div class="tk-score"><div><span>УРОВЕНЬ</span><b data-f="sl">1</b></div>` +
    `<div><span>ПОДБИТО</span><b data-f="sk">0</b></div></div>` +
    `<button class="tk-again" type="button">ЗАНОВО</button>` +
    `<span class="tk-exit">выход — «6», затем «7»</span></div>`;

  document.body.append(veil, canvas, hud, help, toast, over);

  const f = (name: string) => document.querySelector<HTMLElement>(`[data-f="${name}"]`)!;
  const elLevel = f("level");
  const elLives = f("lives");
  const elLeft = f("left");
  const elVault = f("vault");
  const elPause = f("pause") as HTMLButtonElement;
  const elMute = f("mute") as HTMLButtonElement;

  let toastTimer = 0;
  let shakeTimer = 0;
  let lastToast: [string, string] = ["", ""];
  const showToast = (title: string, sub?: string) => {
    lastToast = [title, sub ?? ""];
    toast.querySelector("b")!.textContent = title;
    toast.querySelector("i")!.textContent = sub ?? "";
    toast.classList.remove("on");
    void toast.offsetWidth;
    toast.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("on"), 2400);
  };

  const onStats = (s: Stats) => {
    elLevel.textContent = `${s.level} / 10`;
    elLives.textContent = String(Math.max(0, s.lives));
    elLeft.textContent = String(s.left);
    elVault.textContent = s.vault ? "цело" : "вскрыто";
    elVault.classList.toggle("bad", !s.vault);
    elPause.textContent = s.paused ? "▶" : "❚❚";
    elPause.classList.toggle("on", s.paused);
    if (s.over && !over.classList.contains("on")) {
      f("ot").textContent = lastToast[0];
      f("os").textContent = lastToast[1];
      f("sl").textContent = String(s.level);
      f("sk").textContent = String(s.kills);
      over.classList.add("on");
      over.classList.toggle("win", s.over === "win");
    }
  };

  const hooks: Hooks = {
    onStats,
    onToast: showToast,
    onShake: () => {
      document.body.classList.add("tk-hit");
      clearTimeout(shakeTimer);
      shakeTimer = window.setTimeout(() => document.body.classList.remove("tk-hit"), 340);
    },
    sfx: (n) => sfx.play(n),
  };

  /* Панели вырезаем из арены: под ними всё равно ничего не видно. */
  const uiRects = () => [hud.getBoundingClientRect(), help.getBoundingClientRect()];

  let game: Game | null = null;
  let built = false;
  const build = () => {
    built = true;
    game?.destroy();
    game = new Game(canvas, buildArena(window.innerWidth, window.innerHeight, uiRects()), hooks);
    game.start();
  };

  /* Арену снимаем, когда раскладка встала: закрытие панели инструментов двигает
     контент своей анимацией, и снимок в следующем кадре был бы кривым. */
  let settleRaf = 0;
  const probe = () => {
    const el = document.querySelector(".content") ?? document.body;
    const r = el.getBoundingClientRect();
    return `${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}`;
  };
  let lastProbe = probe();
  let steady = 0;
  let frames = 0;
  const settle = () => {
    if (built) return;
    const now = probe();
    steady = now === lastProbe ? steady + 1 : 0;
    lastProbe = now;
    if (steady >= 4 || ++frames > 90) {
      build();
      return;
    }
    settleRaf = requestAnimationFrame(settle);
  };
  settleRaf = requestAnimationFrame(settle);
  /* Подстраховка по таймеру. В скрытой вкладке requestAnimationFrame не
     вызывается ВООБЩЕ (не «реже», а ноль раз), и цепочка ожидания раскладки
     повисает навсегда: игрок вернулся бы к пустому экрану. Таймеры в фоне
     работают, поэтому через 700 мс собираем арену независимо от кадров. */
  const safety = window.setTimeout(() => {
    if (!built) build();
  }, 700);

  /* ── ввод ── */
  const MOVE = new Set([
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyJ",
  ]);
  const onDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (MOVE.has(e.code)) {
      // иначе стрелки и пробел прокручивают страницу под игрой
      e.preventDefault();
      sfx.resume();
      game?.key(e.code, true);
      return;
    }
    if (e.code === "KeyP") game?.togglePause();
  };
  const onUp = (e: KeyboardEvent) => {
    if (MOVE.has(e.code)) game?.key(e.code, false);
  };
  // клавиши слушаем на window: фокус может быть на кнопке HUD
  window.addEventListener("keydown", onDown, { passive: false });
  window.addEventListener("keyup", onUp);
  // потеря фокуса окна оставила бы клавишу «зажатой» навсегда
  const onBlur = () => MOVE.forEach((c) => game?.key(c, false));
  window.addEventListener("blur", onBlur);

  const onPause = () => game?.togglePause();
  elPause.addEventListener("click", onPause);
  let muted = false;
  const onMute = () => {
    muted = !muted;
    sfx.setMuted(muted);
    elMute.classList.toggle("off", muted);
    elMute.textContent = muted ? "✕" : "♪";
  };
  elMute.addEventListener("click", onMute);
  const onAgain = () => {
    over.classList.remove("on");
    game?.restart();
  };
  over.querySelector(".tk-again")!.addEventListener("click", onAgain);

  const onVisibility = () => game?.setHidden(document.hidden);
  document.addEventListener("visibilitychange", onVisibility);

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    // арена печётся из DOM, поэтому при смене размера её проще собрать заново
    resizeTimer = window.setTimeout(build, 200);
  };
  window.addEventListener("resize", onResize);

  return () => {
    cancelAnimationFrame(settleRaf);
    clearTimeout(safety);
    clearTimeout(toastTimer);
    clearTimeout(shakeTimer);
    clearTimeout(resizeTimer);
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    elPause.removeEventListener("click", onPause);
    elMute.removeEventListener("click", onMute);
    game?.destroy();
    game = null;
    sfx.close();
    veil.remove();
    canvas.remove();
    hud.remove();
    help.remove();
    toast.remove();
    over.remove();
    document.body.classList.remove("tk-armed", "tk-hit");
  };
}
