"use client";
import { useEffect } from "react";
import { bake } from "./td/pixel";
import { ENEMY_ART, EnemyKey, NEON, TOWER_ART, TowerKey } from "./td/art";
import { ENEMIES, ENEMY_ORDER, FALLBACK_ACCOUNT, TOWERS, statChips } from "./td/defs";
import { CORE_SEL, buildField } from "./td/field";
import { Game, Hooks, Stats, TowerInfo } from "./td/game";

/* ═══ Пасхалка №3: киберпанк-оборона счёта ═══
   Дашборд превращается в ночной квартал: карточки вёрстки — здания, зазоры
   между ними — улицы. По улицам к балансу в сайдбаре бегут списания, на крышах
   ставятся башни. Всё поле считается из реальных getBoundingClientRect, так что
   игра подстраивается под любой вариант меню и любую вкладку.

   Хук вешает свои слои НА BODY (вне .board): у fixed-элемента внутри
   трансформируемого предка ломается позиционирование, а .board во время
   попадания по ядру трясётся. */

// горячие клавиши идут в порядке колоды (от дешёвой к дорогой)
const HOT: TowerKey[] = TOWERS.map((t) => t.key);

/* Неон врага для подписей — берём тот же цвет «глаза», что и у спрайта
   (индекс 5 палитры: 0–3 корпус, 4–6 свечение). */
const ENEMY_NEON: Record<EnemyKey, string> = {
  pena: ENEMY_ART.pena.pal[5],
  commission: ENEMY_ART.commission.pal[5],
  fine: ENEMY_ART.fine.pal[5],
  tax: ENEMY_ART.tax.pal[5],
  block: ENEMY_ART.block.pal[5],
};

/* ── звук: коротким синтезом на WebAudio, без единого файла в репо ── */
function makeSfx() {
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  const lastAt = new Map<string, number>();
  let noise: AudioBuffer | null = null;

  const ensure = () => {
    if (ac) return ac;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ac = new Ctor();
    master = ac.createGain();
    master.gain.value = 0.11;
    master.connect(ac.destination);
    const len = ac.sampleRate * 0.4;
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  };

  const tone = (
    freq: number,
    to: number,
    dur: number,
    type: OscillatorType,
    gain: number
  ) => {
    const c = ensure();
    if (!c || !master) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
    o.connect(g).connect(master);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  };

  const hiss = (dur: number, freq: number, gain: number) => {
    const c = ensure();
    if (!c || !master || !noise) return;
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(freq, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.25), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
    src.connect(f).connect(g).connect(master);
    src.start();
    src.stop(c.currentTime + dur + 0.02);
  };

  return {
    play(name: string) {
      if (muted) return;
      // выстрелов бывает по десятку в секунду — режем частоту повторов
      const now = performance.now();
      const min = name === "shot" || name === "flame" || name === "die" ? 70 : 30;
      if (now - (lastAt.get(name) ?? -1e9) < min) return;
      lastAt.set(name, now);
      switch (name) {
        case "shot":
          tone(880, 320, 0.05, "square", 0.1);
          break;
        case "boom":
          hiss(0.2, 1400, 0.32);
          tone(150, 46, 0.22, "triangle", 0.16);
          break;
        case "zap":
          tone(2100, 180, 0.13, "sawtooth", 0.1);
          break;
        case "flame":
          hiss(0.16, 900, 0.1);
          break;
        case "die":
          tone(420, 120, 0.1, "square", 0.07);
          break;
        case "leak":
          tone(560, 70, 0.42, "sine", 0.24);
          hiss(0.3, 700, 0.14);
          break;
        case "build":
          tone(420, 880, 0.09, "square", 0.1);
          break;
        case "wave":
          tone(300, 300, 0.16, "square", 0.12);
          window.setTimeout(() => !muted && tone(450, 450, 0.22, "square", 0.12), 180);
          break;
      }
    },
    resume() {
      ensure()?.resume?.();
    },
    setMuted(v: boolean) {
      muted = v;
    },
    close() {
      ac?.close();
      ac = null;
      master = null;
    },
  };
}

