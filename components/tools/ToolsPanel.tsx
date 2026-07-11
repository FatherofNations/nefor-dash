"use client";
import { useTools, V2State } from "./ToolsProvider";
import "@/styles/tools.css";

// Свитч iOS-стиля (стили .twk-sw из menu2.css, загруженного глобально)
function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="twk-sw">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <i />
    </span>
  );
}

function Row({
  label,
  k,
  v2State,
  setV2,
}: {
  label: string;
  k: keyof V2State;
  v2State: V2State;
  setV2: (k: keyof V2State, v: boolean) => void;
}) {
  return (
    <label className="twk-row">
      <span className="lb">{label}</span>
      <Switch on={v2State[k]} onChange={(v) => setV2(k, v)} />
    </label>
  );
}

export default function ToolsPanel() {
  const { dashboard, variant, setVariant, v2State, setV2, panelOpen, setPanelOpen, swapTo } =
    useTools();

  return (
    <>
      <aside className="twk" aria-hidden={!panelOpen}>
        {/* ── селектор дашборда (карточки): своп через блюр борда (swapTo) ── */}
        <div className="twk-cards">
          <button
            className={"twk-card" + (dashboard === "main" ? " active" : "")}
            onClick={() => swapTo("/")}
          >
            <span className="twk-card-t">ИП</span>
            <span className="twk-card-s">Концепт</span>
          </button>
          <button
            className={"twk-card" + (dashboard === "current" ? " active" : "")}
            onClick={() => swapTo("/current")}
          >
            <span className="twk-card-t">Бухгалтер</span>
            <span className="twk-card-s">Актуальный</span>
          </button>
        </div>

        {/* ── динамическая часть: ремаунт по key (смена дашборда/вида) —
              пункты проявляются из блюра сверху вниз (.twk-dyn, tools.css) ── */}
        <div
          className="twk-dyn"
          key={dashboard === "main" ? `main-${variant}` : "current"}
        >
          {/* ── тоггл варианта Главной ── */}
          {dashboard === "main" && (
            <>
              <p className="twk-sec">Вид меню</p>
              <div className="twk-seg">
                <button
                  className={variant === "v1" ? "active" : ""}
                  onClick={() => setVariant("v1")}
                >
                  v1
                </button>
                <button
                  className={variant === "v2" ? "active" : ""}
                  onClick={() => setVariant("v2")}
                >
                  v2
                </button>
              </div>
            </>
          )}

          {/* ── параметры: v2-стек ── */}
          {dashboard === "main" && variant === "v2" && (
            <>
              <p className="twk-sec">Счета</p>
              <Row label="Овердрафт" k="over" v2State={v2State} setV2={setV2} />
              <Row label="Валютный счёт" k="usd" v2State={v2State} setV2={setV2} />
              <p className="twk-sec">Блокировки</p>
              <Row label="Заблокировано ФНС" k="lock" v2State={v2State} setV2={setV2} />
              <Row label="Ожидает списания" k="clock" v2State={v2State} setV2={setV2} />
              <p className="twk-sec">Продукты</p>
              <Row label="Кредит наличными" k="credit" v2State={v2State} setV2={setV2} />
              <Row label="Баллы" k="points" v2State={v2State} setV2={setV2} />
            </>
          )}

          {dashboard === "main" && variant === "v1" && (
            <p className="twk-hint">
              Переключите вид меню на <b>v2</b>, чтобы настраивать состояния стека счётов.
            </p>
          )}

          {dashboard === "current" && (
            <p className="twk-hint">
              Дашборд <b>Current</b> — новый макет. Параметры появятся в следующей итерации.
            </p>
          )}
        </div>
      </aside>

      {/* ── плавающая кнопка (иконка морфится в крестик) ── */}
      <button
        className="twk-fab"
        aria-label="Инструменты"
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen(!panelOpen)}
      >
        <svg className="sliders" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M2 5.5h7.5M16.5 5.5h1.5M2 14.5h1.5M10.5 14.5h7.5"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="13" cy="5.5" r="2.2" stroke="#fff" strokeWidth="1.8" />
          <circle cx="7" cy="14.5" r="2.2" stroke="#fff" strokeWidth="1.8" />
        </svg>
        <svg className="x" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M4.5 4.5l11 11M15.5 4.5l-11 11"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </>
  );
}
