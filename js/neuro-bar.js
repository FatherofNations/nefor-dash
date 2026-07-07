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

    // ── разметка фуллскрин-чата (поднимается при вводе запроса в строке) ──
    //    левое меню/шапка/футер повторяют Spotlight и переиспользуют его ассеты
    const CHAT_HTML = `
  <div class="chat" aria-hidden="true">
    <aside class="chat-menu">
      <div class="chat-logo">
        <img src="${b}chatLogo.png" alt="" width="40" height="40">
        <span>Нейропомощник</span>
      </div>
      <nav class="chat-nav">
        <div class="chat-cell dim">
          <span class="ic"><img src="${b}spotHome.svg" alt="" width="20" height="20"></span>
          <span class="lb">Главная</span>
        </div>
        <div class="chat-cell active">
          <span class="ic"><img src="${b}spotChat.svg" alt="" width="20" height="20"></span>
          <span class="lb">Чат</span>
        </div>
      </nav>
    </aside>
    <div class="chat-body">
      <div class="chat-head">
        <button class="chat-hbtn" aria-label="Информация"><img src="${b}spotInfoBtn.svg" alt="" width="40" height="40"></button>
        <button class="chat-hbtn chat-close" aria-label="Закрыть"><img src="${b}spotCloseBtn.svg" alt="" width="40" height="40"></button>
      </div>
      <div class="chat-scroll">
        <div class="chat-col"><div class="chat-thread"></div></div>
      </div>
      <div class="chat-footer">
        <div class="chat-foot-inner">
          <div class="chat-input">
            <span class="ic"><img src="${b}spotClip.svg" alt="" width="24" height="24"></span>
            <input type="text" placeholder="Спросите что угодно" aria-label="Спросите что угодно">
          </div>
        </div>
      </div>
    </div>
  </div>`;

    // ── инъекция в конец body ──
    const holder = document.createElement('div');
    holder.innerHTML = NBAR_HTML + SPOT_HTML + CHAT_HTML;
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
    const chat = document.querySelector('.chat');
    const chatThread = chat.querySelector('.chat-thread');
    const chatScroll = chat.querySelector('.chat-scroll');
    const chatInput = chat.querySelector('.chat-input input');

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
    // кнопка справа: свёрнуто — разворачивает, развёрнуто — поднимает чат
    nbGo.addEventListener('click', (e) => {
      e.stopPropagation();
      if (nbar.classList.contains('active')) openChat(); else nbActivate();
    });
    // Enter в поле — поднимает чат с введённым запросом
    nbInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); openChat(); }
    });
    // клик мимо пилюли при пустом поле — сворачивает обратно
    document.addEventListener('click', (e) => {
      if (nbar.classList.contains('active') && !nbPill.contains(e.target) && !nbInput.value.trim()) nbCollapse();
    });
    // закрытие: крестик или Esc. Esc-цепочка: чат → Spotlight → сворачивание строки
    spot.querySelector('.spot-close').addEventListener('click', () => setSpot(false));
    chat.querySelector('.chat-close').addEventListener('click', () => closeChat());
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (chat.classList.contains('open')) closeChat();
      else if (spot.classList.contains('open')) setSpot(false);
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
                  spot.classList.contains('open') ||
                  chat.classList.contains('open');
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

    // ══════════ Фуллскрин-чат: подъём при вводе запроса ══════════
    //   первое сообщение — запрос из строки; ответ захардкожен и «печатается»
    //   с blur-раскрытием (слова/блоки проявляются, лента скроллится вниз).
    //   Функции — объявления (hoisted), поэтому доступны обработчикам выше.
    let chatTimer = null;
    function stopStream() { if (chatTimer) { clearTimeout(chatTimer); chatTimer = null; } }
    function scrollChatBottom() { chatScroll.scrollTop = chatScroll.scrollHeight; }
    function setChat(open) { chat.classList.toggle('open', open); chat.setAttribute('aria-hidden', !open); }
    function closeChat() { setChat(false); stopStream(); }
    function nowHM() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

    // открытие из строки: сброс ленты, вопрос пользователя, генерация ответа
    function openChat() {
      const q = nbInput.value.trim() || 'Мой тариф';
      setChat(true);
      stopStream();
      chatThread.innerHTML = '';
      chatScroll.scrollTop = 0;
      addUser(q);
      streamAnswer();
      nbCollapse();
      setTimeout(() => chatInput.focus(), 720);   // после подъёма панели
    }
    // повторный вопрос из футера — тот же (захардкоженный) ответ
    function chatSend() {
      const q = chatInput.value.trim();
      if (!q) return;
      stopStream();
      addUser(q);
      streamAnswer();
      chatInput.value = '';
    }
    chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); chatSend(); } });

    // пузырь пользователя справа со временем
    function addUser(text) {
      const m = document.createElement('div');
      m.className = 'chat-msg user rv-block';
      m.innerHTML = '<div class="chat-bubble"><span class="tx"></span><span class="tm">' + nowHM() + '</span></div>';
      m.querySelector('.tx').textContent = text;
      chatThread.appendChild(m);
      requestAnimationFrame(() => m.classList.add('on'));
      scrollChatBottom();
    }

    // «думает»: точки + сменяющаяся фраза, затем стрим ответа
    function streamAnswer() {
      const phrases = ['Анализирую запрос', 'Ищу тарифы и условия', 'Формирую ответ'];
      const think = document.createElement('div');
      think.className = 'chat-think rv-block';
      think.innerHTML = '<span class="chat-think-dots"><i></i><i></i><i></i></span><span class="chat-think-tx">' + phrases[0] + '</span>';
      chatThread.appendChild(think);
      requestAnimationFrame(() => think.classList.add('on'));
      const tx = think.querySelector('.chat-think-tx');
      let pi = 0;
      const cyc = setInterval(() => {
        pi++;
        if (pi >= phrases.length) return;
        tx.style.opacity = '0'; tx.style.filter = 'blur(4px)';
        setTimeout(() => { tx.textContent = phrases[pi]; tx.style.opacity = ''; tx.style.filter = ''; }, 180);
      }, 560);
      chatTimer = setTimeout(() => {
        clearInterval(cyc);
        think.remove();
        runSteps(buildAnswer(), 0);
      }, 1550);
    }

    // проигрыватель шагов раскрытия (шаг возвращает паузу до следующего)
    function runSteps(steps, i) {
      if (i >= steps.length) return;
      const pause = steps[i]();
      chatTimer = setTimeout(() => runSteps(steps, i + 1), pause);
    }

    // сборка захардкоженного ответа как набора шагов blur-раскрытия
    function buildAnswer() {
      const ans = document.createElement('div');
      ans.className = 'chat-ans';
      chatThread.appendChild(ans);
      const steps = [];
      // блок целиком: проявляется из размытия и снизу
      const block = (cls, html, pause) => steps.push(() => {
        const el = document.createElement('div');
        el.className = cls + ' rv-block';
        el.innerHTML = html;
        ans.appendChild(el);
        requestAnimationFrame(() => el.classList.add('on'));
        return pause;
      });
      // прозаический блок: слова проявляются по одному (эффект генерации)
      const prose = (cls, text, wd, endPause) => {
        let line;
        steps.push(() => { line = document.createElement('div'); line.className = cls; ans.appendChild(line); return 0; });
        const parts = text.split(' ');
        parts.forEach((w, idx) => steps.push(() => {
          const s = document.createElement('span');
          s.className = 'rv-word';
          s.textContent = w + (idx < parts.length - 1 ? ' ' : '');
          line.appendChild(s);
          requestAnimationFrame(() => s.classList.add('on'));
          return wd;
        }));
        steps.push(() => endPause);
      };

      const pie = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="rgba(3,3,6,0.55)" stroke-width="1.5"/><path d="M10 10V2a8 8 0 0 1 6.9 4z" fill="rgba(3,3,6,0.55)"/></svg>';
      const chev = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      block('chat-sugg', 'Может пригодиться прямо сейчас:', 220);
      block('chat-chips',
        '<button class="chat-chip">' + pie + 'Тариф</button>' +
        '<button class="chat-chip">' + pie + 'Сменить тариф</button>' +
        '<button class="chat-chip">' + pie + 'Подписи к тарифу</button>' +
        '<button class="chat-chip chat-chip-more">Ещё 3 ' + chev + '</button>', 260);
      block('chat-hr', '', 140);
      prose('chat-h', 'Тарифы в Альфа-Банке', 46, 150);
      prose('chat-p', 'Выбор подходящего тарифа — важный шаг для эффективного управления финансами вашей компании. Правильный тариф помогает оптимизировать расходы на банковское обслуживание и получать только нужные вам услуги.', 24, 170);
      prose('chat-h2', 'Как выбрать тариф:', 46, 130);
      block('chat-li', '<span class="dash">—</span><span>Перейдите в раздел «<a class="chat-lnk" href="#">Тариф</a>» и выберите подходящий вариант, ознакомившись с его условиями</span>', 130);
      block('chat-li', '<span class="dash">—</span><span>Скачайте файл «Подробно о тарифе» для детального изучения</span>', 130);
      block('chat-li', '<span class="dash">—</span><span>Нажмите «Перейти к настройкам смены тарифа» и следуйте инструкциям на экране</span>', 130);
      block('chat-li', '<span class="dash">—</span><span>Сравните несколько подходящих вариантов, учитывая не только ежемесячную плату, но и стоимость всех необходимых операций</span>', 160);
      block('chat-expand', 'Развернуть', 260);

      block('chat-sec', 'Операции <span class="chat-sec-c">· 29</span>', 180);
      const opRow = '<div class="chat-ava" style="background:#f26fae">Р</div>' +
        '<div class="chat-op-main"><div class="chat-op-name">ООО «Ромашка»</div><div class="chat-op-desc">Ком. за Форм.по запр.Клиента Отчёта о проверке контрагента</div></div>' +
        '<div class="chat-op-right"><div class="chat-op-sum">15 000,00 ₽</div><div class="chat-op-date">16.05.2023</div></div>' +
        '<div class="chat-status">Исполнен</div>';
      for (let k = 0; k < 5; k++) block('chat-op', opRow, 95);

      block('chat-sec', 'Контрагенты <span class="chat-sec-c">· 7</span>', 160);
      const cps = [
        ['#5b8def', 'A', 'AVALON ALLIANCE — FZCO', 'United Arab Emirates'],
        ['#ef3124', 'А', 'ООО «Альфа-Банк»', 'Регион не указан'],
        ['#2aa775', 'В', 'АО «ВЛАДИМИРСКИЕ КОММУНАЛЬНЫЕ СИСТЕМЫ»', 'Московская область'],
        ['#f5a623', 'И', 'ООО «Интернет Решения»', 'Московская область'],
        ['#5b8def', 'A', 'AVALON ALLIANCE — FZCO', 'United Arab Emirates'],
        ['#f5a623', 'И', 'ООО «Интернет Решения»', 'Московская область'],
        ['#ef3124', 'А', 'ООО «Альфа-Банк»', 'Регион не указан'],
      ];
      cps.forEach((c) => block('chat-cp',
        '<div class="chat-ava" style="background:' + c[0] + '">' + c[1] + '</div>' +
        '<div class="chat-cp-main"><div class="chat-cp-name">' + c[2] + '</div><div class="chat-cp-reg">' + c[3] + '</div></div>', 85));

      return steps;
    }
  }

  window.mountNeuroBar = mountNeuroBar;
})();
