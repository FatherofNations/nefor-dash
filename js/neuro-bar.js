/* ═══════════ Умная строка нейропомощника — переиспользуемый модуль ═══════════
   Один источник для /2 и /current. Вставляет разметку строки (.nbar) и
   фуллскрин-панели (.spot) в конец <body> и вешает всё поведение:
   разворот пилюли, магнит к курсору, подъём Spotlight, Esc-цепочка.

   Стили: css/neuro-bar.css (строка) + css/styles.css (.spot).
   Ассеты: assets/figma/{m2Nb*, spot*} — уже в репозитории.

   Использование:
     mountNeuroBar();                                  // дефолт: колонка /current
     mountNeuroBar({ left:'324px', right:'88px', bottom:'40px' });  // /2
   Опции:
     left/right/bottom — инсеты контентной колонки (CSS var на .nbar)
     assetBase — префикс путей к ассетам (по умолчанию '../assets/figma/') */
(function () {
  function mountNeuroBar(opts) {
    opts = opts || {};
    const b = opts.assetBase || '../assets/figma/';

    // ── разметка строки ──
    const NBAR_HTML = `
  <div class="nbar">
    <div class="nb-pill">
      <span class="nb-clip"><img src="${b}m2NbClip.svg" alt="" width="24" height="24"></span>
      <input class="nb-input" type="text" placeholder="Как открыть депозит" aria-label="Спросите нейропомощника">
      <button class="nb-go" aria-label="Открыть нейропомощника">
        <img class="nb-ai" src="${b}m2NbAi.png" alt="" width="52" height="52">
        <img class="nb-search" src="${b}m2NbSearch.png" alt="" width="52" height="52">
      </button>
    </div>
  </div>`;

    // ── разметка фуллскрин-нейропомощника ──
    const SPOT_HTML = `
  <div class="spot" aria-hidden="true">
    <aside class="spot-menu">
      <div class="spot-logo">
        <i class="glow"></i>
        <img src="${b}spotLogo.svg" alt="" width="40" height="40">
        <span>Нейропомощник</span>
      </div>
      <nav class="spot-nav">
        <div class="spot-cell dim">
          <span class="ic"><img src="${b}spotHome.svg" alt="" width="20" height="20"></span>
          <span class="lb">Главная</span>
        </div>
        <div class="spot-cell active">
          <span class="ic"><img src="${b}spotChat.svg" alt="" width="20" height="20"></span>
          <span class="lb">Чат</span>
        </div>
      </nav>
    </aside>
    <div class="spot-body">
      <div class="spot-gradi"><i class="g1"></i><i class="g2"></i><i class="g3"></i><i class="g4"></i></div>
      <div class="spot-head">
        <button class="spot-hbtn" aria-label="Информация"><img src="${b}spotInfoBtn.svg" alt="" width="40" height="40"></button>
        <button class="spot-hbtn spot-close" aria-label="Закрыть"><img src="${b}spotCloseBtn.svg" alt="" width="40" height="40"></button>
      </div>
      <div class="spot-content">
        <div class="spot-hello">
          <h2><span class="dash">—</span> Привет!</h2>
          <p>Помогу найти нужный раздел или отвечу на ваши вопросы о банке</p>
        </div>
        <div class="spot-search">
          <div class="spot-input">
            <span class="ic"><img src="${b}spotClip.svg" alt="" width="24" height="24"></span>
            <input type="text" placeholder="Спросите что угодно">
          </div>
          <div class="spot-btns">
            <button class="spot-btn"><img src="${b}spotBtnMagn.svg" alt="" width="20" height="23">Скачай выписку</button>
            <button class="spot-btn"><img src="${b}spotBtnMagn.svg" alt="" width="20" height="23">Покажи реквизиты</button>
            <button class="spot-btn"><img src="${b}spotBtnMagn.svg" alt="" width="20" height="23">Расскажи про тариф</button>
          </div>
        </div>
        <div class="spot-cards">
          <div class="spot-card">
            <p class="t">Популярное</p>
            <div class="rows">
              <div class="spot-row"><img src="${b}spotDep.svg" alt="" width="24" height="24"><span>Депозиты</span></div>
              <div class="spot-row"><img src="${b}spotRisk.svg" alt="" width="24" height="24"><span>Индикатор риска</span></div>
              <div class="spot-row"><img src="${b}spotCalc.svg" alt="" width="24" height="24"><span>Бухгалтерия</span></div>
            </div>
          </div>
          <div class="spot-card">
            <p class="t">История</p>
            <div class="rows">
              <div class="spot-row"><img src="${b}spotMagn.svg" alt="" width="24" height="24"><span>Дебиторская задолженность с длинным текстом</span></div>
              <div class="spot-row"><img src="${b}spotMagn.svg" alt="" width="24" height="24"><span>Деньги сверху</span></div>
              <div class="spot-row"><img src="${b}spotMagn.svg" alt="" width="24" height="24"><span>ООО «Ландыш и партнеры»</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

    // ── инъекция в конец body ──
    const holder = document.createElement('div');
    holder.innerHTML = NBAR_HTML + SPOT_HTML;
    while (holder.firstChild) document.body.appendChild(holder.firstChild);

    // ── позиция контентной колонки ──
    const nbar = document.querySelector('.nbar');
    if (opts.left)   nbar.style.setProperty('--nbar-left', opts.left);
    if (opts.right)  nbar.style.setProperty('--nbar-right', opts.right);
    if (opts.bottom) nbar.style.setProperty('--nbar-bottom', opts.bottom);

    // ── поведение (перенесено 1:1 из /2) ──
    //    свёрнута: placeholder + «аи⁺»; клик разворачивает поле (скрепка слева, лупа справа,
    //    ввод чёрным); клик по лупе или Enter поднимает фуллскрин-нейропомощника снизу
    const nbPill = nbar.querySelector('.nb-pill');
    const nbInput = nbar.querySelector('.nb-input');
    const nbGo = nbar.querySelector('.nb-go');
    const spot = document.querySelector('.spot');
    const spotInput = spot.querySelector('.spot-input input');

    function nbActivate() {
      if (nbar.classList.contains('active')) return;
      nbar.classList.add('active');
      // обнуляем сдвиг магнита, иначе скейл-хлопок (nbPop перебивает transform)
      // по завершении дёрнет пилюлю обратно на офсет курсора
      nbPill.style.setProperty('--mx', '0px');
      nbPill.style.setProperty('--my', '0px');
      nbInput.focus();
    }
    function nbCollapse() {
      nbar.classList.remove('active');
      nbInput.value = '';
      nbInput.blur();
    }
    function setSpot(open) {
      spot.classList.toggle('open', open);
      spot.setAttribute('aria-hidden', !open);
    }
    function openSpot() {
      const q = nbInput.value.trim();
      if (q) spotInput.value = q;               // переносим набранный запрос в помощника
      setSpot(true);
      nbCollapse();                              // строка сбрасывается — под панелью её не видно
      setTimeout(() => spotInput.focus(), 450);  // после подъёма панели
    }

    // клик по свёрнутой пилюле — разворачивает поле
    nbPill.addEventListener('click', () => { if (!nbar.classList.contains('active')) nbActivate(); });
    // кнопка справа: свёрнуто — разворачивает, развёрнуто — открывает помощника
    nbGo.addEventListener('click', (e) => {
      e.stopPropagation();
      if (nbar.classList.contains('active')) openSpot(); else nbActivate();
    });
    // Enter в поле — открывает помощника
    nbInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); openSpot(); }
    });
    // клик мимо пилюли при пустом поле — сворачивает обратно
    document.addEventListener('click', (e) => {
      if (nbar.classList.contains('active') && !nbPill.contains(e.target) && !nbInput.value.trim()) nbCollapse();
    });
    // закрытие помощника: крестик или Esc (Esc также сворачивает строку)
    spot.querySelector('.spot-close').addEventListener('click', () => setSpot(false));
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (spot.classList.contains('open')) setSpot(false);
      else if (nbar.classList.contains('active')) nbCollapse();
    });

    // магнит: строка слегка подъезжает к курсору на близком расстоянии (плавно, с лагом)
    const NB_R = 210, NB_MAX = 13;
    let nbLastE = null, nbRaf = null, nbMoved = false;
    function nbMagnet() {
      nbRaf = null;
      const e = nbLastE;
      if (!e) return;
      const off = nbar.classList.contains('active') ||
                  document.body.classList.contains('twk-open') ||
                  spot.classList.contains('open');
      let tx = 0, ty = 0;
      if (!off) {
        const r = nbar.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const dist = Math.hypot(dx, dy);
        if (dist < NB_R) {
          const f = 1 - dist / NB_R;                 // 1 у центра → 0 на границе влияния
          tx = Math.max(-NB_MAX, Math.min(NB_MAX, dx * 0.2 * f));
          ty = Math.max(-NB_MAX, Math.min(NB_MAX, dy * 0.2 * f));
        }
      }
      if (tx || ty || nbMoved) {
        nbPill.style.setProperty('--mx', tx.toFixed(2) + 'px');
        nbPill.style.setProperty('--my', ty.toFixed(2) + 'px');
        nbMoved = !!(tx || ty);
      }
    }
    window.addEventListener('mousemove', (e) => {
      nbLastE = e;
      if (!nbRaf) nbRaf = requestAnimationFrame(nbMagnet);
    });
  }

  window.mountNeuroBar = mountNeuroBar;
})();
