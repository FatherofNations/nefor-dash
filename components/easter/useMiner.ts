"use client";
import { useEffect, useRef } from "react";

/* ═══ Пасхалка: игровые режимы поверх дашборда ═══
   Три слоя состояния:
   - СЕССИЯ (session = режим включён): «мир» — добытые цели, схлопнутые слоты,
     HP целей. Живёт всю сессию, восстанавливается ТОЛЬКО при выходе.
   - ИНСТРУМЕНТ (tool): "pickaxe" — кирка (зажал и копаешь, звук, трещины по
     таймеру) или "rpg" — скиллы (перспектива, Q/W/E, урон по HP, музыка).
     Смена/снятие инструмента мир не трогает.
   Всё через делегирование на document (переживает ремаунты
   dangerouslySetInnerHTML-контента) + полный cleanup (StrictMode). */

export type EasterTool = "pickaxe" | "rpg";

// ── кирка: звук копания длится 3.5s; блок ломается на 1.0s РАНЬШЕ конца
// дорожки — финальный «хруст» дозвучивает поверх разлёта. Стадии 0.4/1.1/1.8s
const STAGE_MS = 700;
const FIRST_MS = 400;
const PARTS = 14; // частиц на разрушение
const CRACKS = ["crack1", "crack2", "crack3"];
// палитры частиц по целям (цвета фонов и арта)
const PART_COLORS: Record<string, string[]> = {
  red: ["#ef3124", "#c22417", "#3123d9", "#a8e610"],
  dark: ["#111", "#2b2b2b", "#8b8b90", "#c9c9ce"],
  blue: ["#3b65ed", "#2b4fc4", "#b39cf0", "#e8590c"],
  luck: ["#9eff01", "#7fd400", "#111c00", "#c6ff4d"],
};

// ── РПГ: трек кладёт пользователь (в репо НЕ вшит); старт с 49-й секунды
const RPG_THEME_SRC = "/assets/easter/rpg-theme.mp3";
const RPG_THEME_START = 49;
// бой с боссом «Продажи»: сумма блоков = 1000 (3 баннера × 300 + тег 100)
const HP_BANNER = 300;
const HP_LUCK = 100;
const BOSS_MAX = 1000;
const BOSS_HEAL_PCT = 0.1; // хил босса за ход: 10% от ТЕКУЩЕГО HP
const BURN_DMG = 15;
const BURN_TURNS = 2;
const CRIT_CHANCE = 0.15;
const CRIT_SCALE = 1.6;
/* Скиллы и экономика ОД (очков действий) — по референсу жанра: базовая атака
   ГЕНЕРИРУЕТ ОД, сильные навыки тратят, дорогой бафф копится; +1 ОД пассивно
   каждый ход. Щиты-иконки впитывают удар целиком, горящий враг теряет щит в
   начале хода, мульти-удар с доп.ударом от крита. Тексты и названия свои. */
const AP_START = 3;
const AP_MAX = 9;
const PLAYER_MAX = 500; // HP игрока «Продукт»
const BOSS_HIT_MIN = 16; // босс бьёт игрока в фазе результатов
const BOSS_HIT_MAX = 28;
const DEFAULT_VOLUME = 0.22; // музыка по умолчанию вдвое тише прежнего
const DEFEAT_OUTRO_S = 15; // при поражении — последние 15с трека, и тишина
type SkillKind = "attack" | "risk" | "meeting";
// откатов НЕТ: скилл доступен, если хватает ОД
const SKILLS: {
  key: string; code: string; name: string; desc: string;
  min: number; max: number; ap: number; gain: number;
  color: string; hits: number; kind: SkillKind; hidden?: boolean;
}[] = [
  { key: "A", code: "KeyA", name: "Платёж", desc: "Базовая атака: 18–26 урона. Генерирует +1 ОД.", min: 18, max: 26, ap: 0, gain: 1, color: "#e9e7de", hits: 1, kind: "attack" },
  { key: "Q", code: "KeyQ", name: "Холды", desc: "55–70 урона огнём и поджиг: −15 HP цели два хода (мимо защиты). Горящий босс теряет 1 защиту в начале хода.", min: 55, max: 70, ap: 2, gain: 0, color: "#ff6a3d", hits: 1, kind: "attack" },
  { key: "W", code: "KeyW", name: "Овердрафт", desc: "85–110 урона льдом. Замороженная цель не лечится в этот ход.", min: 85, max: 110, ap: 3, gain: 0, color: "#4db8ff", hits: 1, kind: "attack" },
  { key: "E", code: "KeyE", name: "Кассовый разрыв", desc: "4–6 ударов по 14–20. Каждый удар снимает 1 защиту босса, крит добавляет удар.", min: 14, max: 20, ap: 3, gain: 0, color: "#ffd34d", hits: 5, kind: "attack" },
  { key: "R", code: "KeyR", name: "Риск блокировки", desc: "", min: 0, max: 0, ap: 4, gain: 0, color: "#ff9c26", hits: 0, kind: "risk" },
  { key: "F", code: "KeyF", name: "Встреча в 9 утра", desc: "Продажи заняты планёркой: босс больше не получает защиту. Мгновенно, один раз.", min: 0, max: 0, ap: 4, gain: 0, color: "#7a63f1", hits: 0, kind: "meeting", hidden: true },
];

/* ── бафф «Риск блокировки»: 2 уровня, растит урон всех скиллов ──
   Состояния виджета «Индикатор риска» — из дизайн-файла индикатора
   (60291:18624 средний / 60291:18458 высокий), ассеты в assets/easter. */
