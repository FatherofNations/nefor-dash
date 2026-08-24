"use client";
import { useRef } from "react";
import { useNeuroBar, NeuroBarOpts } from "./useNeuroBar";
import { useTools } from "@/components/tools/ToolsProvider";
import "@/styles/neuro-bar.css";

/* Умная строка нейропомощника: строка (.nbar) + Spotlight (.spot) + фуллскрин-чат (.chat).
   Разметка — порт шаблонов из js/neuro-bar.js. Поведение — в useNeuroBar.
   Обёртка display:contents не создаёт box → не становится containing-block для fixed. */

interface NeuroBarProps extends NeuroBarOpts {
  assetBase?: string;
}

export default function NeuroBar({
  left,
  right,
  bottom,
  assetBase = "/assets/figma/",
}: NeuroBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const b = assetBase;
  useNeuroBar(rootRef, { left, right, bottom });
  /* Вид строки на Главной v2: пилюля или док-бар (макет 967:75048).
     Тумблер живёт в панели tools; на /current всегда пилюля. Класс режима —
     на корне (он display:contents, бокса не создаёт): дети переключаются CSS,
     их runtime-классы (active и т.п.) React при этом не трогает. */
  const { dashboard, nbDock } = useTools();
  const dock = dashboard === "main" && nbDock;

  return (
    <div ref={rootRef} style={{ display: "contents" }} className={dock ? "nb-root dock" : "nb-root"}>
      {/* ── док-бар (вид из макета 967:75048): во всю ширину, прижат к низу ── */}
      <div className="nbdock" aria-hidden={!dock}>
        <div className="nbd-logo">
          <img src={`${b}nbDockLogo.svg`} alt="" width="28" height="28" />
          <span>Нейропомощник</span>
        </div>
        <div className="nbd-body">
          <div className="nbd-field">
            <span className="nbd-search">
              <img src={`${b}nbDockSearch.svg`} alt="" width="24" height="24" />
            </span>
            <input
              className="nbd-input"
              type="text"
              placeholder="Как открыть депозит"
              aria-label="Спросите нейропомощника"
              tabIndex={dock ? 0 : -1}
            />
            <button className="nbd-expand" aria-label="Развернуть нейропомощника" tabIndex={dock ? 0 : -1}>
              <img src={`${b}nbDockExpand.svg`} alt="" width="20" height="20" />
            </button>
          </div>
          {/* кнопка «Связь с банком» (макет 3031:28563) — открывает тот же чат */}
          <button className="nbd-support" tabIndex={dock ? 0 : -1}>
            <img src={`${b}nbDockChat.svg`} alt="" width="24" height="24" />
            <span>Связь с банком</span>
          </button>
        </div>
      </div>
      {/* ── строка ── */}
      <div className="nbar">
        <div className="nb-pill">
          <span className="nb-clip">
            <img src={`${b}m2NbClip.svg`} alt="" width="24" height="24" />
          </span>
          <input
            className="nb-input"
            type="text"
            placeholder="Как открыть депозит"
            aria-label="Спросите нейропомощника"
          />
          <button className="nb-go" aria-label="Открыть нейропомощника">
            <img className="nb-ai" src={`${b}m2NbAi.webp`} alt="" width="52" height="52" />
            <img
              className="nb-search"
              src={`${b}m2NbSearch.webp`}
              alt=""
              width="52"
              height="52"
            />
          </button>
        </div>
      </div>

      {/* ── Spotlight ── */}
      <div className="spot" aria-hidden="true">
        <aside className="spot-menu">
          <div className="spot-logo">
            <i className="glow" />
            <img src={`${b}spotLogo.svg`} alt="" width="40" height="40" />
            <span>Нейропомощник</span>
          </div>
          <nav className="spot-nav">
            <div className="spot-cell dim">
              <span className="ic">
                <img src={`${b}spotHome.svg`} alt="" width="20" height="20" />
              </span>
              <span className="lb">Главная</span>
            </div>
            <div className="spot-cell active">
              <span className="ic">
                <img src={`${b}spotChat.svg`} alt="" width="20" height="20" />
              </span>
              <span className="lb">Чат</span>
            </div>
          </nav>
        </aside>
        <div className="spot-body">
          <div className="spot-gradi">
            <i className="g1" />
            <i className="g2" />
            <i className="g3" />
            <i className="g4" />
          </div>
          <div className="spot-head">
            <button className="spot-hbtn" aria-label="Информация">
              <img src={`${b}spotInfoBtn.svg`} alt="" width="40" height="40" />
            </button>
            <button className="spot-hbtn spot-close" aria-label="Закрыть">
              <img src={`${b}spotCloseBtn.svg`} alt="" width="40" height="40" />
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
                  <img src={`${b}spotClip.svg`} alt="" width="24" height="24" />
                </span>
                <input type="text" placeholder="Спросите что угодно" />
              </div>
              <div className="spot-btns">
                <button className="spot-btn">
                  <img src={`${b}spotBtnMagn.svg`} alt="" width="20" height="23" />
                  Скачай выписку
                </button>
                <button className="spot-btn">
                  <img src={`${b}spotBtnMagn.svg`} alt="" width="20" height="23" />
                  Покажи реквизиты
                </button>
                <button className="spot-btn">
                  <img src={`${b}spotBtnMagn.svg`} alt="" width="20" height="23" />
                  Расскажи про тариф
                </button>
              </div>
            </div>
            <div className="spot-cards">
              <div className="spot-card">
                <p className="t">Популярное</p>
                <div className="rows">
                  <div className="spot-row">
                    <img src={`${b}spotDep.svg`} alt="" width="24" height="24" />
                    <span>Депозиты</span>
                  </div>
                  <div className="spot-row">
                    <img src={`${b}spotRisk.svg`} alt="" width="24" height="24" />
                    <span>Индикатор риска</span>
                  </div>
                  <div className="spot-row">
                    <img src={`${b}spotCalc.svg`} alt="" width="24" height="24" />
                    <span>Бухгалтерия</span>
                  </div>
                </div>
              </div>
              <div className="spot-card">
                <p className="t">История</p>
                <div className="rows">
                  <div className="spot-row">
                    <img src={`${b}spotMagn.svg`} alt="" width="24" height="24" />
                    <span>Дебиторская задолженность с длинным текстом</span>
                  </div>
                  <div className="spot-row">
                    <img src={`${b}spotMagn.svg`} alt="" width="24" height="24" />
                    <span>Деньги сверху</span>
                  </div>
                  <div className="spot-row">
                    <img src={`${b}spotMagn.svg`} alt="" width="24" height="24" />
                    <span>ООО «Ландыш и партнеры»</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Фуллскрин-чат ── */}
      <div className="chat" aria-hidden="true">
        <aside className="chat-menu">
          <div className="chat-logo">
            <img src={`${b}chatLogo.webp`} alt="" width="40" height="40" />
            <span>Нейропомощник</span>
          </div>
          <nav className="chat-nav">
            <div className="chat-cell dim">
              <span className="ic">
                <img src={`${b}spotHome.svg`} alt="" width="20" height="20" />
              </span>
              <span className="lb">Главная</span>
            </div>
            <div className="chat-cell active">
              <span className="ic">
                <img src={`${b}spotChat.svg`} alt="" width="20" height="20" />
              </span>
              <span className="lb">Чат</span>
            </div>
          </nav>
        </aside>
        <div className="chat-body">
          <div className="chat-head">
            <button className="chat-hbtn" aria-label="Информация">
              <img src={`${b}spotInfoBtn.svg`} alt="" width="40" height="40" />
            </button>
            <button className="chat-hbtn chat-close" aria-label="Закрыть">
              <img src={`${b}spotCloseBtn.svg`} alt="" width="40" height="40" />
            </button>
          </div>
          <div className="chat-scroll">
            <div className="chat-col">
              <div className="chat-thread" />
            </div>
          </div>
          <div className="chat-footer">
            <div className="chat-foot-inner">
              <div className="chat-input">
                <span className="ic">
                  <img src={`${b}spotClip.svg`} alt="" width="24" height="24" />
                </span>
                <input
                  type="text"
                  placeholder="Спросите что угодно"
                  aria-label="Спросите что угодно"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
