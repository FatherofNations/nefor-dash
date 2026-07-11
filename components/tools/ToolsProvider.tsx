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
}

// своп дашбордов: сколько ждём, пока вуаль накроет борд, до смены роута
// (= анимация bveil-cover 0.45s в tools.css + кадр запаса)
const SWAP_COVER_MS = 480;
type SwapPhase = "idle" | "cover" | "reveal";

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

  const [variant, setVariant] = useState<Variant>("v1");
  const [v2State, setV2State] = useState<V2State>(DEFAULT_V2);
  const [panelOpen, setPanelOpen] = useState(false);
  const setV2 = useCallback(
    (k: keyof V2State, val: boolean) => setV2State((s) => ({ ...s, [k]: val })),
    []
  );

  /* ── плавный своп дашбордов (ИП ↔ Бухгалтер): волна блюра сверху вниз ──
     Карточка панели зовёт swapTo: вуаль .bveil (backdrop-blur с градиентной
     маской) накрывает борд сверху вниз (cover), роут меняется под полностью
     размытым кадром, по приезде нового дашборда волна продолжает ход и
     проявляет его сверху вниз (reveal). Свап DOM не виден: маскируется
     блюром. Фазы и тайминги — в tools.css (bveil-cover / bveil-reveal). */
  const [swapPhase, setSwapPhase] = useState<SwapPhase>("idle");
  const phaseRef = useRef<SwapPhase>("idle");
  const setPhase = useCallback((p: SwapPhase) => {
    phaseRef.current = p;
    setSwapPhase(p);
  }, []);

  const swapTo = useCallback(
    (url: "/" | "/current") => {
      const target: Dashboard = url === "/current" ? "current" : "main";
      if (phaseRef.current !== "idle" || target === dashboard) return; // активная карточка / уже в пути
      setPhase("cover");
      window.setTimeout(() => router.push(url), SWAP_COVER_MS);
      // страховка: если навигация не случилась (оффлайн и т.п.) — вернуть резкость
      window.setTimeout(() => {
        if (phaseRef.current === "cover") setPhase("idle");
      }, 2500);
    },
    [dashboard, router, setPhase]
  );

  // приезд нового дашборда: кадр на отрисовку под блюром → волна проявления
  useEffect(() => {
    if (phaseRef.current !== "cover") return;
    let cancelled = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled || phaseRef.current !== "cover") return;
        setPhase("reveal");
      })
    );
    return () => {
      cancelled = true;
    };
  }, [dashboard, setPhase]);

  // оба роута статичные — префетчим, чтобы под блюром не ждать сеть
  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/current");
  }, [router]);

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
      url =
        variant === "v2"
          ? `/?menu=v2&stack=${V2_KEYS.filter((k) => v2State[k]).join(",")}`
          : "/"; // v1 — чистая ссылка (дефолт)
    } // current — путь /current без параметров
    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", url);
    }
  }, [dashboard, variant, v2State, pathname]);

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
      value={{ dashboard, variant, setVariant, v2State, setV2, panelOpen, setPanelOpen, swapTo }}
    >
      <div className="board">
        {children}
        {swapPhase !== "idle" && (
          <div
            className={`bveil ${swapPhase}`}
            onAnimationEnd={() => {
              // конец волны проявления — вуаль убираем (конец cover игнорим:
              // фаза меняется по приезде роута, см. эффект выше)
              if (phaseRef.current === "reveal") setPhase("idle");
            }}
          />
        )}
      </div>
      <ToolsPanel />
    </Ctx.Provider>
  );
}