const RISK_MULT = [1, 2, 4]; // множитель урона всех скиллов по уровню риска
const RISK_DESC = [
  "Повышает риск блокировки: урон всех скиллов ×2. Можно дважды.",
  "Риск средний (урон ×2). Ещё раз — высокий: ×4.",
  "Риск максимальный: урон всех скиллов ×4.",
];
const RISK_STATES = [
  null,
  {
    cls: "risk-mid",
    gauge: "/assets/easter/risk-gauge-mid.svg",
    icon: "/assets/easter/risk-ico-mid.svg",
    title: "Средний риск",
    desc: "Некоторые действия компании<br>нарушают требования 115-ФЗ",
    rows: ["/assets/easter/risk-warn.svg", "/assets/easter/risk-warn.svg", "/assets/figma/wgCheck.svg"],
  },
  {
    cls: "risk-high",
    gauge: "/assets/easter/risk-gauge-high.svg",
    icon: "/assets/easter/risk-ico-high.svg",
    title: "Высокий риск",
    desc: "Действия компании нарушают<br>требования 115-ФЗ",
    rows: ["/assets/easter/risk-flash.svg", "/assets/easter/risk-flash.svg", "/assets/easter/risk-warn.svg"],
  },
] as const;

// применить состояние риска к виджету (DOM партиала; рестор — restoreRiskState)
function applyRiskState(level: 1 | 2) {
  const w = document.querySelector<HTMLElement>(".widget.wg-risk");
  const s = RISK_STATES[level]!;
  if (!w) return;
  w.classList.add("risk-state");
  w.classList.remove("risk-mid", "risk-high");
  w.classList.add(s.cls);
  const gin = w.querySelector<HTMLElement>(".gauge-in");
  if (gin) {
    let g = gin.querySelector<HTMLElement>(".risk-gauge");
    if (!g) {
      g = document.createElement("span");
      g.className = "risk-gauge";
      g.innerHTML = `<img alt="">`;
      gin.appendChild(g);
    }
    g.querySelector("img")!.src = s.gauge;
  }
  const c = w.querySelector<HTMLElement>(".gauge-c");
  if (c) {
    const img = c.querySelector("img");
    if (img) img.src = s.icon;
    const t = c.querySelector(".g-t");
    if (t) t.textContent = s.title;
    const d = c.querySelector(".g-d");
    if (d) d.innerHTML = s.desc;
  }
  w.querySelectorAll<HTMLImageElement>(".wg-list .wg-li:not(.dim) img").forEach((img, i) => {
    if (s.rows[i]) img.src = s.rows[i];
  });
}

// полный рестор «мира» (баннеры/тег/частицы/HP-бары/виджет риска):
// зовётся при выходе из режима И при каждом взятии инструмента (новая партия)
function restoreWorldDom() {
  const s = document.querySelector<HTMLElement>(".banners");
  if (s) {
    s.classList.remove("collapsing", "red-mined");
    s.style.height = "";
    s.style.marginTop = "";
    s.querySelectorAll<HTMLElement>(".banner").forEach((b) => {
      b.classList.remove("mined", "slot-collapse", "rpg-shake", "crack1", "crack2", "crack3");
      b.style.width = "";
    });
    s.querySelectorAll(".banner-tilt").forEach((t) => t.classList.remove("rpg-shake"));
  }
  const luck = document.querySelector<HTMLElement>(".chips .chip.luck");
  if (luck) {
    luck.classList.remove("mined", "luck-collapse", "rpg-shake", "crack1", "crack2", "crack3");
    luck.style.width = "";
  }
  document
    .querySelectorAll(".mine-part, .rpg-hp, .rpg-dmg, .rpg-victory, .rpg-defeat, .rpg-fly")
    .forEach((p) => p.remove());
  restoreRiskState();
  // если хореография риска оборвалась на «Моих продуктах» — вернуть AI-Сводку
  if (document.body.classList.contains("products")) {
    document.querySelector<HTMLElement>('.tabs .tab[data-pane="ai"]')?.click();
  }
}

// вернуть виджет к исходному «Низкому риску» (значения из партиала)
function restoreRiskState() {
  const w = document.querySelector<HTMLElement>(".widget.wg-risk");
  if (!w) return;
  w.classList.remove("risk-state", "risk-mid", "risk-high", "risk-fading");
  w.querySelector(".risk-gauge")?.remove();
  const c = w.querySelector<HTMLElement>(".gauge-c");
  if (c) {
    const img = c.querySelector("img");
    if (img) img.src = "/assets/figma/wgCashlessTips.svg";
    const t = c.querySelector(".g-t");
    if (t) t.textContent = "Низкий риск";
    const d = c.querySelector(".g-d");
    if (d) d.innerHTML = "Действия компании<br>не нарушают требования 115-ФЗ";
  }
  w.querySelectorAll<HTMLImageElement>(".wg-list .wg-li:not(.dim) img").forEach((img) => {
    img.src = "/assets/figma/wgCheck.svg";
  });
}

