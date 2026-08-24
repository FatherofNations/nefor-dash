"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import ToolsPanel from "./ToolsPanel";
import { useMiner, EasterTool } from "@/components/easter/useMiner";
import { useTowers } from "@/components/easter/useTowers";
import "@/styles/easter.css";
// styles/td.css НЕ здесь: он уехал в динамический чанк игры (td/index.ts),
// иначе 20 КБ стилей качал бы каждый посетитель дашборда

/* Контекст инструмента tools — общий для всех дашбордов, живёт в root layout
   (переживает смену роута → панель остаётся открытой при свопе, требование #4).
   Держит: текущий дашборд (из pathname), вариант Главной (v1/v2), состояние
   стека v2 (параметры), открытость панели. Управляет body-классами и масштабом
   контента (--csc) при открытой панели — по-разному для Главной и Current. */

export type Variant = "v1" | "v2";
export type Dashboard = "main" | "current";
export interface V2State {
  over: boolean;
  lock: boolean;
  clock: boolean;
  usd: boolean;
  credit: boolean;
  points: boolean;
}
const DEFAULT_V2: V2State = {
  over: false,
  lock: false,
  clock: false,
  usd: false,
  credit: true,
  points: true,
};
// порядок ключей стека для сериализации в ?stack=
const V2_KEYS: (keyof V2State)[] = ["over", "usd", "lock", "clock", "credit", "points"];

interface ToolsCtx {
  dashboard: Dashboard;
  variant: Variant;
  setVariant: (v: Variant) => void;
  v2State: V2State;
  setV2: (k: keyof V2State, val: boolean) => void;
  panelOpen: boolean;
  setPanelOpen: (o: boolean) => void;
  swapTo: (url: "/" | "/current") => void;
  // вид умной строки на Главной v2: пилюля (false) или док-бар (true)
  nbDock: boolean;
  setNbDock: (v: boolean) => void;
  // пасхалка («6», затем «7»): секретный режим панели + инструменты
  // (кирка / РПГ / «Защита счёта»)
  easter: boolean;
  easterTool: EasterTool | null;
  setEasterTool: (t: EasterTool | null) => void;
  minedCount: number;
}

// своп дашбордов: сколько ждём растворения борда до смены роута
// (= transition 0.22s ease-in класса dash-out в tools.css + кадр запаса)
const SWAP_OUT_MS = 250;

const Ctx = createContext<ToolsCtx | null>(null);
export const useTools = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTools must be used within ToolsProvider");
  return c;
};

