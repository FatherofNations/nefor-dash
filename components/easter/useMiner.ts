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
const HP_BANNER = 100;
const HP_LUCK = 60;
const CRIT_CHANCE = 0.15;
const CRIT_SCALE = 1.6;
// скиллы: жанровая структура (хоткей/урон/откат), тексты и названия свои
const SKILLS = [
  { key: "Q", code: "KeyQ", name: "Пламя комиссий", desc: "Наносит 28–36 урона огнём. Откат 1.5 с.", min: 28, max: 36, cd: 1500, color: "#ff6a3d", hits: 1, buff: false },
  { key: "W", code: "KeyW", name: "Заморозка активов", desc: "Ледяной удар: 44–52 урона. Откат 3 с.", min: 44, max: 52, cd: 3000, color: "#4db8ff", hits: 1, buff: false },
  { key: "E", code: "KeyE", name: "Шквал списаний", desc: "2–3 списания по 12–18 урона. Откат 5 с.", min: 12, max: 18, cd: 5000, color: "#ffd34d", hits: 3, buff: false },
  { key: "R", code: "KeyR", name: "Риск блокировки", desc: "", min: 0, max: 0, cd: 3200, color: "#ff9c26", hits: 0, buff: true },
];

/* ── бафф «Риск блокировки»: 2 уровня, растит урон всех скиллов ──
   Состояния виджета «Индикатор риска» — из дизайн-файла индикатора
   (60291:18624 средний / 60291:18458 высокий), ассеты в assets/easter. */
