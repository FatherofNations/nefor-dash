"use client";
import { useTools, V2State } from "./ToolsProvider";
import "@/styles/tools.css";

// Кирка временно скрыта из панели игр (просьба 2026-08-18); код не удалять
const SHOW_PICKAXE = false;

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
  const {
    dashboard,
    variant,
    setVariant,
    v2State,
    setV2,
    nbDock,
    setNbDock,
    panelOpen,
    setPanelOpen,
    swapTo,
    easter,
    easterTool,
    setEasterTool,
    minedCount,
  } = useTools();

  // вкладка «Игры» («6», затем «7», или кнопка 🕹): инвентарь с инструментами
  if (easter) {
    return (
      <>
        <aside className="twk" aria-hidden={!panelOpen}>
          <div className="twk-dyn" key="easter">
            <p className="twk-sec">Игры</p>
            {/* Майнкрафт-кирка временно скрыта (код и ассеты на месте —
                вернуть, переключив флаг SHOW_PICKAXE) */}
            {SHOW_PICKAXE && (
              <>
                <button
                  className={"twk-slot" + (easterTool === "pickaxe" ? " armed" : "")}
                  onClick={() => setEasterTool(easterTool === "pickaxe" ? null : "pickaxe")}
                  aria-label="Кирка"
                  title="Кирка"
                >
                  <img src="/assets/easter/pickaxe.png" alt="" width="40" height="46" />
                </button>
                <p className="twk-egg-hint">
                  Возьми кирку и зажми кнопку мыши на рекламном баннере — он добывается,
                  как блок, со звуком. Отпустишь раньше — трещины затянутся.
                </p>
              </>
            )}
            <button
              className={"twk-slot" + (easterTool === "rpg" ? " armed" : "")}
              onClick={() => setEasterTool(easterTool === "rpg" ? null : "rpg")}
              aria-label="Режим РПГ"
              title="Режим РПГ"
            >
              <img src="/assets/easter/sword.svg" alt="" width="40" height="40" />
            </button>
            <p className="twk-egg-hint">
              Режим РПГ: наведи курсор на баннер и бей скиллами — Q, W, E
              (или кликом, выбрав скилл слева).
            </p>
            <button
              className={"twk-slot" + (easterTool === "td" ? " armed" : "")}
              onClick={() => setEasterTool(easterTool === "td" ? null : "td")}
              aria-label="Защита счёта"
              title="Защита счёта"
            >
              <img src="/assets/easter/td-tower.svg" alt="" width="40" height="44" />
            </button>
            <p className="twk-egg-hint">
              Защита счёта: дашборд становится ночным кварталом — зазоры между
              блоками это улицы, по ним к балансу бегут списания.
            </p>
            <button
              className={"twk-slot" + (easterTool === "tanks" ? " armed" : "")}
              onClick={() => setEasterTool(easterTool === "tanks" ? null : "tanks")}
              aria-label="Броневик"
              title="Броневик"
            >
              <img src="/assets/easter/tank-icon.svg" alt="" width="40" height="40" />
            </button>
            <p className="twk-egg-hint">
              Броневик: дашборд становится полигоном. Карточки — кирпич, его
              простреливают; сайдбар и табы — сталь. Стрелки или WASD — ехать,
              пробел — огонь. Не пустите их к хранилищу у баланса.
            </p>
            {SHOW_PICKAXE && <p className="twk-egg-count">Добыто: {minedCount}/4</p>}
          </div>
        </aside>
        <FabButton panelOpen={panelOpen} setPanelOpen={setPanelOpen} />
      </>
    );
  }

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
              <p className="twk-sec">Умный поиск</p>
              <label className="twk-row">
                <span className="lb">Строка-док снизу</span>
                <Switch on={nbDock} onChange={setNbDock} />
              </label>
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

      <FabButton panelOpen={panelOpen} setPanelOpen={setPanelOpen} />
    </>
  );
}

/* ── плавающая кнопка (иконка морфится в крестик) ── */
function FabButton({
  panelOpen,
  setPanelOpen,
}: {
  panelOpen: boolean;
  setPanelOpen: (o: boolean) => void;
}) {
  const { setEasterView, easterTool, setEasterTool } = useTools();
  const inGame = easterTool !== null;
  return (
    <button
      className="twk-fab fab-games"
      aria-label={inGame ? "Закрыть игру (Esc)" : "Игры (клавиши «6», «7»)"}
      aria-expanded={panelOpen}
      onClick={() => {
        // в игре кнопка закрывает игру; иначе тогглит панель (открывает в играх)
        if (inGame && !panelOpen) setEasterTool(null);
        else if (panelOpen) setPanelOpen(false);
        else {
          setEasterView(true);
          setPanelOpen(true);
        }
      }}
    >
      <span className="fg-lbl">
        {inGame ? "Закрыть" : <><i aria-hidden>🕹️</i>Игры</>}
      </span>
      <svg className="x" width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M4.5 4.5l11 11M15.5 4.5l-11 11"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