export default function ToolsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dashboard: Dashboard = pathname?.startsWith("/current") ? "current" : "main";

  // v2 — вариант Главной по умолчанию (просьба 2026-08-18); v1 остаётся по ?menu=v1
  const [variant, setVariant] = useState<Variant>("v2");
  // нижняя умная строка на v2: док-бар по умолчанию, пилюля — по ?nb=pill
  const [nbDock, setNbDock] = useState(true);
  const [v2State, setV2State] = useState<V2State>(DEFAULT_V2);
  const [panelOpen, setPanelOpen] = useState(false);
  const setV2 = useCallback(
    (k: keyof V2State, val: boolean) => setV2State((s) => ({ ...s, [k]: val })),
    []
  );

  /* ── плавный своп дашбордов (ИП ↔ Бухгалтер): рецепт переключения пейнов ──
     (AI-Сводка → Мои продукты). Карточка панели зовёт swapTo: борд растворяется
     в блюр со сдвигом вниз (класс dash-out, 0.22s ease-in — канон скрытия
     пейнов), роут меняется, когда борд ПОЛНОСТЬЮ прозрачен (скачка контента
     нет), по приезде класс снимается — новый дашборд проявляется из блюра с
     подъёмом (0.5s + 120мс задержка, канон появления пейнов, база .board). */
  const [swapping, setSwapping] = useState(false);
  const swappingRef = useRef(false);
  const setSwap = useCallback((v: boolean) => {
    swappingRef.current = v;
    setSwapping(v);
  }, []);

  const swapTo = useCallback(
    (url: "/" | "/current") => {
      const target: Dashboard = url === "/current" ? "current" : "main";
      if (swappingRef.current || target === dashboard) return; // активная карточка / уже в пути
      setSwap(true);
      window.setTimeout(() => router.push(url), SWAP_OUT_MS);
      // страховка: если навигация не случилась (оффлайн и т.п.) — вернуть борд
      window.setTimeout(() => {
        if (swappingRef.current) setSwap(false);
      }, 2500);
    },
    [dashboard, router, setSwap]
  );

  // приезд нового дашборда: кадр на отрисовку в прозрачности → проявление
  useEffect(() => {
    if (!swappingRef.current) return;
    let cancelled = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled || !swappingRef.current) return;
        setSwap(false);
      })
    );
    return () => {
      cancelled = true;
    };
  }, [dashboard, setSwap]);

  // оба роута статичные — префетчим, чтобы под блюром не ждать сеть
  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/current");
  }, [router]);

  /* ── пасхалка: «6», затем «7» в течение секунды ──
     Только на Главной (баннеры живут там). Никаких следов в URL/доках.
     Выход: та же пара клавиш или перезагрузка — всё возвращается как было.
     Прежний триггер (серия из пяти «/») снят: слэш теперь только открывает
     панель инструментов, та же клавиша нарисована на её кнопке. */
  const [easter, setEaster] = useState(false);
  const [easterTool, setEasterTool] = useState<EasterTool | null>(null);
  const [minedCount, setMinedCount] = useState(0);

  useEffect(() => {
    let six = 0; // время нажатия «6»; ноль — последовательность сброшена
    const MODS = new Set(["Shift", "Alt", "Control", "Meta", "CapsLock", "AltGraph"]);
    // цифру опознаём и по key, и по code: на других раскладках и на нумпаде
    const digit = (e: KeyboardEvent, d: string) =>
      e.key === d || e.code === `Digit${d}` || e.code === `Numpad${d}`;
    const onKey = (e: KeyboardEvent) => {
      if (MODS.has(e.key)) return;
      const t = e.target as HTMLElement | null;
      // guard только для ТЕКСТОВОГО ввода: фокус на чекбоксе-свитче не мешает
      const typing =
        !!t &&
        (t.tagName === "TEXTAREA" ||
          t.isContentEditable ||
          (t instanceof HTMLInputElement &&
            !/^(checkbox|radio|button|range|submit|reset|file|color)$/.test(t.type)));
      if (typing || e.repeat) {
        six = 0;
        return;
      }
      // «/» — горячая клавиша панели инструментов
      if (e.key === "/" || e.code === "Slash") {
        e.preventDefault(); // иначе Chrome ловит «/» своим поиском по странице
        setPanelOpen((o) => !o);
        six = 0;
        return;
      }
      if (digit(e, "6")) {
        six = performance.now();
        return;
      }
      if (digit(e, "7") && six && performance.now() - six < 1000) {
        six = 0;
        if (dashboard === "main") setEaster((on) => !on); // вход сам раскроет панель
        return;
      }
      six = 0;
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dashboard]);

  // вход в режим — раскрыть панель (секретный экран должен быть видно);
  // выход — вернуть панель в состояние до входа
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const panelBeforeEaster = useRef<boolean | null>(null);
  useEffect(() => {
    if (easter) {
      panelBeforeEaster.current = panelOpenRef.current;
      setPanelOpen(true);
    } else if (panelBeforeEaster.current !== null) {
      setPanelOpen(panelBeforeEaster.current);
      panelBeforeEaster.current = null;
    }
  }, [easter]);

  // выход из режима (или уход с Главной): сложить кирку, обнулить счёт
  useEffect(() => {
    if (dashboard !== "main" && easter) setEaster(false);
    if (!easter) {
      setEasterTool(null);
      setMinedCount(0);
    }
  }, [dashboard, easter]);

  // взятие инструмента: панель tools прячется (игровое поле чистое),
  // счёт сбрасывается вместе с миром (новая партия — без перезагрузки)
  useEffect(() => {
    if (easterTool) setPanelOpen(false);
    setMinedCount(0);
  }, [easterTool]);

  const onMined = useCallback(() => setMinedCount((c) => c + 1), []);
  useMiner(easter && dashboard === "main", easterTool, onMined);
  useTowers(easter && dashboard === "main" && easterTool === "td");

  /* ── связь состояния панели с URL (deep-link, без перезагрузки) ──
     variant (v1/v2) и стек v2 живут в контексте → в ссылку их кладём сами:
     при заходе по прямой ссылке один раз читаем ?menu/?stack, дальше — плавно
     пишем текущее состояние через history.replaceState (без навигации/ре-фетча,
     Next 15 это поддерживает). Дашборд уже в пути (/ и /current). */
  const urlSynced = useRef(false);

  // старт: применяем параметры из ссылки один раз (тем же переключателем, что и панель)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const menu = sp.get("menu");
    if (menu === "v1" || menu === "v2") setVariant(menu);
    if (sp.get("nb") === "pill") setNbDock(false);
    // nb=dock в старых ссылках — теперь дефолт, читать не нужно
    if (sp.has("stack")) {
      const on = new Set((sp.get("stack") ?? "").split(",").filter(Boolean));
      setV2State({
        over: on.has("over"),
        usd: on.has("usd"),
        lock: on.has("lock"),
        clock: on.has("clock"),
        credit: on.has("credit"),
        points: on.has("points"),
      });
    }
    urlSynced.current = true;
  }, []);

  // синхронизация: пишем текущее состояние в адресную строку без перезагрузки
  useEffect(() => {
    if (!urlSynced.current) return;
    let url = pathname || "/";
    if (dashboard === "main") {
      if (variant === "v1") {
        url = "/?menu=v1"; // v1 теперь НЕ дефолт — фиксируем в ссылке
      } else {
        // v2 — дефолт: чистый «/», параметры только для отступлений от него
        const stack = V2_KEYS.filter((k) => v2State[k]).join(",");
        const defStack = V2_KEYS.filter((k) => DEFAULT_V2[k]).join(",");
        const parts: string[] = [];
        if (stack !== defStack) parts.push(`menu=v2&stack=${stack}`);
        if (!nbDock) parts.push("nb=pill");
        url = parts.length ? `/?${parts.join("&")}` : "/";
      }
    } // current — путь /current без параметров
    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", url);
    }
  }, [dashboard, variant, v2State, nbDock, pathname]);

  // док-бар умного поиска: класс на body и html — фаб приподнимается над
  // баром, фон страницы темнеет (html тоже: его фон виден при оверскролле)
  useEffect(() => {
    const on = dashboard === "main" && variant === "v2" && nbDock;
    document.body.classList.toggle("nb-dock", on);
    document.documentElement.classList.toggle("nb-dock", on);
  }, [dashboard, variant, nbDock]);

  // класс дашборда на body (скоуп для push/scale правил)
  useEffect(() => {
    document.body.classList.toggle("dash-main", dashboard === "main");
    document.body.classList.toggle("dash-current", dashboard === "current");
  }, [dashboard]);

  // открытая панель: body.twk-open (рамка-обрезка вьюпорта борда — чистый CSS, styles/tools.css)
  useEffect(() => {
    document.body.classList.toggle("twk-open", panelOpen);
    document.documentElement.classList.toggle("twk-open", panelOpen); // фон вьюпорта на html
    if (panelOpen) {
      // Esc закрывает панель tools
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setPanelOpen(false);
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [panelOpen]);

  return (
    <Ctx.Provider
      value={{
        dashboard,
        variant,
        setVariant,
        v2State,
        setV2,
        panelOpen,
        setPanelOpen,
        swapTo,
        nbDock,
        setNbDock,
        easter,
        easterTool,
        setEasterTool,
        minedCount,
      }}
    >
      {/* .board — неподвижный фрейм (подложка+рамка); растворяется при свопе
          только наполнение .board-body (скролл-контейнер) */}
      <div className="board">
        <div className={swapping ? "board-body dash-out" : "board-body"}>{children}</div>
      </div>
      <ToolsPanel />
    </Ctx.Provider>
  );
}
