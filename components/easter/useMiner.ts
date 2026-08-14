"use client";
import { useEffect, useRef } from "react";

/* ═══ Пасхалка «шахтёр»: поведение кирки ═══
   Два слоя состояния (важно!):
   - СЕССИЯ (session = режим включён): добытые баннеры и схлопнутая секция —
     это «мир», он живёт всю сессию и восстанавливается ТОЛЬКО при выходе
     из режима. Снятие кирки в слот мир не трогает.
   - КИРКА (armed): курсор-кирка и обработчики копания; убрал в слот —
     просто сняли инструмент, прогресс на месте.
   Всё через делегирование на document (переживает ремаунты
   dangerouslySetInnerHTML-контента) + полный cleanup (StrictMode).

   Механика как в игре: зажал кнопку на баннере → кирка машет, трещины растут
   (3 стадии), отпустил раньше — трещины сходят; додержал — баннер ломается
   с разлётом частиц. После третьего — секция схлопывается, контент подъезжает. */

// звук копания (public/assets/easter/dig.mp3) длится 3.5s; блок ломается на
// 0.5s РАНЬШЕ конца дорожки — финальный «хруст» дозвучивает поверх разлёта.
// Стадии: 0.48/1.32/2.16s → разрушение на 3.0s
const STAGE_MS = 840;
const FIRST_MS = 480;
const PARTS = 14; // частиц на разрушение
const CRACKS = ["crack1", "crack2", "crack3"];
// палитры частиц по целям (цвета фонов и арта)
const PART_COLORS: Record<string, string[]> = {
  red: ["#ef3124", "#c22417", "#3123d9", "#a8e610"],
  dark: ["#111", "#2b2b2b", "#8b8b90", "#c9c9ce"],
  blue: ["#3b65ed", "#2b4fc4", "#b39cf0", "#e8590c"],
  luck: ["#9eff01", "#7fd400", "#111c00", "#c6ff4d"],
};

export function useMiner(session: boolean, armed: boolean, onMined: () => void) {
  const minedRef = useRef(0); // прогресс сессии (баннеры) — переживает снятие кирки
  const collapseTimerRef = useRef(0);
  const luckTimerRef = useRef(0); // схлопывание тега — тоже сессионное

  /* ── сессия: рестор «мира» только при выходе из режима ── */
  useEffect(() => {
    if (!session) return;
    minedRef.current = 0;
    return () => {
      clearTimeout(collapseTimerRef.current);
      clearTimeout(luckTimerRef.current);
      minedRef.current = 0;
      const s = document.querySelector<HTMLElement>(".banners");
      if (s) {
        s.classList.remove("collapsing", "red-mined");
        s.style.height = "";
        s.style.marginTop = "";
        s.querySelectorAll(".banner").forEach((b) => b.classList.remove("mined", ...CRACKS));
      }
      const luck = document.querySelector<HTMLElement>(".chips .chip.luck");
      if (luck) {
        luck.classList.remove("mined", "luck-collapse", ...CRACKS);
        luck.style.width = "";
      }
      document.querySelectorAll(".mine-part").forEach((p) => p.remove());
    };
  }, [session]);

  /* ── кирка: курсор + обработчики; снятие НЕ трогает добытое ── */
  useEffect(() => {
    if (!session || !armed) return;

    const cur = document.createElement("div");
    cur.className = "pickaxe-cur";
    cur.style.visibility = "hidden"; // не светить в углу (0,0) до первого движения мыши
    cur.innerHTML = `<img src="/assets/easter/pickaxe.png" alt="" width="42" height="48">`;
    document.body.appendChild(cur);
    document.body.classList.add("mine-armed");

    // звук копания: играет только пока кнопка зажата на цели;
    // при успешном разрушении дозвучивает финал (длина клипа = длине копания)
    const dig = new Audio("/assets/easter/dig.mp3");
    dig.preload = "auto";

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      // кирка видна только над бордом; над панелью/фабом/нейро-оверлеями — обычный курсор
      const el = e.target as Element | null;
      const overUi = !!el?.closest?.(".nbar, .spot, .chat");
      const overBoard = !!el?.closest?.(".board");
      cur.style.visibility = overBoard && !overUi ? "visible" : "hidden";
      cancelAnimationFrame(raf);
      const x = e.clientX;
      const y = e.clientY;
      raf = requestAnimationFrame(() => {
        // хотспот — остриё (левый конец головы: ≈3px/9px от спрайта 42×48)
        cur.style.transform = `translate(${x - 3}px, ${y - 9}px)`;
      });
    };

    let target: HTMLElement | null = null;
    let stage = 0;
    let timer = 0;
    let swingOnceTimer = 0;

    const targetOf = (el: Element | null): HTMLElement | null =>
      (el?.closest?.(
        ".banner-tilt .banner, .banners > .banner.dark, .banners > .banner.blue, .chips .chip.luck"
      ) as HTMLElement) ?? null;

    const clearCracks = (b: HTMLElement) => b.classList.remove(...CRACKS);

    const stopMining = (resetCracks: boolean) => {
      clearTimeout(timer);
      cur.classList.remove("swing");
      if (target && resetCracks && !target.classList.contains("mined")) {
        clearCracks(target);
        dig.pause(); // недокопал — звук обрывается; при успехе финал дозвучит
        dig.currentTime = 0;
      }
      target = null;
      stage = 0;
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
      document.querySelector(".board")?.appendChild(frag);
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

    const breakTarget = (b: HTMLElement) => {
      clearCracks(b);
      spawnParticles(b);
      b.classList.add("mined");
      stopMining(false);
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
      if (b.closest(".banner-tilt")) b.closest(".banners")?.classList.add("red-mined");
      minedRef.current++; // только баннеры двигают схлопывание секции
      if (minedRef.current >= 3) {
        collapseTimerRef.current = window.setTimeout(collapseBanners, 380);
      }
    };

    const step = () => {
      if (!target) return;
      stage++;
      if (stage <= CRACKS.length) {
        target.classList.add(CRACKS[stage - 1]);
        timer = window.setTimeout(step, STAGE_MS);
      } else {
        breakTarget(target);
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
      dig.removeAttribute("src"); // освободить аудио-ресурс
      cur.remove();
      document.body.classList.remove("mine-armed");
    };
  }, [session, armed, onMined]);
}