const RISK_BONUS = [0, 20, 40];
const RISK_DESC = [
  "Повышает риск блокировки: +20 к урону всех скиллов. Можно дважды.",
  "Риск средний (+20 к урону). Ещё раз — высокий: +40.",
  "Риск максимальный: +40 к урону всех скиллов.",
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
      restoreRiskState(); // виджет «Индикатор риска» — обратно в «Низкий риск»
      const s = document.querySelector<HTMLElement>(".banners");
      if (s) {
        s.classList.remove("collapsing", "red-mined");
        s.style.height = "";
        s.style.marginTop = "";
        s.querySelectorAll<HTMLElement>(".banner").forEach((b) => {
          b.classList.remove("mined", "slot-collapse", "rpg-shake", ...CRACKS);
          b.style.width = "";
        });
        s.querySelectorAll(".banner-tilt").forEach((t) => t.classList.remove("rpg-shake"));
      }
      const luck = document.querySelector<HTMLElement>(".chips .chip.luck");
      if (luck) {
        luck.classList.remove("mined", "luck-collapse", "rpg-shake", ...CRACKS);
        luck.style.width = "";
      }
      document.querySelectorAll(".mine-part, .rpg-hp, .rpg-dmg").forEach((p) => p.remove());
    };
  }, [session]);

  /* ── инструмент: обработчики; смена/снятие НЕ трогает добытое ── */
  useEffect(() => {
    if (!session || !tool) return;

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
        stopMining(true); // прервать текущее копание; добытое НЕ трогаем
        dig.pause();
        dig.removeAttribute("src");
        dig.load(); // только load() реально обрывает загрузку и освобождает ресурс
        cur.remove();
        document.body.classList.remove("mine-armed");
      };
    }

    /* ═══════════════ РПГ ═══════════════ */
    document.body.classList.add("rpg-armed"); // перспектива дашборда (CSS)

    // карточки скиллов слева (бафф R — с описанием по текущему уровню риска)
    const panel = document.createElement("div");
    panel.className = "rpg-skills";
    panel.innerHTML = SKILLS.map(
      (s, i) => `
      <button class="rpg-skill${i === 0 ? " sel" : ""}${s.buff && riskRef.current >= 2 ? " max" : ""}" data-i="${i}" style="--i:${i};--clr:${s.color}">
        <span class="rpg-key">${s.key}</span><span class="rpg-name">${s.name}</span>
        <span class="rpg-desc">${s.buff ? RISK_DESC[riskRef.current] : s.desc}</span>
      </button>`
    ).join("");
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("on"));

    // обновить карточку баффа после каста
    const refreshRiskCard = () => {
      const card = panel.querySelector<HTMLElement>(`[data-i="${SKILLS.findIndex((s) => s.buff)}"]`);
      if (!card) return;
      const d = card.querySelector(".rpg-desc");
      if (d) d.textContent = RISK_DESC[riskRef.current];
      card.classList.toggle("max", riskRef.current >= 2);
    };

    // музыка: файл кладёт пользователь; нет файла — режим работает молча
    const theme = new Audio(RPG_THEME_SRC);
    theme.preload = "auto";
    theme.volume = 0.45;
    const startTheme = () => {
      theme.currentTime = RPG_THEME_START;
      theme.play().catch(() => {});
    };
    startTheme();
    theme.addEventListener("ended", startTheme); // луп с той же 49-й секунды

    let selected = 0;
    const onCd = SKILLS.map(() => false);
    const cdTimers: number[] = [];
    const hitTimers: number[] = [];
    let hovered: HTMLElement | null = null;

    const maxHp = (b: HTMLElement) => (b.classList.contains("luck") ? HP_LUCK : HP_BANNER);

    const floatDamage = (b: HTMLElement, dmg: number, color: string, crit: boolean) => {
      const r = b.getBoundingClientRect();
      const el = document.createElement("span");
      el.className = "rpg-dmg" + (crit ? " crit" : "");
      el.textContent = `−${dmg}${crit ? "!" : ""}`;
      el.style.cssText = `left:${r.left + r.width * (0.3 + Math.random() * 0.4)}px;` +
        `top:${r.top + r.height * (0.15 + Math.random() * 0.3)}px;--clr:${color};`;
      // в body: rect-координаты экранные, вложение в наклонённый .board проецировало бы дважды
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 950);
    };

    const applyDamage = (b: HTMLElement, dmg: number, color: string, crit: boolean) => {
      if (b.classList.contains("mined")) return;
      const max = maxHp(b);
      const hp = Math.max(0, (hpRef.current.get(b) ?? max) - dmg);
      hpRef.current.set(b, hp);
      // HP-бар (инжект при первом уроне)
      let bar = b.querySelector<HTMLElement>(".rpg-hp");
      if (!bar) {
        bar = document.createElement("span");
        bar.className = "rpg-hp";
        bar.innerHTML = "<i></i>";
        b.appendChild(bar);
      }
      (bar.firstElementChild as HTMLElement).style.width = `${(hp / max) * 100}%`;
      floatDamage(b, dmg, color, crit);
      // тряска: у красного шейкаем обёртку — на самом баннере keyframe перетёр бы rotate
      const shakeEl = (b.closest(".banner-tilt") as HTMLElement) ?? b;
      shakeEl.classList.remove("rpg-shake");
      void shakeEl.offsetWidth;
      shakeEl.classList.add("rpg-shake");
      // трещины по порогам HP
      const frac = hp / max;
      b.classList.toggle("crack1", frac <= 0.75 && hp > 0);
      b.classList.toggle("crack2", frac <= 0.45 && hp > 0);
      b.classList.toggle("crack3", frac <= 0.2 && hp > 0);
      if (hp <= 0) destroyTarget(b);
    };

    /* каст баффа: уровень риска ↑, вкладка сама уезжает на «Мои продукты»,
       виджет риска растворяется в новое состояние, вкладка возвращается */
    const castRisk = () => {
      if (riskRef.current >= 2) return;
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

    const cast = (i: number, b: HTMLElement | null) => {
      const s = SKILLS[i];
      if (onCd[i]) return;
      if (!s.buff && (!b || b.classList.contains("mined"))) return;
      onCd[i] = true;
      const card = panel.querySelector<HTMLElement>(`[data-i="${i}"]`);
      card?.classList.add("cd");
      cdTimers.push(
        window.setTimeout(() => {
          onCd[i] = false;
          card?.classList.remove("cd");
        }, s.cd)
      );
      if (s.buff) {
        castRisk();
        return;
      }
      const hits = s.hits > 1 ? 2 + (Math.random() < 0.5 ? 1 : 0) : 1;
      for (let h = 0; h < hits; h++) {
        hitTimers.push(
          window.setTimeout(() => {
            const crit = Math.random() < CRIT_CHANCE;
            const base =
              s.min + Math.round(Math.random() * (s.max - s.min)) + RISK_BONUS[riskRef.current];
            applyDamage(b!, crit ? Math.round(base * CRIT_SCALE) : base, s.color, crit);
          }, h * 160)
        );
      }
    };

    const onOverRpg = (e: MouseEvent) => {
      hovered = targetOf(e.target as Element);
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const i = SKILLS.findIndex((s) => s.code === e.code);
      if (i >= 0) cast(i, hovered);
    };
    const onClick = (e: MouseEvent) => {
      const card = (e.target as Element | null)?.closest?.(".rpg-skill") as HTMLElement | null;
      if (card) {
        const i = +card.dataset.i!;
        if (SKILLS[i].buff) {
          cast(i, null); // бафф кастуется сразу, цель не нужна
        } else {
          selected = i;
          panel.querySelectorAll(".rpg-skill").forEach((c) => c.classList.toggle("sel", c === card));
        }
        return;
      }
      const b = targetOf(e.target as Element);
      if (b) cast(selected, b);
    };

    document.addEventListener("mouseover", onOverRpg);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("mouseover", onOverRpg);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
      cdTimers.forEach((t) => clearTimeout(t));
      hitTimers.forEach((t) => clearTimeout(t));
      theme.removeEventListener("ended", startTheme);
      theme.pause();
      theme.removeAttribute("src");
      theme.load(); // только load() реально обрывает стриминг трека
      panel.remove();
      document.body.classList.remove("rpg-armed");
      // HP и разрушенное остаются (мир — сессионный)
    };
  }, [session, tool, onMined]);
}