/* ── баланс в сайдбаре: игра списывает с НАСТОЯЩЕЙ плашки ── */
function accountBinding() {
  const el = document.querySelector<HTMLElement>(CORE_SEL);
  const original = el?.textContent ?? null;
  const parsed = original
    ? parseFloat(original.replace(/[^\d,.-]/g, "").replace(/\s/g, "").replace(",", "."))
    : NaN;
  const start = Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_ACCOUNT;
  return {
    start,
    set(v: number) {
      if (!el) return;
      el.textContent =
        v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          .replace(/ /g, " ") + " ₽";
      el.classList.remove("td-drain");
      void el.offsetWidth; // рестарт анимации подсветки при частых утечках
      el.classList.add("td-drain");
    },
    restore() {
      if (el && original !== null) el.textContent = original;
      el?.classList.remove("td-drain");
    },
  };
}

const fmtMoney = (v: number) =>
  Math.round(v).toLocaleString("ru-RU").replace(/ /g, " ");

export function useTowers(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const sfx = makeSfx();
    const account = accountBinding();
    document.body.classList.add("td-armed");

    /* ── слои ── */
    const veil = document.createElement("div");
    veil.className = "td-veil";
    const canvas = document.createElement("canvas");
    canvas.className = "td-canvas";

    const hud = document.createElement("div");
    hud.className = "td-hud";
    hud.innerHTML =
      `<div class="td-cell"><span>ВОЛНА</span><b data-f="wave">—</b></div>` +
      `<div class="td-cell"><span>БЮДЖЕТ</span><b data-f="budget">—</b></div>` +
      `<div class="td-cell td-cell-core"><span>СЧЁТ</span><b data-f="account">—</b>` +
      `<i class="td-bar"><s data-f="bar"></s></i></div>` +
      `<div class="td-cell"><span>ОСТАЛОСЬ</span><b data-f="left">—</b></div>` +
      `<button class="td-next" data-f="next" type="button">ВОЛНА</button>` +
      `<button class="td-ico-btn td-restart" data-f="restart" type="button" aria-label="Начать заново">⟲</button>` +
      `<button class="td-ico-btn" data-f="pause" type="button" aria-label="Пауза (P)">❚❚</button>` +
      `<button class="td-ico-btn td-speed" data-f="speed" type="button" aria-label="Скорость">1×</button>` +
      `<button class="td-ico-btn td-mute" data-f="mute" type="button" aria-label="Звук">♪</button>`;

    const build = document.createElement("div");
    build.className = "td-build";
    build.innerHTML = TOWERS.map(
      (t, i) => `
      <button class="td-card" type="button" data-k="${t.key}" style="--neon:${NEON[t.key][1]};--neon-d:${NEON[t.key][0]}">
        <span class="td-hot">${i + 1}</span>
        <span class="td-ico" data-ico="${t.key}"></span>
        <span class="td-body">
          <span class="td-nm">${t.name}</span>
          <span class="td-ds">${t.desc}</span>
          <span class="td-stats">${statChips(t)
            .map((c) => `<i title="${c.title}"><u>${c.icon}</u>${c.text}</i>`)
            .join("")}</span>
        </span>
        <span class="td-cost">${t.cost} ₽</span>
      </button>`
    ).join("");

    /* ── бестиарий: сворачиваемая справка по врагам ──
       Живёт над колодой, поэтому его развёрнутый габарит меряется сразу и
       навсегда вырезается из поля: иначе разворот посреди партии прятал бы
       под собой улицу, а пересборка поля телепортировала бы врагов. */
    const bestiary = document.createElement("div");
    bestiary.className = "td-bestiary open";
    bestiary.innerHTML =
      `<button class="td-best-head" type="button" aria-expanded="true">` +
      `<span>ПРОТИВНИКИ</span><i class="td-chev"></i></button>` +
      // содержимое обёрнуто в один элемент: grid-template-rows:0fr схлопывает
      // ТОЛЬКО первую строку, а прямые дети сверх неё уехали бы в auto-строки
      `<div class="td-best-body"><div class="td-best-in">` +
      `<div class="td-best-row td-best-hdr"><span>ТИП</span><b>HP</b><b>СКОР</b><b>БР</b><b>УНОСИТ</b></div>` +
      ENEMY_ORDER.map((k) => {
        const e = ENEMIES[k];
        return (
          `<div class="td-best-row" style="--neon:${ENEMY_NEON[k]}" title="${e.name}">` +
          `<span class="td-best-nm"><i class="td-best-ico" data-eico="${k}"></i>${e.short ?? e.name}</span>` +
          `<b>${e.hp}</b><b>${e.speed}</b><b>${e.armor || "—"}</b>` +
          `<b class="td-best-steal">${Math.round(e.steal / 1000)}к ₽</b></div>`
        );
      }).join("") +
      `<p class="td-best-note">HP растёт с каждой волной, награда — тоже. ` +
      `Броня вычитается из каждого попадания; огонь «Неустойки» жжёт мимо брони.</p>` +
      `</div></div>`;

    const toast = document.createElement("div");
    toast.className = "td-toast";
    toast.innerHTML = `<b></b><i></i>`;

    /* Панель улучшения — прижимается к выбранной башне (координаты ставит JS). */
    const panel = document.createElement("div");
    panel.className = "td-tpanel";

    const over = document.createElement("div");
    over.className = "td-over";
    over.innerHTML =
      `<div class="td-over-in"><b data-f="ot"></b><i data-f="os"></i>` +
      `<div class="td-score">` +
      `<div><span>ВОЛН ПРОЙДЕНО</span><b data-f="sw">0</b></div>` +
      `<div><span>ЗАРАБОТАНО</span><b data-f="se">0 ₽</b></div>` +
      `<div><span>УНИЧТОЖЕНО</span><b data-f="sk">0</b></div>` +
      `</div>` +
      `<button class="td-again" type="button">ЗАНОВО</button>` +
      `<span class="td-exit">выход — «6», затем «7»</span></div>`;

    document.body.append(veil, canvas, hud, bestiary, build, panel, toast, over);

    // иконки в карточках — тот же арт, что и на поле
    build.querySelectorAll<HTMLElement>("[data-ico]").forEach((host) => {
      const key = host.dataset.ico as TowerKey;
      const b = bake(TOWER_ART[key], 2);
      b.c.className = "td-ico-c";
      b.c.style.width = `${b.c.width / 2}px`;
      b.c.style.height = `${b.c.height / 2}px`;
      host.appendChild(b.c);
    });
    // и в бестиарии — первый кадр ходьбы каждого врага
    bestiary.querySelectorAll<HTMLElement>("[data-eico]").forEach((host) => {
      const key = host.dataset.eico as EnemyKey;
      const a = ENEMY_ART[key];
      const b = bake({ w: a.w, h: a.h, pal: a.pal, ops: a.frames[0], outline: 8 }, 2);
      b.c.className = "td-ico-c";
      b.c.style.width = `${b.c.width / 2}px`;
      b.c.style.height = `${b.c.height / 2}px`;
      host.appendChild(b.c);
    });
    /* Бестиарий стоит колонкой над колодой: высота колоды известна только
       после вёрстки, поэтому отступ снизу проставляем здесь. Габарит берём
       через offsetWidth/Height — getBoundingClientRect в этот момент вернул бы
       смещение от ещё идущей анимации появления. */
    const deckH = build.offsetHeight;
    bestiary.style.bottom = `${deckH + 20}px`;
    const bestiaryBox = {
      x: 14,
      y: window.innerHeight - (deckH + 20) - bestiary.offsetHeight,
      width: bestiary.offsetWidth,
      height: bestiary.offsetHeight,
    };
    // габарит развёрнутого снят — сворачиваем; из поля вырезан всё равно он
    bestiary.classList.remove("open");
    bestiary.querySelector(".td-best-head")!.setAttribute("aria-expanded", "false");

    /* ── игра ── */
    let game: Game | null = null;
    let toastTimer = 0;
    let shakeTimer = 0;
    // последний тост запоминаем: им же подписывается финальный экран
    let lastToast: [string, string] = ["", ""];

    /* Тосты идут очередью: анонс волны и следом карточка нового противника
       не должны затирать друг друга. */
    const queue: { title: string; sub: string; danger?: boolean }[] = [];
    let toastBusy = false;
    const pumpToast = () => {
      const next = queue.shift();
      if (!next) {
        toastBusy = false;
        return;
      }
      toastBusy = true;
      lastToast = [next.title, next.sub];
      toast.querySelector("b")!.textContent = next.title;
      toast.querySelector("i")!.textContent = next.sub;
      toast.classList.toggle("danger", !!next.danger);
      toast.classList.remove("on");
      void toast.offsetWidth;
      toast.classList.add("on");
      clearTimeout(toastTimer);
      // объявления врагов и боссов висят дольше — их надо успеть прочитать
      toastTimer = window.setTimeout(
        () => {
          toast.classList.remove("on");
          toastTimer = window.setTimeout(pumpToast, 300);
        },
        next.danger ? 3000 : 2200
      );
    };
    const showToast = (title: string, sub?: string, danger?: boolean) => {
      queue.push({ title, sub: sub ?? "", danger });
      if (!toastBusy) pumpToast();
    };

    const showNewEnemy = (key: EnemyKey) => {
      const e = ENEMIES[key];
      showToast(
        `НОВЫЙ ПРОТИВНИК — ${e.name.toUpperCase()}`,
        `${e.hp} HP · скорость ${e.speed} · броня ${e.armor || "нет"} · уносит ${Math.round(
          e.steal / 1000
        )}к ₽`,
        true
      );
      // подсвечиваем его строку в бестиарии, даже если он свёрнут
      const row = bestiary.querySelector<HTMLElement>(`[data-eico="${key}"]`)?.closest<HTMLElement>(".td-best-row");
      row?.classList.remove("fresh");
      void row?.offsetWidth;
      row?.classList.add("fresh");
      bestiary.classList.add("ping");
      window.setTimeout(() => bestiary.classList.remove("ping"), 2400);
    };

    const f = (name: string) =>
      document.querySelector<HTMLElement>(`.td-hud [data-f="${name}"], .td-over [data-f="${name}"]`)!;
    const elWave = f("wave");
    const elBudget = f("budget");
    const elAccount = f("account");
    const elBar = f("bar");
    const elLeft = f("left");
    const elNext = f("next") as HTMLButtonElement;
    const elMute = f("mute") as HTMLButtonElement;
    const elPause = f("pause") as HTMLButtonElement;
    const elRestart = f("restart") as HTMLButtonElement;
    const elSpeed = f("speed") as HTMLButtonElement;

    let lastSel: TowerKey | null = null;
    const onStats = (s: Stats) => {
      elWave.textContent = `${Math.max(1, s.wave)} / ${s.waves}`;
      elBudget.textContent = `${fmtMoney(s.budget)} ₽`;
      elAccount.textContent = `${fmtMoney(s.account)} ₽`;
      elBar.style.width = `${Math.max(0, (s.account / s.accountMax) * 100)}%`;
      elBar.classList.toggle("low", s.account / s.accountMax < 0.35);
      elLeft.textContent = `${s.left} / ${s.waveTotal}`;
      elNext.textContent =
        s.countdown < 0 ? "ВОЛНА ИДЁТ" : `ВЫЗВАТЬ ВОЛНУ · ${s.countdown}`;
      elNext.disabled = s.countdown < 0;
      if (s.selected !== lastSel) {
        lastSel = s.selected;
        build.querySelectorAll<HTMLElement>(".td-card").forEach((c) => {
          c.classList.toggle("on", c.dataset.k === s.selected);
        });
      }
      // цена фиксированная, ценник проставлен при сборке карточек — здесь
      // остаётся только гасить те, на которые не хватает денег
      build.querySelectorAll<HTMLElement>(".td-card").forEach((c) => {
        const def = TOWERS.find((t) => t.key === c.dataset.k)!;
        c.classList.toggle("poor", s.budget < def.cost);
      });
      canvas.classList.toggle("aiming", !!s.selected);
      elPause.classList.toggle("on", s.paused);
      elPause.textContent = s.paused ? "▶" : "❚❚";
      elSpeed.textContent = `${s.speed}×`;
      elSpeed.classList.toggle("on", s.speed > 1);
      if (s.over && !over.classList.contains("on")) {
        f("ot").textContent = lastToast[0];
        f("os").textContent = lastToast[1];
        f("sw").textContent = String(s.over === "win" ? s.waves : Math.max(0, s.wave - 1));
        f("se").textContent = `${fmtMoney(s.earned)} ₽`;
        f("sk").textContent = String(s.kills);
        over.classList.add("on");
        over.classList.toggle("win", s.over === "win");
      }
    };

    /* ── панель улучшения выбранной башни ── */
    const showPanel = (info: TowerInfo | null) => {
      if (!info) {
        panel.classList.remove("on");
        return;
      }
      const pips = Array.from(
        { length: info.maxLvl },
        (_, i) => `<i class="${i < info.lvl ? "on" : ""}"></i>`
      ).join("");
      panel.style.setProperty("--neon", NEON[info.key][1]);
      panel.style.setProperty("--neon-d", NEON[info.key][0]);
      panel.innerHTML =
        `<div class="td-tp-head"><b>${info.name}</b><span class="td-tp-pips">${pips}</span></div>` +
        (info.frozen ? `<p class="td-tp-frozen">Обесточена до конца волны</p>` : "") +
        (info.upName
          ? `<button class="td-tp-up${info.affordable ? "" : " poor"}" type="button">` +
            `<span class="td-tp-nm">${info.upName}</span>` +
            `<span class="td-tp-ds">${info.upDesc}</span>` +
            `<span class="td-tp-cost">${info.upCost} ₽</span></button>`
          : `<p class="td-tp-max">Максимальный уровень</p>`) +
        `<button class="td-tp-sell" type="button">Продать · +${info.sell} ₽</button>`;
      // прижимаем панель над башней, не давая ей вылезти за экран
      const w = 226;
      panel.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, info.x - w / 2))}px`;
      panel.style.top = `${Math.max(8, info.y - 8)}px`;
      panel.classList.add("on");
    };

    const hooks: Hooks = {
      onStats,
      onAccount: (v: number) => account.set(v),
      onToast: (t, s) => showToast(t, s),
      onNewEnemy: showNewEnemy,
      onShake: () => {
        document.body.classList.add("td-hit");
        clearTimeout(shakeTimer);
        shakeTimer = window.setTimeout(() => document.body.classList.remove("td-hit"), 340);
      },
      sfx: (n) => sfx.play(n),
      sellZone: () => {
        const r = build.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      },
      onDragSell: (over, refund) => {
        build.classList.toggle("sell", !!refund);
        build.classList.toggle("sell-over", over);
        build.dataset.refund = refund ? `ПРОДАТЬ ЗА ${refund} ₽` : "";
      },
      onTowerPanel: showPanel,
    };

    /* Панели игры вырезаются из поля: под HUD, колодой и бестиарием врагов
       было бы не видно, а башня пряталась бы под панелью. Меряем по факту —
       размеры зависят от шрифта и длины подписей; у бестиария берём габарит
       РАЗВЁРНУТОГО, снятый до сворачивания. */
    const pad = (r: { x: number; y: number; width: number; height: number }) => ({
      x: r.x - 8,
      y: r.y - 8,
      w: r.width + 16,
      h: r.height + 16,
      r: 0,
      roof: false, // панели интерфейса — не крыши: ни башен, ни обводки
    });
    const uiRects = () => [
      pad(hud.getBoundingClientRect()),
      pad(build.getBoundingClientRect()),
      pad(bestiaryBox),
    ];

    const makeGame = () => {
      game?.destroy();
      const field = buildField(window.innerWidth, window.innerHeight, uiRects());
      game = new Game(canvas, field, account.start, hooks);
      game.start();
    };

    /* Поле снимается с живого DOM, поэтому мерить его можно только когда
       раскладка ВСТАЛА. При взятии инструмента закрывается панель tools, а её
       закрытие двигает контент дашборда своей анимацией (~0.55s) — снимок в
       следующем кадре давал зоны, съехавшие на величину этого сдвига.
       Ждём, пока прямоугольник контента не перестанет меняться. */
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
      const now = probe();
      steady = now === lastProbe ? steady + 1 : 0;
      lastProbe = now;
      // 4 неподвижных кадра подряд — либо предохранитель на ~1.5s
      if (steady >= 4 || ++frames > 90) {
        makeGame();
        return;
      }
      settleRaf = requestAnimationFrame(settle);
    };
    settleRaf = requestAnimationFrame(settle);

    /* ── ввод. Канвас на весь вьюпорт и лежит в fixed-слое, поэтому
       clientX/clientY — уже координаты поля, пересчёт не нужен ── */
    const onMove = (e: MouseEvent) => game?.move(e.clientX, e.clientY);
    const onLeave = () => game?.leave();

    /* Перетаскивание за пределы канваса (в колоду) обслуживается на document:
       мышь уходит с канваса, и его собственные mousemove/mouseup уже не придут.
       swallow гасит клик, который браузер шлёт после закончившегося перетаскивания. */
    let swallowClick = false;
    const onDocMove = (e: MouseEvent) => game?.pointerMove(e.clientX, e.clientY);
    const onDocUp = (e: MouseEvent) => {
      if (game?.pointerUp(e.clientX, e.clientY)) swallowClick = true;
    };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      sfx.resume(); // AudioContext стартует только после жеста пользователя
      if (game?.pointerDown(e.clientX, e.clientY)) e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (swallowClick) {
        swallowClick = false;
        return;
      }
      game?.closePanel(); // клик по пустому месту закрывает панель улучшения
      game?.click(e.clientX, e.clientY);
    };
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      game?.rightClick(e.clientX, e.clientY);
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("contextmenu", onCtx);
    document.addEventListener("mousemove", onDocMove);
    document.addEventListener("mouseup", onDocUp);

    const onCard = (e: MouseEvent) => {
      const card = (e.target as Element).closest<HTMLElement>(".td-card");
      if (!card) return;
      sfx.resume();
      game?.select(card.dataset.k as TowerKey);
    };
    build.addEventListener("click", onCard);

    const onNext = () => {
      sfx.resume();
      game?.callWave();
    };
    elNext.addEventListener("click", onNext);

    const onPause = () => game?.togglePause();
    elPause.addEventListener("click", onPause);
    const onSpeed = () => game?.toggleSpeed();
    elSpeed.addEventListener("click", onSpeed);

    // панель улучшения: делегируем — её содержимое перерисовывается целиком
    const onPanel = (e: MouseEvent) => {
      const el = e.target as Element;
      if (el.closest(".td-tp-up")) game?.upgrade();
      else if (el.closest(".td-tp-sell")) game?.sellOpen();
    };
    panel.addEventListener("click", onPanel);

    const bestHead = bestiary.querySelector<HTMLButtonElement>(".td-best-head")!;
    const onBest = () => {
      const open = bestiary.classList.toggle("open");
      bestHead.setAttribute("aria-expanded", String(open));
    };
    bestHead.addEventListener("click", onBest);

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
      account.restore();
      makeGame();
    };
    over.querySelector(".td-again")!.addEventListener("click", onAgain);

    /* Перезапуск посреди партии — в два клика: первый взводит кнопку на три
       секунды, второй сносит. Случайный промах по HUD не должен стирать
       полчаса обороны. */
    let armRestart = 0;
    const disarm = () => {
      clearTimeout(armRestart);
      armRestart = 0;
      elRestart.classList.remove("armed");
      elRestart.textContent = "⟲";
    };
    const onRestart = () => {
      if (armRestart) {
        disarm();
        onAgain();
        return;
      }
      elRestart.classList.add("armed");
      elRestart.textContent = "точно?";
      armRestart = window.setTimeout(disarm, 3000);
    };
    elRestart.addEventListener("click", onRestart);

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const num = /^Digit([1-5])$/.exec(e.code) ?? /^Numpad([1-5])$/.exec(e.code);
      if (num) {
        sfx.resume();
        game?.select(HOT[+num[1] - 1]);
        e.preventDefault();
        return;
      }
      if (e.code === "Space") {
        sfx.resume();
        game?.callWave();
        e.preventDefault();
        return;
      }
      if (e.code === "Escape") {
        game?.select(null);
        game?.closePanel();
      }
      if (e.code === "KeyP") game?.togglePause();
      if (e.code === "KeyF") game?.toggleSpeed();
    };
    document.addEventListener("keydown", onKey);

    /* ── сторож раскладки ──
       Поле — снимок геометрии дашборда, и любой сдвиг ПОСЛЕ съёмки оставлял бы
       его протухшим навсегда: зоны и обводки поехали бы относительно карточек.
       Сдвинуть могут не только ресайз (его событие можно и пропустить, если оно
       пришло до создания игры), но и доехавший шрифт, появившийся скроллбар,
       любая внешняя анимация. Поэтому вместо разовой съёмки — постоянная сверка
       якоря с DOM: разошлось больше чем на пиксель — пересобираем поле.
       Башни при этом переезжают по id слота и остаются на своих карточках. */
    const anchorOf = (): [number, number, number] | null => {
      const el = document.querySelector(".banners > .banner") ?? document.querySelector(".content");
      const r = el?.getBoundingClientRect();
      return r ? [r.left, r.top, r.width] : null;
    };
    let anchor = anchorOf();
    const resnap = () => {
      game?.setField(buildField(window.innerWidth, window.innerHeight, uiRects()));
      anchor = anchorOf();
    };
    const watchdog = window.setInterval(() => {
      if (!game) return;
      /* Во время тряски борда мерить нельзя: `body.td-hit` крутит transform на
         .board, а трансформ предка сдвигает clientRect ВСЕХ блоков внутри.
         Сторож принимал это за поехавшую раскладку и пересобирал поле прямо
         посреди анимации — башни перескакивали на соседние места. */
      if (document.body.classList.contains("td-hit")) return;
      const now = anchorOf();
      if (!now) return;
      if (!anchor) {
        anchor = now;
        return;
      }
      // допуск: субпиксельные шевеления раскладки пересборки не стоят
      const moved =
        Math.abs(now[0] - anchor[0]) > 6 ||
        Math.abs(now[1] - anchor[1]) > 6 ||
        Math.abs(now[2] - anchor[2]) > 6;
      if (moved) resnap();
    }, 250);

    // ресайз: пересобираем поле сразу, не дожидаясь тика сторожа
    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resnap, 180);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(settleRaf);
      clearTimeout(toastTimer);
      clearTimeout(shakeTimer);
      clearTimeout(resizeTimer);
      clearInterval(watchdog);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("mousemove", onDocMove);
      document.removeEventListener("mouseup", onDocUp);
      build.removeEventListener("click", onCard);
      elNext.removeEventListener("click", onNext);
      elPause.removeEventListener("click", onPause);
      elRestart.removeEventListener("click", onRestart);
      clearTimeout(armRestart);
      elSpeed.removeEventListener("click", onSpeed);
      panel.removeEventListener("click", onPanel);
      bestHead.removeEventListener("click", onBest);
      elMute.removeEventListener("click", onMute);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      game?.destroy();
      game = null;
      sfx.close();
      account.restore();
      veil.remove();
      canvas.remove();
      hud.remove();
      bestiary.remove();
      build.remove();
      panel.remove();
      toast.remove();
      over.remove();
      document.body.classList.remove("td-armed", "td-hit");
    };
  }, [active]);
}
