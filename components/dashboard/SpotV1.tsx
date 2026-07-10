// Spotlight главной v1 — первый партиал, переведённый из htmlPartials в JSX
// (постепенный уход от dangerouslySetInnerHTML). Разметка 1:1 со старым
// spotV1; поведение (открытие/закрытие, фокус) по-прежнему вешает useV1Page.
const A = "/assets/figma/";

const SPOT_BTNS = ["Скачай выписку", "Покажи реквизиты", "Расскажи про тариф"];

const POPULAR: { ic: string; label: string }[] = [
  { ic: "spotDep.svg", label: "Депозиты" },
  { ic: "spotRisk.svg", label: "Индикатор риска" },
  { ic: "spotCalc.svg", label: "Бухгалтерия" },
];

const HISTORY = [
  "Дебиторская задолженность с длинным текстом",
  "Деньги сверху",
  "ООО «Ландыш и партнеры»",
];

export default function SpotV1() {
  return (
    <div className="spot" aria-hidden="true">
      <aside className="spot-menu">
        <div className="spot-logo">
          <i className="glow"></i>
          <img src={`${A}spotLogo.svg`} alt="" width="40" height="40" />
          <span>Нейропомощник</span>
        </div>
        <nav className="spot-nav">
          <div className="spot-cell dim">
            <span className="ic">
              <img src={`${A}spotHome.svg`} alt="" width="20" height="20" />
            </span>
            <span className="lb">Главная</span>
          </div>
          <div className="spot-cell active">
            <span className="ic">
              <img src={`${A}spotChat.svg`} alt="" width="20" height="20" />
            </span>
            <span className="lb">Чат</span>
          </div>
        </nav>
      </aside>
      <div className="spot-body">
        <div className="spot-gradi">
          <i className="g1"></i>
          <i className="g2"></i>
          <i className="g3"></i>
          <i className="g4"></i>
        </div>
        <div className="spot-head">
          <button className="spot-hbtn" aria-label="Информация">
            <img src={`${A}spotInfoBtn.svg`} alt="" width="40" height="40" />
          </button>
          <button className="spot-hbtn spot-close" aria-label="Закрыть">
            <img src={`${A}spotCloseBtn.svg`} alt="" width="40" height="40" />
          </button>
        </div>
        <div className="spot-content">
          <div className="spot-hello">
            <h2>
              <span className="dash">—</span> Привет!
            </h2>
            <p>Помогу найти нужный раздел или отвечу на ваши вопросы о банке</p>
          </div>
          <div className="spot-search">
            <div className="spot-input">
              <span className="ic">
                <img src={`${A}spotClip.svg`} alt="" width="24" height="24" />
              </span>
              <input type="text" placeholder="Спросите что угодно" />
            </div>
            <div className="spot-btns">
              {SPOT_BTNS.map((t) => (
                <button className="spot-btn" key={t}>
                  <img src={`${A}spotBtnMagn.svg`} alt="" width="20" height="23" />
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="spot-cards">
            <div className="spot-card">
              <p className="t">Популярное</p>
              <div className="rows">
                {POPULAR.map((r) => (
                  <div className="spot-row" key={r.label}>
                    <img src={`${A}${r.ic}`} alt="" width="24" height="24" />
                    <span>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="spot-card">
              <p className="t">История</p>
              <div className="rows">
                {HISTORY.map((t) => (
                  <div className="spot-row" key={t}>
                    <img src={`${A}spotMagn.svg`} alt="" width="24" height="24" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
