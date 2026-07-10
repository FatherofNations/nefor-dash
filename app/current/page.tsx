// /current — третья версия дашборда (Figma 132:34615). Серверный компонент:
// разметка статична; body.cur вешает BodyClass, умную строку — NeuroBar (клиентские).
import "@/styles/current.css";
import NeuroBar from "@/components/neuro/NeuroBar";
import BodyClass from "@/components/BodyClass";

const A = "/assets/figma/";

const TABLE_ROWS: {
  name: string;
  num: string;
  sum: string;
  pos?: boolean;
  date: string;
  purpose: string;
}[] = [
  {
    name: "ООО «Моулин Роз»",
    num: "101",
    sum: "−24 500,00 ₽",
    date: "27.04.2025",
    purpose: "Оплата услуг по подготовке флористических композиций. НДС 20%",
  },
  {
    name: "ООО «Юнион Плей»",
    num: "20796",
    sum: "+32 000,00 ₽",
    pos: true,
    date: "27.04.2025",
    purpose: "Оплата по счёту №875 от 25.02.25. НДС 20%",
  },
  {
    name: "ООО «Курьер Сервис»",
    num: "100",
    sum: "−4 000,00 ₽",
    date: "27.04.2025",
    purpose:
      "Платёж по счёту №554 от 28.02.2025 за предоставленные услуги по доставке согласно договору №15 от 1 декабря 2022 года. НДС 20%",
  },
  {
    name: "ПАО «Ростелеком»",
    num: "99",
    sum: "−8 990,00 ₽",
    date: "27.04.2025",
    purpose:
      "Оплата услуг по проведению скоростного интернета в филиале №2 по договору № 123 от 03.02.2025 года. НДС 20%",
  },
  {
    name: "ООО «Абсолют»",
    num: "98",
    sum: "−64 900,00 ₽",
    date: "27.04.2025",
    purpose: "Платёж за поставку оборудования по договору №8451 от 17.01.2025 г.. НДС 20%",
  },
];

const Dots = () => (
  <svg className="cur-dots" width="20" height="20" viewBox="0 0 20 20">
    <circle cx="4" cy="10" r="1.6" />
    <circle cx="10" cy="10" r="1.6" />
    <circle cx="16" cy="10" r="1.6" />
  </svg>
);