export function useMiner(session: boolean, tool: EasterTool | null, onMined: () => void) {
  const minedRef = useRef(0); // прогресс сессии (баннеры) — переживает смену инструмента
  const collapseTimerRef = useRef(0);
  const luckTimerRef = useRef(0); // схлопывание тега — тоже сессионное
  const slotTimersRef = useRef<number[]>([]); // схлопывание слотов баннеров
  const hpRef = useRef(new Map<HTMLElement, number>()); // HP целей (режим РПГ)
  const riskRef = useRef(0); // уровень риска блокировки (0/1/2) — бафф урона
  const riskTimersRef = useRef<number[]>([]); // хореография смены вкладок/состояния
  const mutedRef = useRef(false); // выключение музыки — помнится между взятиями меча
  const volumeRef = useRef(DEFAULT_VOLUME); // громкость (ползунок) — тоже помнится

  /* ── сессия: рестор «мира» только при выходе из режима ── */
  useEffect(() => {
    if (!session) return;
    minedRef.current = 0;
    hpRef.current = new Map();
    riskRef.current = 0;
    return () => {
      clearTimeout(collapseTimerRef.current);
      clearTimeout(luckTimerRef.current);
      slotTimersRef.current.forEach((t) => clearTimeout(t));
      slotTimersRef.current = [];
      riskTimersRef.current.forEach((t) => clearTimeout(t));
      riskTimersRef.current = [];
      minedRef.current = 0;
      hpRef.current = new Map();
      riskRef.current = 0;
      restoreWorldDom();
    };
  }, [session]);

  /* ── инструмент: обработчики. Каждое взятие инструмента = НОВАЯ ПАРТИЯ:
     мир, HP, риск и счёт сбрасываются (перезагрузка страницы не нужна) ── */
  useEffect(() => {
    if (!session || !tool) return;

    clearTimeout(collapseTimerRef.current);
    clearTimeout(luckTimerRef.current);
    slotTimersRef.current.forEach((t) => clearTimeout(t));
    slotTimersRef.current = [];
    riskTimersRef.current.forEach((t) => clearTimeout(t));
    riskTimersRef.current = [];
    minedRef.current = 0;
    hpRef.current = new Map();
    riskRef.current = 0;
    restoreWorldDom();

    /* ─── общий слой «мира» (нужен обоим инструментам) ─── */
    const targetOf = (el: Element | null): HTMLElement | null =>
      (el?.closest?.(
        ".banner-tilt .banner, .banners > .banner.dark, .banners > .banner.blue, .chips .chip.luck"
      ) as HTMLElement) ?? null;

    const clearCracks = (b: HTMLElement) => b.classList.remove(...CRACKS);

    // трещины — «мировое» состояние: у повреждённых скиллами целей они
    // выводятся из HP. После сброса кирки восстанавливаем их из hpRef,
    // иначе недокоп стирал бы урон, нанесённый в режиме РПГ.
    const syncCracksFromHp = (b: HTMLElement) => {
      const hp = hpRef.current.get(b);
      if (hp === undefined || b.classList.contains("mined")) return;
      const max = b.classList.contains("luck") ? HP_LUCK : HP_BANNER;
      const frac = hp / max;
      b.classList.toggle("crack1", frac <= 0.75 && hp > 0);
      b.classList.toggle("crack2", frac <= 0.45 && hp > 0);
      b.classList.toggle("crack3", frac <= 0.2 && hp > 0);
    };

    const spawnParticles = (b: HTMLElement) => {
      const kind = b.classList.contains("luck")
        ? "luck"
        : b.classList.contains("dark")
          ? "dark"
          : b.classList.contains("blue")
            ? "blue"
            : "red";
      const colors = PART_COLORS[kind];
      const r = b.getBoundingClientRect();
      const frag = document.createDocumentFragment();
      for (let i = 0; i < PARTS; i++) {
        const p = document.createElement("i");
        p.className = "mine-part";
        const px = r.left + 8 + Math.random() * (r.width - 16);
        const py = r.top + 8 + Math.random() * (r.height - 16);
        const dx = (Math.random() - 0.5) * 180;
        p.style.cssText = `left:${px}px;top:${py}px;background:${colors[i % colors.length]};` +
          `--mx:${dx * 0.45}px;--my:${-30 - Math.random() * 50}px;--mr:${(Math.random() - 0.5) * 240}deg;` +
          `--ex:${dx}px;--ey:${60 + Math.random() * 90}px;--er:${(Math.random() - 0.5) * 520}deg;`;
        frag.appendChild(p);
        setTimeout(() => p.remove(), 700);
      }
      // в body: координаты из getBoundingClientRect — экранные; под наклонённым
      // .board (режим РПГ) вложение в борд проецировало бы их дважды
      document.body.appendChild(frag);
    };

    const collapseBanners = () => {
      const s = document.querySelector<HTMLElement>(".banners");
      if (!s) return;
      s.style.height = `${s.offsetHeight}px`;
      s.classList.add("collapsing");
      void s.offsetHeight; // reflow: стартовая высота применена
      s.style.height = "0px";
      s.style.marginTop = "0px";
    };

    // разрушение цели: общее для кирки и скиллов
    const destroyTarget = (b: HTMLElement) => {
      clearCracks(b);
      spawnParticles(b);
      b.classList.add("mined");
      b.querySelector(".rpg-hp")?.remove();
      onMined();
      if (b.classList.contains("luck")) {
        // тег «НА УДАЧУ»: после попа схлопываем ширину — соседи отцентруются
        luckTimerRef.current = window.setTimeout(() => {
          b.style.width = `${b.offsetWidth}px`;
          void b.offsetWidth;
          b.classList.add("luck-collapse");
        }, 260);
        return;
      }
      // повёрнутый красный тянет за собой бледную подложку
      const tilt = b.closest(".banner-tilt");
      if (tilt) b.closest(".banners")?.classList.add("red-mined");
      // после попа слот баннера освобождается — соседи подтягиваются влево;
      // слот красного в потоке — его бледная подложка .faded
      const slot = tilt
        ? b.closest(".banners")?.querySelector<HTMLElement>(".banner.red.faded")
        : b;
      if (slot) {
        slotTimersRef.current.push(
          window.setTimeout(() => {
            slot.style.width = `${slot.offsetWidth}px`;
            void slot.offsetWidth;
            slot.classList.add("slot-collapse");
          }, 260)
        );
      }
      minedRef.current++; // только баннеры двигают схлопывание секции
      if (minedRef.current >= 3) {
        collapseTimerRef.current = window.setTimeout(collapseBanners, 380);
      }
    };

    /* ═══════════════ КИРКА ═══════════════ */
    if (tool === "pickaxe") {
      const cur = document.createElement("div");
      cur.className = "pickaxe-cur";
      cur.style.visibility = "hidden"; // не светить в углу (0,0) до первого движения мыши
      cur.innerHTML = `<img src="/assets/easter/pickaxe.png" alt="" width="42" height="48">`;
      document.body.appendChild(cur);
      document.body.classList.add("mine-armed");

      // звук копания: играет только пока кнопка зажата на цели;
      // при успешном разрушении дозвучивает финал
      const dig = new Audio("/assets/easter/dig.mp3");
      dig.preload = "auto";

      let raf = 0;
      const onMove = (e: MouseEvent) => {
        const el = e.target as Element | null;
        const overUi = !!el?.closest?.(".nbar, .spot, .chat");
        const overBoard = !!el?.closest?.(".board");
        cur.style.visibility = overBoard && !overUi ? "visible" : "hidden";
        cancelAnimationFrame(raf);
        const x = e.clientX;
        const y = e.clientY;
        raf = requestAnimationFrame(() => {
          // хотспот — остриё (после зеркала — правый конец головы: ≈39px/9px от 42×48)
          cur.style.transform = `translate(${x - 39}px, ${y - 9}px)`;
        });
      };

      let target: HTMLElement | null = null;
      let stage = 0;
      let timer = 0;
      let swingOnceTimer = 0;

      const stopMining = (resetCracks: boolean) => {
        clearTimeout(timer);
        cur.classList.remove("swing");
        if (target && resetCracks && !target.classList.contains("mined")) {
          clearCracks(target);
          syncCracksFromHp(target); // урон РПГ-скиллов недокоп не стирает
          dig.pause(); // недокопал — звук обрывается; при успехе финал дозвучит
          dig.currentTime = 0;
        }
        target = null;
        stage = 0;
      };

      const step = () => {
        if (!target) return;
        stage++;
        if (stage <= CRACKS.length) {
          target.classList.add(CRACKS[stage - 1]);
          timer = window.setTimeout(step, STAGE_MS);
        } else {
          const b = target;
          stopMining(false);
          destroyTarget(b);
        }
      };

      const onDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        const el = e.target as Element | null;
        if (!el?.closest?.(".board")) return; // панель/фаб живут обычной жизнью
        if (el.closest(".nbar, .spot, .chat")) return; // нейро-оверлеи — не игровая зона
        const b = targetOf(el);
        if (b && !b.classList.contains("mined")) {
          e.preventDefault(); // не выделять текст баннера при зажатии
          target = b;
          stage = 0;
          clearTimeout(swingOnceTimer);
          cur.classList.remove("swing-once"); // не даём одиночному маху перебить цикл
          cur.classList.add("swing");
          dig.currentTime = 0;
          dig.play().catch(() => {}); // автоплей-политика: без жеста просто молчим
          timer = window.setTimeout(step, FIRST_MS);
        } else {
          // мах в пустоту
          cur.classList.remove("swing-once");
          void cur.offsetWidth;
          cur.classList.add("swing-once");
          clearTimeout(swingOnceTimer);
          swingOnceTimer = window.setTimeout(() => cur.classList.remove("swing-once"), 300);
        }
      };
      const onUp = (e: MouseEvent) => {
        if (e.button !== 0) return; // отпускание другой кнопки не сбивает копание
        stopMining(true);
      };
      // увёл курсор с баннера, не отпуская кнопку — прогресс сходит (как в игре)
      const onOver = (e: MouseEvent) => {
        if (target && targetOf(e.target as Element) !== target) stopMining(true);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mousedown", onDown);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("mouseover", onOver);

      return () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mousedown", onDown);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("mouseover", onOver);
        cancelAnimationFrame(raf);
        clearTimeout(swingOnceTimer);
        stopMining(true); // прервать текущее копание
        dig.pause();
        dig.removeAttribute("src");
        dig.load(); // только load() реально обрывает загрузку и освобождает ресурс
        cur.remove();
        document.body.classList.remove("mine-armed");
        // сложили инструмент — партия закончилась: мир восстанавливается сразу
        restoreWorldDom();
      };
    }

    /* ═══════ РПГ: пошаговый бой «Продукт» против босса «Продажи» ═══════
       Ход: выбор скилла → фаза ПРИЦЕЛИВАНИЯ (остаётся одна карточка, борд
       подъезжает левее — цели по центру) → клик по цели → резолюция (экран
       ровный, скиллы спрятаны): партиклы летят от карточки → урон → хил босса
       и +защита → ответный удар босса по игроку → возврат. ОД: старт 3, кап 9,
       +1 пассивно за ход; базовая атака генерит +1; R/«Встреча» — мгновенные. */
    document.body.classList.add("rpg-armed"); // перспектива дашборда (CSS)

    // карточки скиллов слева (стоимость — ромбы ОД; «Встреча» скрыта до 50% HP)
    const panel = document.createElement("div");
    panel.className = "rpg-skills";
    panel.innerHTML = SKILLS.map(
      (s, i) => `
      <button class="rpg-skill${s.hidden ? " hidden" : ""}" data-i="${i}" style="--i:${i};--clr:${s.color}">
        <span class="rpg-slab"></span>
        <span class="rpg-key">${s.key}</span>
        <span class="rpg-body">
          <span class="rpg-name">${s.name}</span>
          <span class="rpg-desc">${s.kind === "risk" ? RISK_DESC[0] : s.desc}</span>
        </span>
        <span class="rpg-cost"><i></i><b>${s.ap}</b></span>
      </button>`
    ).join("");
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("on"));

    /* «живые» карточки: магнит к курсору — как у пилюли поиска на v2
       (радиус, лёгкий сдвиг за курсором, подрастание); после входа (.live),
       в прицеливании выключен. Пишем per-card CSS-переменные, transform
       собирает их одной строкой — транзишен сглаживает. */
    let magnetRaf = 0;
    const resetMagnet = (card: HTMLElement) => {
      card.style.setProperty("--cx", "0px");
      card.style.setProperty("--cy", "0px");
      card.style.setProperty("--cs", "1");
    };
    const onMagnet = (e: MouseEvent) => {
      if (!panel.classList.contains("live") || aiming >= 0) return;
      const mx = e.clientX;
      const my = e.clientY;
      cancelAnimationFrame(magnetRaf);
      magnetRaf = requestAnimationFrame(() => {
        panel.querySelectorAll<HTMLElement>(".rpg-skill").forEach((card) => {
          if (card.classList.contains("cd") || card.classList.contains("max") || card.classList.contains("hidden")) {
            resetMagnet(card);
            return;
          }
          const r = card.getBoundingClientRect();
          const dx = mx - (r.left + r.width / 2);
          const dy = my - (r.top + r.height / 2);
          const dist = Math.hypot(dx, dy);
          const R = 190;
          if (dist < R) {
            const f = 1 - dist / R;
            card.style.setProperty("--cx", `${Math.max(-7, Math.min(7, dx * 0.09 * f))}px`);
            card.style.setProperty("--cy", `${Math.max(-6, Math.min(6, dy * 0.07 * f))}px`);
            card.style.setProperty("--cs", `${1 + 0.035 * f}`);
          } else {
            resetMagnet(card);
          }
        });
      });
    };
    document.addEventListener("mousemove", onMagnet);

    // панель игрока «Продукт» снизу по центру: HP + ромбы ОД
    const playerEl = document.createElement("div");
    playerEl.className = "rpg-player";
    playerEl.innerHTML =
      `<span class="rpg-slab"></span>` +
      `<img class="rpg-hero" src="/assets/easter/rpg-player.png" alt="">` +
      `<span class="rpg-apgem"><i></i><b class="rpg-ap-num">${AP_START}</b></span>` +
      `<span class="rpg-player-name">Продукт</span>` +
      `<span class="rpg-hpwrap"><span class="rpg-player-bar"><i style="width:100%"></i></span>` +
      `<span class="rpg-player-hp"></span></span>`;
    document.body.appendChild(playerEl);
    requestAnimationFrame(() => playerEl.classList.add("on"));

    // босс-бар сверху по центру
    const bossEl = document.createElement("div");
    bossEl.className = "rpg-boss";
    bossEl.innerHTML =
      `<span class="rpg-slab"></span>` +
      `<span class="rpg-villain"><img src="/assets/easter/rpg-boss.png" alt=""></span>` +
      `<span class="rpg-boss-name">Продажи</span>` +
      `<span class="rpg-boss-armor"></span>` +
      `<span class="rpg-boss-bar"><i style="width:100%"></i></span>` +
      `<span class="rpg-boss-hp"></span>`;
    document.body.appendChild(bossEl);
    requestAnimationFrame(() => bossEl.classList.add("on"));

    // музыка: файл кладёт пользователь; нет файла — режим работает молча
    const theme = new Audio(RPG_THEME_SRC);
    theme.preload = "auto";
    theme.volume = volumeRef.current;
    theme.muted = mutedRef.current;
    const startTheme = () => {
      theme.currentTime = RPG_THEME_START;
      theme.play().catch(() => {});
    };
    startTheme();
    theme.addEventListener("ended", startTheme); // луп с той же 49-й секунды

    // кнопка звука над фабом tools
    const mute = document.createElement("button");
    mute.className = "rpg-mute" + (mutedRef.current ? " muted" : "");
    mute.title = "Звук";
    mute.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M4 9.5h3.5L13 5v14l-5.5-4.5H4z" fill="currentColor" stroke="none"/>` +
      `<path class="mw" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>` +
      `<path class="mx" d="M16.5 9.5l5 5M21.5 9.5l-5 5"/></svg>`;
    mute.addEventListener("click", () => {
      mutedRef.current = !mutedRef.current;
      theme.muted = mutedRef.current;
      mute.classList.toggle("muted", mutedRef.current);
    });
    // ползунок громкости — раскрывается по наведению на кнопку
    const vol = document.createElement("div");
    vol.className = "rpg-vol";
    vol.innerHTML = `<input type="range" min="0" max="100" value="${Math.round(volumeRef.current * 100)}" aria-label="Громкость">`;
    vol.addEventListener("click", (e) => e.stopPropagation()); // не тогглить mute
    vol.querySelector("input")!.addEventListener("input", (e) => {
      volumeRef.current = +(e.target as HTMLInputElement).value / 100;
      theme.volume = volumeRef.current;
    });
    mute.appendChild(vol);
    document.body.appendChild(mute);

    /* ── маркер цели под курсором (ховер в фазе прицеливания) ──
       Живёт в .board-body: наследует перспективу борда и скролл. Внутрь
       баннера положить нельзя — у него overflow:hidden, метки обрезало бы. */
    const boardBody = document.querySelector<HTMLElement>(".board-body");
    const aimMark = document.createElement("div");
    aimMark.className = "rpg-aim";
    aimMark.innerHTML = `<i class="t"></i><i class="b"></i>`;
    boardBody?.appendChild(aimMark);

    const placeAim = (b: HTMLElement | null) => {
      if (!b || aiming < 0 || b.classList.contains("mined") || !boardBody) {
        aimMark.classList.remove("on");
        return;
      }
      // позиция в layout-координатах борда (offset-цепочка не искажена 3D)
      let x = 0;
      let y = 0;
      let el: HTMLElement | null = b;
      while (el && el !== boardBody) {
        x += el.offsetLeft;
        y += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      const cs = getComputedStyle(b);
      aimMark.style.left = `${x}px`;
      aimMark.style.top = `${y}px`;
      aimMark.style.width = `${b.offsetWidth}px`;
      aimMark.style.height = `${b.offsetHeight}px`;
      aimMark.style.borderRadius = cs.borderRadius;
      // повёрнутый красный баннер: копируем поворот обёртки
      const tilt = b.closest(".banner-tilt") as HTMLElement | null;
      const t = tilt ? getComputedStyle(tilt) : null;
      aimMark.style.transform = t ? t.transform : "none";
      aimMark.style.transformOrigin = t ? t.transformOrigin : "";
      aimMark.classList.add("on");
    };

    /* ── состояние боя (новая партия при каждом взятии меча) ── */
    let aiming = -1; // индекс скилла в фазе прицеливания (−1 — нет)
    let turnBusy = false;
    let victory = false;
    let defeat = false;
    let ap = AP_START; // очки действий
    let playerHp = PLAYER_MAX;
    let armor = 0; // защиты босса: 1 шт впитывает удар целиком
    let armorBlocked = false; // «Встреча в 9 утра»
    let meetingUnlocked = false;
    let meetingUsed = false;
    let rLock = false;
    const burns = new Map<HTMLElement, number>(); // поджиги: ходов осталось
    let frozen: HTMLElement | null = null; // цель без хила в эту резолюцию
    const turnTimers: number[] = [];
    turnTimers.push(window.setTimeout(() => panel.classList.add("live"), 950)); // магнит после входа

    const maxHp = (b: HTMLElement) => (b.classList.contains("luck") ? HP_LUCK : HP_BANNER);
    const hpOf = (b: HTMLElement) => hpRef.current.get(b) ?? maxHp(b);
    const allTargets = (): HTMLElement[] =>
      [
        document.querySelector<HTMLElement>(".banner-tilt .banner"),
        document.querySelector<HTMLElement>(".banners > .banner.dark"),
        document.querySelector<HTMLElement>(".banners > .banner.blue"),
        document.querySelector<HTMLElement>(".chips .chip.luck"),
      ].filter(Boolean) as HTMLElement[];
    const aliveTargets = () => allTargets().filter((b) => !b.classList.contains("mined"));
    const bossHp = () => aliveTargets().reduce((s, b) => s + hpOf(b), 0);

    const updateBoss = () => {
      const hp = bossHp();
      (bossEl.querySelector(".rpg-boss-bar i") as HTMLElement).style.width =
        `${Math.max(0, (hp / BOSS_MAX) * 100)}%`;
      bossEl.querySelector(".rpg-boss-hp")!.innerHTML =
        `<b>${Math.max(0, hp)}</b>/${BOSS_MAX.toLocaleString("ru-RU")}`;
      bossEl.querySelector(".rpg-boss-armor")!.innerHTML = "<i></i>".repeat(Math.min(armor, 10));
    };
    updateBoss();

    const floatText = (at: HTMLElement, text: string, cls: string, color: string) => {
      const r = at.getBoundingClientRect();
      const el = document.createElement("span");
      el.className = "rpg-dmg " + cls;
      el.textContent = text;
      el.style.cssText = `left:${r.left + r.width * (0.3 + Math.random() * 0.4)}px;` +
        `top:${r.top + r.height * (0.15 + Math.random() * 0.4)}px;--clr:${color};`;
      // в body: rect-координаты экранные, вложение в наклонённый .board проецировало бы дважды
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 950);
    };

    const setHpBar = (b: HTMLElement, hp: number) => {
      let bar = b.querySelector<HTMLElement>(".rpg-hp");
      if (!bar) {
        bar = document.createElement("span");
        bar.className = "rpg-hp";
        bar.innerHTML = "<i></i>";
        b.appendChild(bar);
      }
      (bar.firstElementChild as HTMLElement).style.width = `${(hp / maxHp(b)) * 100}%`;
    };

    const applyDamage = (b: HTMLElement, dmg: number, color: string, crit: boolean) => {
      if (b.classList.contains("mined")) return;
      const hp = Math.max(0, hpOf(b) - dmg);
      hpRef.current.set(b, hp);
      setHpBar(b, hp);
      floatText(b, `−${dmg}${crit ? "!" : ""}`, crit ? "crit" : "", color);
      // тряска: у красного шейкаем обёртку — на самом баннере keyframe перетёр бы rotate
      const shakeEl = (b.closest(".banner-tilt") as HTMLElement) ?? b;
      shakeEl.classList.remove("rpg-shake");
      void shakeEl.offsetWidth;
      shakeEl.classList.add("rpg-shake");
      if (hp <= 0) {
        burns.delete(b);
        destroyTarget(b);
        // победа проверяется на КАЖДОМ добивании — включая поздние крит-удары
        // Шквала, прилетающие после таймера тиков поджига
        if (bossHp() <= 0) victoryNow();
      }
      updateBoss();
    };

    // удар с учётом защит: 1 защита впитывает удар любого размера
    const hitTarget = (b: HTMLElement, dmg: number, color: string, crit: boolean) => {
      if (b.classList.contains("mined")) return;
      if (armor > 0) {
        armor--;
        floatText(b, "поглощено", "absorb", "#aab3c5");
        updateBoss();
        return;
      }
      applyDamage(b, dmg, color, crit);
    };

    const victoryNow = () => {
      if (victory) return;
      victory = true;
      const v = document.createElement("div");
      v.className = "rpg-victory";
      v.textContent = "Продажи повержены!";
      document.body.appendChild(v);
      refreshCards();
    };

    const defeatNow = () => {
      if (defeat || victory) return;
      defeat = true;
      // финал: последние 15 секунд трека, после — тишина (луп снят)
      theme.removeEventListener("ended", startTheme);
      if (Number.isFinite(theme.duration) && theme.duration > DEFEAT_OUTRO_S) {
        theme.currentTime = theme.duration - DEFEAT_OUTRO_S;
        theme.play().catch(() => {});
      }
      const d = document.createElement("div");
      d.className = "rpg-defeat";
      d.innerHTML = `<b>Продукт закрыт</b><span>Продажи победили. Возьми меч заново — новая партия.</span>`;
      document.body.appendChild(d);
      refreshCards();
    };

    /* ── игрок: HP, ОД, ответный удар босса ── */
    const updatePlayer = () => {
      (playerEl.querySelector(".rpg-player-bar i") as HTMLElement).style.width =
        `${Math.max(0, (playerHp / PLAYER_MAX) * 100)}%`;
      playerEl.querySelector(".rpg-player-hp")!.innerHTML =
        `<b>${Math.max(0, playerHp)}</b>/${PLAYER_MAX}`;
      playerEl.querySelector(".rpg-ap-num")!.textContent = String(Math.max(0, ap));
    };
    updatePlayer();

    const bossAttack = () => {
      if (victory || defeat) return;
      const dmg = BOSS_HIT_MIN + Math.round(Math.random() * (BOSS_HIT_MAX - BOSS_HIT_MIN));
      playerHp = Math.max(0, playerHp - dmg);
      floatText(playerEl, `−${dmg}`, "player-hit", "#ff4d5e");
      playerEl.classList.remove("rpg-shake");
      void playerEl.offsetWidth;
      playerEl.classList.add("rpg-shake");
      updatePlayer();
      if (playerHp <= 0) defeatNow();
    };

    /* ── партиклы от выбранной карточки к цели ── */
    const flyParticles = (fromEl: HTMLElement, toEl: HTMLElement, color: string) => {
      const a = fromEl.getBoundingClientRect();
      const t = toEl.getBoundingClientRect();
      const sx = a.right - 14;
      const sy = a.top + a.height / 2;
      const tx = t.left + t.width / 2;
      const ty = t.top + t.height / 2;
      for (let n = 0; n < 12; n++) {
        const p = document.createElement("i");
        p.className = "rpg-fly";
        // delay парой значений (transform, opacity) — одиночный longhand
        // перебил бы задержку затухания из стайлшита и партикл гас на старте
        p.style.cssText = `left:${sx + (Math.random() - 0.5) * 16}px;top:${sy + (Math.random() - 0.5) * 24}px;` +
          `background:${color};box-shadow:0 0 12px ${color};` +
          `transition-duration:0.35s,0.16s;transition-delay:${n * 14}ms,${240 + n * 14}ms;`;
        document.body.appendChild(p);
        // reflow → полёт к цели с разбросом
        void p.offsetWidth;
        p.style.transform =
          `translate(${tx - sx + (Math.random() - 0.5) * t.width * 0.5}px,` +
          `${ty - sy + (Math.random() - 0.5) * t.height * 0.6}px) scale(0.35)`;
        p.style.opacity = "0";
        setTimeout(() => p.remove(), 900);
      }
    };

    // хил босса: 10% текущего HP пропорционально живым блокам (кроме замороженного)
    const healBoss = () => {
      const total = bossHp();
      if (total <= 0) return;
      const pool = Math.round(total * BOSS_HEAL_PCT);
      const list = aliveTargets().filter((b) => b !== frozen);
      const sum = list.reduce((s, b) => s + hpOf(b), 0) || 1;
      list.forEach((b) => {
        const share = Math.round((hpOf(b) / sum) * pool);
        const nhp = Math.min(maxHp(b), hpOf(b) + share);
        const gained = nhp - hpOf(b);
        if (gained <= 0) return;
        hpRef.current.set(b, nhp);
        setHpBar(b, nhp);
        floatText(b, `+${gained}`, "heal", "#37d67a");
      });
      if (!armorBlocked) {
        const gain = bossHp() <= BOSS_MAX / 2 ? 2 : 1; // раненый босс защищается отчаяннее
        armor += gain;
        floatText(bossEl, gain === 2 ? "+2 защиты" : "+защита", "absorb", "#9fb4d8");
      }
      updateBoss();
    };

    const cardOf = (i: number) => panel.querySelector<HTMLElement>(`[data-i="${i}"]`);

    // состояния карточек: откат/занятость (cd), не хватает ОД (no-ap),
    // прицеливание (sel-aim), исчерпан (max)
    const refreshCards = () => {
      SKILLS.forEach((s, i) => {
        const card = cardOf(i);
        if (!card) return;
        const spent = s.kind === "risk" ? riskRef.current >= 2 : s.kind === "meeting" && meetingUsed;
        card.classList.toggle("max", !!spent);
        const busy = victory || defeat || (s.kind === "risk" ? rLock || turnBusy : turnBusy);
        card.classList.toggle("cd", !spent && busy);
        card.classList.toggle("no-ap", !spent && !busy && ap < s.ap);
        card.classList.toggle("sel-aim", aiming === i);
      });
    };

    /* ── фаза прицеливания: остаётся одна карточка, борд подъезжает левее ── */
    const enterAiming = (i: number) => {
      aiming = i;
      document.body.classList.add("rpg-aiming");
      panel.classList.add("aiming");
      refreshCards();
    };
    const exitAiming = () => {
      if (aiming < 0) return;
      aiming = -1;
      aimMark.classList.remove("on");
      document.body.classList.remove("rpg-aiming");
      panel.classList.remove("aiming");
      refreshCards();
    };

    // «Встреча в 9 утра» открывается на половине HP босса
    const unlockMeeting = () => {
      if (meetingUnlocked || victory || defeat || bossHp() > BOSS_MAX / 2) return;
      meetingUnlocked = true;
      cardOf(5)?.classList.remove("hidden");
    };

    const castMeeting = () => {
      if (!meetingUnlocked || meetingUsed || victory || defeat || turnBusy) return;
      if (ap < SKILLS[5].ap) return;
      ap -= SKILLS[5].ap;
      meetingUsed = true;
      armorBlocked = true;
      const card = cardOf(5);
      const d = card?.querySelector(".rpg-desc");
      if (d) d.textContent = "Планёрка назначена: новых защит не будет.";
      floatText(bossEl, "защиты заблокированы", "absorb", SKILLS[5].color);
      updatePlayer();
      refreshCards();
    };

    /* ── ход: резолюция от партиклов до возврата в боевой вид ── */
    const castTurn = (i: number, b: HTMLElement) => {
      const s = SKILLS[i];
      const card = cardOf(i);
      // ре-проверка ОД: между прицеливанием и кастом их могли потратить R/F
      if (ap < s.ap) {
        exitAiming();
        denyCard(i);
        return;
      }
      exitAiming();
      ap -= s.ap;
      updatePlayer();
      turnBusy = true;
      refreshCards();
      document.body.classList.add("rpg-resolve"); // экран ровный, скиллы спрятаны

      turnTimers.push(
        // партиклы к цели: запускаем, когда борд почти выровнялся (~95% за
        // 430мс) — иначе rect цели замеряется на середине транзишена и полёт
        // уходит мимо; долетают ровно к фазе урона
        window.setTimeout(() => {
          if (card) flyParticles(card, b, s.color);
        }, 430),
        // фаза урона
        window.setTimeout(() => {
          // горящий босс теряет 1 защиту (приём из референса)
          if (armor > 0 && [...burns.keys()].some((t) => !t.classList.contains("mined"))) {
            armor--;
            floatText(bossEl, "−защита (горение)", "absorb", "#ff6a3d");
            updateBoss();
          }
          const mult = RISK_MULT[riskRef.current];
          const hits = s.hits > 1 ? 4 + Math.round(Math.random() * 2) : 1;
          let extra = 0;
          const doHit = () => {
            if (victory || b.classList.contains("mined")) return;
            const crit = Math.random() < CRIT_CHANCE;
            const base = Math.round((s.min + Math.random() * (s.max - s.min)) * mult);
            hitTarget(b, crit ? Math.round(base * CRIT_SCALE) : base, s.color, crit);
            // крит Шквала добавляет удар (как у мульти-хита в референсе)
            if (crit && s.hits > 1 && extra < 2) {
              extra++;
              turnTimers.push(window.setTimeout(doHit, 150));
            }
          };
          for (let h = 0; h < hits; h++) turnTimers.push(window.setTimeout(doHit, h * 150));
          if (i === 1 && !b.classList.contains("mined")) burns.set(b, BURN_TURNS); // Q — поджиг
          if (i === 2) frozen = b; // W — заморозка
        }, 850),
        // тики поджига после ударов
        window.setTimeout(() => {
          burns.forEach((left, t) => {
            if (t.classList.contains("mined")) {
              burns.delete(t);
              return;
            }
            applyDamage(t, BURN_DMG, "#ff6a3d", false); // мимо защиты
            if (left - 1 <= 0) burns.delete(t);
            else burns.set(t, left - 1);
          });
          if (bossHp() <= 0) victoryNow();
        }, 1750),
        // фаза хила босса (через 1с после урона)
        window.setTimeout(() => {
          if (!victory) healBoss();
        }, 2750),
        // ответный удар босса по игроку
        window.setTimeout(() => bossAttack(), 3350),
        // возврат в боевой вид
        window.setTimeout(() => {
          document.body.classList.remove("rpg-resolve");
          frozen = null;
          // пассивный приход ОД + генерация базовой атаки
          const gained = 1 + (s.gain || 0);
          ap = Math.min(AP_MAX, ap + gained);
          if (!victory && !defeat) floatText(playerEl, `+${gained} ОД`, "ap-gain", "#d8b95f");
          turnBusy = false;
          unlockMeeting();
          refreshCards();
          updatePlayer();
        }, 4250)
      );
    };

    /* каст баффа: уровень риска ↑, вкладка сама уезжает на «Мои продукты»,
       виджет риска растворяется в новое состояние, вкладка возвращается */
    const castRisk = () => {
      if (riskRef.current >= 2) return;
      // прежняя хореография отменяется — второй каст не должен рвать показ первого
      riskTimersRef.current.forEach((t) => clearTimeout(t));
      riskTimersRef.current = [];
      riskRef.current++;
      const level = riskRef.current as 1 | 2;
      refreshRiskCard();
      const tab = (pane: string) =>
        document.querySelector<HTMLElement>(`.tabs .tab[data-pane="${pane}"]`)?.click();
      document.querySelector<HTMLElement>(".board-body")?.scrollTo({ top: 0, behavior: "smooth" });
      tab("prod");
      riskTimersRef.current.push(
        window.setTimeout(() => {
          document.querySelector(".widget.wg-risk")?.classList.add("risk-fading");
        }, 650),
        window.setTimeout(() => {
          applyRiskState(level);
          document.querySelector(".widget.wg-risk")?.classList.remove("risk-fading");
        }, 950),
        window.setTimeout(() => tab("ai"), 2600)
      );
    };

    // обновить карточку баффа после каста
    const refreshRiskCard = () => {
      const card = panel.querySelector<HTMLElement>(`[data-i="4"]`); // R — индекс 4
      if (!card) return;
      const d = card.querySelector(".rpg-desc");
      if (d) d.textContent = RISK_DESC[riskRef.current];
      card.classList.toggle("max", riskRef.current >= 2);
    };

    // отказ: карточка вздрагивает (нет ОД / откат)
    const denyCard = (i: number) => {
      const card = cardOf(i);
      if (!card) return;
      card.classList.remove("deny");
      void card.offsetWidth;
      card.classList.add("deny");
      turnTimers.push(window.setTimeout(() => card.classList.remove("deny"), 350));
    };

    /* выбор скилла: атаки уходят в прицеливание, R/«Встреча» кастуются сразу */
    const tryCast = (i: number) => {
      if (victory || defeat || turnBusy) return;
      const s = SKILLS[i];
      if (!s || (s.hidden && !meetingUnlocked)) return;
      if (s.kind === "meeting") {
        if (meetingUsed) return;
        if (ap < s.ap) {
          denyCard(i);
          return;
        }
        exitAiming(); // мгновенный каст сбрасывает прицеливание — ОД честные
        castMeeting();
        return;
      }
      if (s.kind === "risk") {
        // мгновенно, вне хода и без резолюции — как есть
        if (rLock || riskRef.current >= 2) return;
        if (ap < s.ap) {
          denyCard(i);
          return;
        }
        exitAiming(); // мгновенный каст сбрасывает прицеливание — ОД честные
        ap -= s.ap;
        updatePlayer();
        rLock = true;
        turnTimers.push(
          window.setTimeout(() => {
            rLock = false;
            refreshCards();
          }, 1500)
        );
        castRisk();
        refreshRiskCard();
        refreshCards();
        return;
      }
      // атака: не хватает ОД → отказ; повторный выбор — отмена прицеливания
      if (ap < s.ap) {
        denyCard(i);
        return;
      }
      if (aiming === i) {
        exitAiming();
        return;
      }
      enterAiming(i);
    };

    const onOverTarget = (e: MouseEvent) => placeAim(targetOf(e.target as Element));
    document.addEventListener("mouseover", onOverTarget);

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // Cmd+A/Ctrl+F и т.п. — не скиллы
      if (e.key === "Escape") {
        exitAiming();
        return;
      }
      const i = SKILLS.findIndex((s) => s.code === e.code);
      if (i >= 0) tryCast(i);
    };
    const onClick = (e: MouseEvent) => {
      const card = (e.target as Element | null)?.closest?.(".rpg-skill") as HTMLElement | null;
      if (card) {
        tryCast(+card.dataset.i!);
        return;
      }
      // клик по цели работает только в фазе прицеливания
      if (aiming >= 0) {
        const b = targetOf(e.target as Element);
        if (b && !b.classList.contains("mined")) castTurn(aiming, b);
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
      document.removeEventListener("mouseover", onOverTarget);
      aimMark.remove();
      document.removeEventListener("mousemove", onMagnet);
      cancelAnimationFrame(magnetRaf);
      turnTimers.forEach((t) => clearTimeout(t));
      theme.removeEventListener("ended", startTheme);
      theme.pause();
      theme.removeAttribute("src");
      theme.load(); // только load() реально обрывает стриминг трека
      panel.remove();
      bossEl.remove();
      playerEl.remove();
      mute.remove();
      document.body.classList.remove("rpg-armed", "rpg-resolve", "rpg-aiming");
      // сложили инструмент — партия закончилась: мир восстанавливается сразу
      // (иначе баннер победы и HP-бары висели бы над обычным дашбордом)
      restoreWorldDom();
    };
  }, [session, tool, onMined]);
}
