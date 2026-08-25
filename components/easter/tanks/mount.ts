"use client";
/* ═══ Тело пасхалки «Броневик» ═══
   Подключается только динамическим import() — движок и стили не достаются
   тем, кто просто открыл дашборд.

   Панель справа собрана по канону: сетка иконок оставшихся врагов, запас
   машин, флаг волны и счёт. */
import "@/styles/tanks.css";
import { buildArena } from "./arena";
import { Game, Hooks, LEVELS, Stats } from "./game";

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
    const len = ac.sampleRate * 0.5;
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
      if (now - (lastAt.get(n) ?? -1e9) < 40) return;
      lastAt.set(n, now);
      switch (n) {
        case "shot": tone(620, 220, 0.06, "square", 0.08); break;
        case "brick": hiss(0.09, 2400, 0.14); break;
        case "clink": tone(1700, 900, 0.04, "square", 0.06); break;
        case "boom": hiss(0.24, 1100, 0.26); tone(150, 45, 0.26, "triangle", 0.14); break;
        case "bigboom": hiss(0.45, 900, 0.34); tone(110, 32, 0.5, "triangle", 0.2); break;
        case "spawn": tone(280, 820, 0.14, "sawtooth", 0.06); break;
        case "warn": tone(880, 880, 0.07, "square", 0.05); break;
        case "bonus": tone(520, 1040, 0.12, "square", 0.07); break;
        case "pickup": tone(700, 1400, 0.1, "square", 0.09);
          window.setTimeout(() => !muted && tone(1040, 1560, 0.12, "square", 0.08), 90); break;
        case "base": tone(180, 36, 0.8, "sawtooth", 0.26); hiss(0.7, 640, 0.24); break;
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

  /* Панель сверху по центру: там же, где в обороне счёта, и садится она на
     бетон над заголовком — карта под ней всё равно вырезана. */
  const hud = document.createElement("div");
  hud.className = "tk-hud";
  hud.innerHTML =
    `<div class="tk-foes" data-f="foes"></div>` +
    `<div class="tk-block"><span>IP</span><b data-f="lives">3</b></div>` +
    `<div class="tk-block tk-flag"><i></i><b data-f="level">1</b></div>` +
    `<div class="tk-block tk-wide"><span>ОЧКИ</span><b data-f="score">0</b></div>` +
    `<div class="tk-block tk-wide"><span>ОРУЖИЕ</span><b data-f="weapon">★</b></div>` +
    `<div class="tk-buttons">` +
    `<button class="tk-btn" data-f="pause" type="button" aria-label="Пауза (P)">❚❚</button>` +
    `<button class="tk-btn" data-f="mute" type="button" aria-label="Звук">♪</button></div>` +
    `<div class="tk-status" data-f="status"></div>`;

  const help = document.createElement("div");
  help.className = "tk-help";
  help.innerHTML =
    `<b>Броневик</b>` +
    `<p><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> / <kbd>WASD</kbd> — ехать · <kbd>Пробел</kbd> — огонь</p>` +
    `<p class="tk-help-note">Кирпич простреливается, бетон — только со звездой. Вода не пускает танк, лёд заносит, в лесу вас почти не видно. База в середине карты — по ней бьют и свои снаряды.</p>`;

  const toast = document.createElement("div");
  toast.className = "tk-toast";
  toast.innerHTML = `<b></b><i></i>`;

  const over = document.createElement("div");
  over.className = "tk-over";
  over.innerHTML =
    `<div class="tk-over-in"><b data-f="ot"></b><i data-f="os"></i>` +
    `<div class="tk-score"><div><span>ВОЛНА</span><b data-f="sl">1</b></div>` +
    `<div><span>ОЧКИ</span><b data-f="ss">0</b></div></div>` +
    `<button class="tk-again" type="button">ЗАНОВО</button>` +
    `<span class="tk-exit">выход — Esc или «6», затем «7»</span></div>`;

  document.body.append(veil, canvas, hud, help, toast, over);

  const f = (n: string) => hud.querySelector<HTMLElement>(`[data-f="${n}"]`) ?? over.querySelector<HTMLElement>(`[data-f="${n}"]`)!;
  const elFoes = f("foes");
  const elLives = f("lives");
  const elLevel = f("level");
  const elScore = f("score");
  const elWeapon = f("weapon");
  const elStatus = f("status");
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
    toastTimer = window.setTimeout(() => toast.classList.remove("on"), 2000);
  };

  let lastFoes = -1;
  const onStats = (s: Stats) => {
    if (s.left !== lastFoes) {
      lastFoes = s.left;
      // сетка иконок: сколько танков ещё придёт
      elFoes.innerHTML = Array.from({ length: Math.min(s.left, 24) }, () => `<i></i>`).join("");
    }
    elLives.textContent = String(Math.max(0, s.lives));
    elLevel.textContent = `${s.level}/${s.levels}`;
    elScore.textContent = String(s.score);
    elWeapon.textContent = "★".repeat(s.weapon);
    elPause.textContent = s.paused ? "▶" : "❚❚";
    elPause.classList.toggle("on", s.paused);
    const marks: string[] = [];
    if (s.shield) marks.push("щит");
    if (s.freeze) marks.push("стоп");
    if (!s.base) marks.push("база пала");
    elStatus.textContent = marks.join(" · ");
    if (s.over && !over.classList.contains("on")) {
      f("ot").textContent = lastToast[0];
      f("os").textContent = lastToast[1];
      f("sl").textContent = String(s.level);
      f("ss").textContent = String(s.score);
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
      shakeTimer = window.setTimeout(() => document.body.classList.remove("tk-hit"), 320);
    },
    sfx: (n) => sfx.play(n),
  };

  const uiRects = () => [hud.getBoundingClientRect(), help.getBoundingClientRect()];

  let game: Game | null = null;
  let built = false;
  const build = () => {
    built = true;
    game?.destroy();
    game = new Game(canvas, buildArena(window.innerWidth, window.innerHeight, uiRects()), hooks);
    game.start();
  };

  /* Ждём, пока раскладка встанет: закрытие панели игр двигает контент своей
     анимацией. Плюс подстраховка таймером — в скрытой вкладке rAF не
     вызывается вообще, и без неё игрок вернулся бы к пустому экрану. */
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
    if (steady >= 4 || ++frames > 90) return void build();
    settleRaf = requestAnimationFrame(settle);
  };
  settleRaf = requestAnimationFrame(settle);
  const safety = window.setTimeout(() => { if (!built) build(); }, 700);

  const MOVE = new Set([
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyJ",
  ]);
  const onDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (MOVE.has(e.code)) {
      e.preventDefault(); // иначе стрелки и пробел скроллят страницу под игрой
      sfx.resume();
      game?.key(e.code, true);
      return;
    }
    if (e.code === "KeyP") game?.togglePause();
  };
  const onUp = (e: KeyboardEvent) => { if (MOVE.has(e.code)) game?.key(e.code, false); };
  const onBlur = () => MOVE.forEach((c) => game?.key(c, false));
  window.addEventListener("keydown", onDown, { passive: false });
  window.addEventListener("keyup", onUp);
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
  const onAgain = () => { over.classList.remove("on"); game?.restart(); };
  over.querySelector(".tk-again")!.addEventListener("click", onAgain);

  const onVisibility = () => game?.setHidden(document.hidden);
  document.addEventListener("visibilitychange", onVisibility);

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
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
    veil.remove(); canvas.remove(); hud.remove();
    help.remove(); toast.remove(); over.remove();
    document.body.classList.remove("tk-armed", "tk-hit");
  };
}

export { LEVELS };