export default function CurrentPage() {
  return (
    <>
      <BodyClass name="cur" />

      {/* ═══ Боковое меню (fixed слева; Figma 132:34616) ═══ */}
      <aside className="cur-side">
        <div className="cur-logo">
          <img src={`${A}curLogo.svg`} width="248" height="64" alt="Альфа-Бизнес" />
          <img
            className="cur-logo-grad"
            src={`${A}curLogoGrad.webp`}
            width="248"
            height="8"
            alt=""
          />
        </div>

        <nav className="cur-nav">
          <a className="cur-cell">
            <span className="cur-ico">
              <img src={`${A}curNavAll.svg`} width="20" height="20" alt="" />
            </span>
            <span className="cur-cell-t">Все сервисы</span>
          </a>
          <a className="cur-cell">
            <span className="cur-ico">
              <img src={`${A}curNavBonus.svg`} width="20" height="20" alt="" />
            </span>
            <span className="cur-cell-t">Альфа-Выгодно</span>
          </a>
          <div className="cur-div">
            <i />
          </div>
          <a className="cur-cell">
            <span className="cur-ico dim">
              <img src={`${A}curNavPay.svg`} width="20" height="20" alt="" />
            </span>
            <span className="cur-cell-t">Новый платёж</span>
          </a>
          <a className="cur-cell">
            <span className="cur-ico dim">
              <img src={`${A}curNavFeed.svg`} width="20" height="20" alt="" />
            </span>
            <span className="cur-cell-t">Лента операций</span>
          </a>
          <a className="cur-cell">
            <span className="cur-ico dim">
              <img src={`${A}curNavProgress.svg`} width="20" height="20" alt="" />
            </span>
            <span className="cur-cell-t">Платежи в работе</span>
          </a>
          <a className="cur-cell">
            <span className="cur-ico dim">
              <img src={`${A}curNavImport.svg`} width="20" height="20" alt="" />
            </span>
            <span className="cur-cell-t">Импорт реестров</span>
          </a>
          <a className="cur-cell">
            <span className="cur-ico dim">
              <img src={`${A}curNavStatement.svg`} width="20" height="20" alt="" />
            </span>
            <span className="cur-cell-t">Выписка</span>
          </a>
          <a className="cur-cell">
            <span className="cur-ico dim">
              <img src={`${A}curNavAccounts.svg`} width="20" height="20" alt="" />
            </span>
            <span className="cur-cell-t">Счета</span>
          </a>
          <a className="cur-cell">
            <span className="cur-ico dim">
              <img src={`${A}curNavContragents.svg`} width="20" height="20" alt="" />
            </span>
            <span className="cur-cell-t">Контрагенты</span>
          </a>
          <a className="cur-cell">
            <span className="cur-ico dim">
              <img src={`${A}curNavCards.svg`} width="20" height="20" alt="" />
            </span>
            <span className="cur-cell-t">Карты</span>
          </a>
          <a className="cur-cell">
            <span className="cur-ico dim">
              <img src={`${A}curNavPay.svg`} width="20" height="20" alt="" />
            </span>
            <span className="cur-cell-t">Эквайринг и касса</span>
          </a>
          <div className="cur-div">
            <i />
          </div>
          <a className="cur-cell cur-cell-proc">
            <span className="cur-ico dim">
              <img src={`${A}curNavProcurement.svg`} width="20" height="20" alt="" />
              <img
                className="cur-proc-border"
                src={`${A}curNavProcBorder.webp`}
                width="32"
                height="32"
                alt=""
              />
            </span>
            <span className="cur-cell-t">Госзакупки</span>
          </a>
        </nav>

        <div className="cur-footer">
          <div className="cur-footer-fade" />
          <a className="cur-cell cur-footer-cell">
            <span className="cur-ico dim">
              <img src={`${A}curGear.svg`} width="20" height="20" alt="" />
            </span>
            <span className="cur-cell-t">Настроить меню</span>
          </a>
        </div>
      </aside>

      {/* ═══ Шапка (fixed сверху; Figma 195:25832) ═══ */}
      <header className="cur-header">
        <div className="cur-hbtns">
          <button className="cur-hbtn" aria-label="Письма">
            <img src={`${A}curHdrMail.svg`} width="20" height="20" alt="" />
          </button>
          <button className="cur-hbtn" aria-label="Уведомления">
            <img src={`${A}curHdrBell.svg`} width="20" height="20" alt="" />
          </button>
        </div>
        <span className="cur-hdiv" />
        <div className="cur-company">
          <span className="cur-co-logo" />
          <span className="cur-co-info">
            <b>ООО «Город Нагатино»</b>
            <i>Набоков И.Д.</i>
          </span>
        </div>
        <span className="cur-hdiv" />
        <button className="cur-person">
          <span className="cur-person-av" />
          <span className="cur-person-t">Предприниматель</span>
        </button>
        <span className="cur-hdiv" />
        <button className="cur-hbtn" aria-label="Выйти">
          <img src={`${A}curHdrExit.svg`} width="20" height="20" alt="" />
        </button>
      </header>

      {/* ═══ Контент (скроллится под шапкой) ═══ */}
      <main className="cur-main">
        <div className="cur-content">
          {/* ── Быстрые действия ── */}
          <section className="cur-qa">
            <a className="cur-qa-btn">
              <span className="cur-qa-ico">
                <img src={`${A}curQaTopup.svg`} width="20" height="20" alt="" />
              </span>
              <span>Пополнить счёт</span>
            </a>
            <a className="cur-qa-btn">
              <span className="cur-qa-ico">
                <img src={`${A}curQaStatement.svg`} width="20" height="20" alt="" />
              </span>
              <span>Скачать выписку</span>
            </a>
            <a className="cur-qa-btn">
              <span className="cur-qa-ico">
                <img src={`${A}curQaCreatePay.svg`} width="20" height="20" alt="" />
              </span>
              <span>Создать платёж</span>
            </a>
            <a className="cur-qa-btn">
              <span className="cur-qa-ico">
                <img src={`${A}curQaImport.svg`} width="20" height="20" alt="" />
              </span>
              <span>Импорт платежей</span>
            </a>
            <a className="cur-qa-btn">
              <span className="cur-qa-ico">
                <img src={`${A}curQaInvoice.svg`} width="20" height="20" alt="" />
              </span>
              <span>Выставить счёт</span>
            </a>
            <a className="cur-qa-btn cur-qa-more">
              <span>Ещё</span>
            </a>
          </section>

          {/* ── 1-й ряд: баланс + дела в работе + баннеры ── */}
          <section className="cur-row1">
            {/* Баланс */}
            <div className="cur-balance">
              <div className="cur-bal-body">
                <div className="cur-bal-amount">570 880,95 ₽</div>
                <div className="cur-bal-bottom">
                  <div className="cur-bal-connect">
                    <div className="cur-bal-connect-main">
                      <span className="cur-bal-ic cur-bal-ic-green">
                        <img src={`${A}curBalPlus.svg`} width="24" height="24" alt="" />
                      </span>
                      <div className="cur-bal-connect-txt">
                        <div className="cur-bal-connect-top">
                          <span className="cur-bal-sum">500 000 ₽</span>
                          <span className="cur-badge-blue">Доступно к подключению</span>
                        </div>
                        <div className="cur-bal-connect-sub">Переводите себе бесплатно</div>
                      </div>
                    </div>
                    <button className="cur-bal-x" aria-label="Скрыть">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path
                          d="M5.5 5.5l9 9M14.5 5.5l-9 9"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="cur-bal-div" />
                  <div className="cur-bal-accounts">
                    <div className="cur-bal-acc">
                      <span className="cur-bal-ic cur-bal-ic-gray">
                        <img src={`${A}curBalRub.svg`} width="24" height="24" alt="" />
                      </span>
                      <div className="cur-bal-acc-txt">
                        <span className="cur-bal-acc-name">Рублёвый счёт</span>
                        <span className="cur-bal-acc-num">·· 5370</span>
                      </div>
                    </div>
                    <div className="cur-bal-acc">
                      <span className="cur-bal-cardbox">
                        <span className="cur-bal-card" />
                      </span>
                      <div className="cur-bal-acc-txt">
                        <span className="cur-bal-acc-name">Business One</span>
                        <span className="cur-bal-acc-num">·· 0363</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="cur-bal-foot">
                <div className="cur-bal-foot-links">
                  <a>Реквизиты</a>
                  <a>Тарифы и подписки</a>
                </div>
                <div className="cur-bal-loyalty">
                  2570 <img src={`${A}curBalCircleA.svg`} width="20" height="20" alt="" />
                </div>
              </div>
            </div>

            {/* Дела в работе */}
            <div className="cur-inwork">
              <div className="cur-iw-head">Дела в работе</div>
              <div className="cur-iw-list">
                <div className="cur-iw-row">
                  <span>Оплатить</span>
                  <span className="cur-ind gray">1</span>
                </div>
                <div className="cur-iw-row">
                  <span>Подписать</span>
                  <span className="cur-ind red">1</span>
                </div>
                <div className="cur-iw-row">
                  <span>Отправить</span>
                  <span className="cur-ind gray">1</span>
                </div>
                <div className="cur-iw-row cur-iw-zero">
                  <span>Доработать</span>
                  <span className="cur-ind gray">0</span>
                </div>
                <div className="cur-iw-row cur-iw-zero">
                  <span>Отклонённые</span>
                  <span className="cur-ind gray">0</span>
                </div>
                <div className="cur-iw-row">
                  <span>Черновики</span>
                  <span className="cur-ind gray">1</span>
                </div>
                <div className="cur-iw-row cur-iw-zero">
                  <span>В работе у банка</span>
                  <span className="cur-ind gray">0</span>
                </div>
              </div>
            </div>

            {/* Баннеры */}
            <div className="cur-banners">
              <div className="cur-ban b1">
                <div className="cur-ban-txt">
                  <b>Зарплатный проект</b>
                  <span>
                    Новые условия
                    <br />
                    онлайн-инкассации
                  </span>
                </div>
                <div className="cur-ban-img">
                  <img src={`${A}curBan1.webp`} alt="" />
                </div>
              </div>
              <div className="cur-ban b2">
                <div className="cur-ban-txt">
                  <b>Умная карта для всех</b>
                  <span>
                    Кэшбэк, бонусы
                    <br />
                    и удобные платежи
                  </span>
                </div>
                <div className="cur-ban-img">
                  <img src={`${A}curBan2.webp`} alt="" />
                </div>
              </div>
              <div className="cur-ban b3">
                <div className="cur-ban-txt">
                  <b>Кэшбек до 100%</b>
                  <span>
                    За бизнес-расходы,
                    <br />1 балл = 1 ₽
                  </span>
                </div>
                <div className="cur-ban-img">
                  <img src={`${A}curBan3.webp`} alt="" />
                </div>
              </div>
            </div>
          </section>

          {/* ── Табло: табы + переключатель видимости + карточки онбординга ── */}
          <section className="cur-tablo-section">
            <div className="cur-tablo">
              <div className="cur-tablo-tabs">
                <span className="cur-tab active">С чего начать</span>
                <span className="cur-tab">Сводка</span>
                <span className="cur-tab">Счета на главной</span>
                <span className="cur-tab">Обзор отрасли</span>
              </div>
              <div className="cur-tablo-ctrl">
                <div className="cur-seg">
                  <span className="cur-seg-hl" />
                  <span className="cur-seg-btn">
                    <img src={`${A}curTabloEye.svg`} width="28" height="28" alt="" />
                  </span>
                  <span className="cur-seg-btn">
                    <img src={`${A}curTabloEyeOff.svg`} width="28" height="28" alt="" />
                  </span>
                </div>
                <span className="cur-tablo-gear">
                  <img src={`${A}curTabloGear.svg`} width="20" height="20" alt="" />
                </span>
              </div>
            </div>

            <div className="cur-cards">
              {/* Точка входа */}
              <div className="cur-card cur-card-entry">
                <img className="cur-card-entry-bg" src={`${A}curCardEntryBg.svg`} alt="" />
                <div className="cur-card-entry-head">
                  <span>Все задания</span>
                  <img src={`${A}curChevR.svg`} width="20" height="20" alt="" />
                </div>
                <div className="cur-card-entry-content">
                  <span className="cur-card-entry-sub">0/7 выполнено</span>
                  <div className="cur-progress">
                    <i />
                  </div>
                </div>
                <img className="cur-card-entry-cap" src={`${A}curCardEntryCap.webp`} alt="" />
              </div>
              {/* Задания */}
              <div className="cur-card cur-task">
                <div className="cur-task-title">
                  Защитить бизнес
                  <br />
                  от блокировок
                </div>
                <div className="cur-task-meta">
                  <span className="cur-task-pts">
                    500
                    <img src={`${A}curCardBonus.svg`} width="20" height="20" alt="" />
                  </span>
                  <span className="cur-task-min">1 мин</span>
                </div>
                <img className="cur-task-img" src={`${A}curCard2img.webp`} alt="" />
              </div>
              <div className="cur-card cur-task">
                <div className="cur-task-title">Пополнить счёт</div>
                <div className="cur-task-meta">
                  <span className="cur-task-pts">
                    500
                    <img src={`${A}curCardBonus.svg`} width="20" height="20" alt="" />
                  </span>
                  <span className="cur-task-min">1 мин</span>
                </div>
                <img className="cur-task-img" src={`${A}curCard3img.webp`} alt="" />
              </div>
              <div className="cur-card cur-task">
                <div className="cur-task-title">Изучить условия тарифа</div>
                <div className="cur-task-meta">
                  <span className="cur-task-pts">
                    500
                    <img src={`${A}curCardBonus.svg`} width="20" height="20" alt="" />
                  </span>
                  <span className="cur-task-min">1 мин</span>
                </div>
                <img className="cur-task-img" src={`${A}curCard4img.webp`} alt="" />
              </div>
              <div className="cur-card cur-task">
                <div className="cur-task-title">
                  Переводить
                  <br />
                  без комиссии
                  <br />с подпиской
                </div>
                <div className="cur-task-meta">
                  <span className="cur-task-pts">
                    500
                    <img src={`${A}curCardBonus.svg`} width="20" height="20" alt="" />
                  </span>
                  <span className="cur-task-min">1 мин</span>
                </div>
                <img className="cur-task-img" src={`${A}curCard5img.webp`} alt="" />
              </div>
              <div className="cur-card cur-task">
                <div className="cur-task-title">Подключить налоговую копилку</div>
                <div className="cur-task-meta">
                  <span className="cur-task-pts">
                    500
                    <img src={`${A}curCardBonus.svg`} width="20" height="20" alt="" />
                  </span>
                  <span className="cur-task-min">1 мин</span>
                </div>
                <img className="cur-task-img" src={`${A}curCard6img.webp`} alt="" />
              </div>
            </div>
          </section>

          {/* ── Лента операций: заголовок + фильтры + таблица ── */}
          <h2 className="cur-title">Лента операций</h2>

          <div className="cur-filters">
            <div className="cur-filters-row1">
              <div className="cur-datefield">
                <span className="cur-df-chev">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M14 7l-5 5 5 5"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="cur-df-label">Апрель</span>
                <span className="cur-df-chev">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M10 7l5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="cur-df-cal">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <rect
                      x="3.5"
                      y="5"
                      width="17"
                      height="16"
                      rx="3"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M3.5 9.5h17M8 3v4M16 3v4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </div>
              <div className="cur-search">
                <span className="cur-search-mag">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
                    <path
                      d="M16.5 16.5L21 21"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="cur-search-ph">
                  Контрагент, ИНН, назначение платежа или номер счёта
                </span>
              </div>
            </div>
            <div className="cur-filters-row2">
              <button className="cur-ftag cur-ftag-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M3 6h9M15 6h2M3 14h2M9 14h8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <circle cx="14" cy="6" r="2" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="7" cy="14" r="2" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
              <button className="cur-ftag">Входящие</button>
              <button className="cur-ftag">Исходящие</button>
              <button className="cur-ftag">
                Счёт<span className="cur-ftag-chev" />
              </button>
              <button className="cur-ftag">
                Контрагент<span className="cur-ftag-chev" />
              </button>
              <button className="cur-ftag">Статус</button>
              <button className="cur-ftag">Сумма</button>
            </div>
          </div>

          <div className="cur-topbar">
            <div className="cur-topbar-count">
              <span className="cur-tb-lbl">Всего</span>
              <span className="cur-tb-num">19</span>
            </div>
            <button className="cur-topbar-set">
              <img src={`${A}curSetGear.svg`} width="16" height="16" alt="" />
              <span>Настройка</span>
            </button>
          </div>

          <div className="cur-table">
            {/* шапка */}
            <div className="cur-thead">
              <div className="cur-th cur-th-ctrl">
                <span className="cur-cb" />
              </div>
              <div className="cur-th cur-th-name cur-th-div">
                <span>Название компании</span>
                <span className="cur-th-chev" />
              </div>
              <div className="cur-th cur-th-num cur-th-div">
                <span>Номер</span>
                <span className="cur-th-chev" />
              </div>
              <div className="cur-th cur-th-status cur-th-div">
                <span>Статус</span>
                <span className="cur-th-chev" />
              </div>
              <div className="cur-th cur-th-sum cur-th-div">
                <span>Сумма</span>
                <span className="cur-th-chev" />
              </div>
              <div className="cur-th cur-th-date cur-th-div">
                <span>Дата</span>
                <span className="cur-th-chev" />
              </div>
              <div className="cur-th cur-th-act" />
            </div>
            <div className="cur-thead-border" />

            {/* строки */}
            {TABLE_ROWS.map((r, i) => (
              <div className="cur-tr" key={i}>
                <div className="cur-tr-main">
                  <div className="cur-td cur-td-ctrl">
                    <span className="cur-cb" />
                  </div>
                  <div className="cur-td cur-td-name">
                    <span className="cur-tlogo">
                      <img src={`${A}curTblRub.svg`} width="24" height="24" alt="" />
                    </span>
                    <div className="cur-tname">
                      <span className="cur-tname-1">{r.name}</span>
                      <span className="cur-tname-2">АО «Альфа-Банк» ··5370 (RUR)</span>
                    </div>
                  </div>
                  <div className="cur-td cur-td-num">{r.num}</div>
                  <div className="cur-td cur-td-status">
                    <span className="cur-status">Исполнен</span>
                  </div>
                  <div className="cur-td cur-td-sum">
                    <span className={"cur-sum" + (r.pos ? " cur-sum-pos" : "")}>{r.sum}</span>
                  </div>
                  <div className="cur-td cur-td-date">{r.date}</div>
                  <div className="cur-td cur-td-act">
                    <Dots />
                  </div>
                </div>
                <div className="cur-tr-purpose">{r.purpose}</div>
                <div className="cur-tr-border" />
              </div>
            ))}

            <div className="cur-pagination" />
          </div>
        </div>
      </main>

      {/* ═══ Умная строка нейропомощника + Spotlight + чат — общий модуль ═══ */}
      <NeuroBar left="300px" right="52px" bottom="40px" />
    </>
  );
}
