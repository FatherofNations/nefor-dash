"use client";
import { RefObject, useEffect } from "react";

/* ═══════════ Умная строка нейропомощника — поведение (порт js/neuro-bar.js) ═══════════
   Логика перенесена 1:1 из vanilla-модуля. Отличия только в «обвязке»:
   - разметка теперь JSX (компонент NeuroBar), элементы ищем внутри rootRef, не в document;
   - глобальные слушатели (window/document) и таймеры/rAF снимаются в cleanup эффекта,
     чтобы React StrictMode (двойной вызов эффекта в dev) и смена роутов не плодили дубли.

   Функции — объявления внутри эффекта (hoisted), как в оригинальном IIFE. */

export interface NeuroBarOpts {
  left?: string;
  right?: string;
  bottom?: string;
}

export function useNeuroBar(
  rootRef: RefObject<HTMLElement | null>,
  opts: NeuroBarOpts = {}
) {
  const { left, right, bottom } = opts;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const q = <T extends Element>(sel: string): T => root.querySelector(sel) as T;

    // ── элементы (внутри компонента) ──
    const nbar = q<HTMLElement>(".nbar");
    const nbPill = q<HTMLElement>(".nb-pill");
    const nbInput = q<HTMLInputElement>(".nb-input");
    const nbGo = q<HTMLButtonElement>(".nb-go");
    const spot = q<HTMLElement>(".spot");
    const spotClose = q<HTMLElement>(".spot-close");
    const chat = q<HTMLElement>(".chat");
    const chatThread = q<HTMLElement>(".chat-thread");
    const chatScroll = q<HTMLElement>(".chat-scroll");
    const chatInput = q<HTMLInputElement>(".chat-input input");
    const chatClose = q<HTMLElement>(".chat-close");

    // ── позиция контентной колонки ──
    if (left) nbar.style.setProperty("--nbar-left", left);
    if (right) nbar.style.setProperty("--nbar-right", right);
    if (bottom) nbar.style.setProperty("--nbar-bottom", bottom);

    // ── поведение строки ──
    function nbActivate() {
      if (nbar.classList.contains("active")) return;
      nbar.classList.add("active");
      // обнуляем сдвиг магнита, иначе скейл-хлопок (nbPop перебивает transform)
      // по завершении дёрнет пилюлю обратно на офсет курсора
      nbPill.style.setProperty("--mx", "0px");
      nbPill.style.setProperty("--my", "0px");
      nbInput.focus();
    }
    function nbCollapse() {
      nbar.classList.remove("active");
      nbInput.value = "";
      nbInput.blur();
    }
    function setSpot(open: boolean) {
      spot.classList.toggle("open", open);
      spot.setAttribute("aria-hidden", String(!open));
    }

    // ── магнит: строка слегка подъезжает к курсору (плавно, с лагом) ──
    //    амплитуда вдвое слабее прежней (NB_MAX 13→6.5, коэф. 0.2→0.1)
    const NB_R = 210,
      NB_MAX = 6.5;
    let nbLastE: MouseEvent | null = null,
      nbRaf: number | null = null,
      nbMoved = false;
    function nbMagnet() {
      nbRaf = null;
      const e = nbLastE;
      if (!e) return;
      const off =
        nbar.classList.contains("active") ||
        document.body.classList.contains("twk-open") ||
        spot.classList.contains("open") ||
        chat.classList.contains("open");
      let tx = 0,
        ty = 0;
      if (!off) {
        const r = nbar.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const dist = Math.hypot(dx, dy);
        if (dist < NB_R) {
          const f = 1 - dist / NB_R; // 1 у центра → 0 на границе влияния
          tx = Math.max(-NB_MAX, Math.min(NB_MAX, dx * 0.1 * f));
          ty = Math.max(-NB_MAX, Math.min(NB_MAX, dy * 0.1 * f));
        }
      }
      if (tx || ty || nbMoved) {
        nbPill.style.setProperty("--mx", tx.toFixed(2) + "px");
        nbPill.style.setProperty("--my", ty.toFixed(2) + "px");
        nbMoved = !!(tx || ty);
      }
    }
    function onMouseMove(e: MouseEvent) {
      nbLastE = e;
      if (!nbRaf) nbRaf = requestAnimationFrame(nbMagnet);
    }

    // ══════════ Фуллскрин-чат ══════════
    let chatTimer: ReturnType<typeof setTimeout> | null = null;
    let thinkCyc: ReturnType<typeof setInterval> | null = null;
    function stopStream() {
      if (chatTimer) {
        clearTimeout(chatTimer);
        chatTimer = null;
      }
      if (thinkCyc) {
        clearInterval(thinkCyc);
        thinkCyc = null;
      }
    }
    function scrollChatBottom() {
      chatScroll.scrollTop = chatScroll.scrollHeight;
    }
    function setChat(open: boolean) {
      chat.classList.toggle("open", open);
      chat.setAttribute("aria-hidden", String(!open));
    }
    function closeChat() {
      setChat(false);
      stopStream();
    }
    function nowHM() {
      const d = new Date();
      return (
        String(d.getHours()).padStart(2, "0") +
        ":" +
        String(d.getMinutes()).padStart(2, "0")
      );
    }

    // открытие из строки: сброс ленты, вопрос пользователя, генерация ответа
    function openChat() {
      const query = nbInput.value.trim() || "Мой тариф";
      setChat(true);
      stopStream();
      chatThread.innerHTML = "";
      chatScroll.scrollTop = 0;
      addUser(query);
      streamAnswer();
      nbCollapse();
      setTimeout(() => chatInput.focus(), 720); // после подъёма панели
    }
    // повторный вопрос из футера — тот же (захардкоженный) ответ
    function chatSend() {
      const query = chatInput.value.trim();
      if (!query) return;
      stopStream();
      addUser(query);
      streamAnswer();
      chatInput.value = "";
    }

    // пузырь пользователя справа со временем
    function addUser(text: string) {
      const m = document.createElement("div");
      m.className = "chat-msg user rv-block";
      m.innerHTML =
        '<div class="chat-bubble"><span class="tx"></span><span class="tm">' +
        nowHM() +
        "</span></div>";
      (m.querySelector(".tx") as HTMLElement).textContent = text;
      chatThread.appendChild(m);
      requestAnimationFrame(() => m.classList.add("on"));
      scrollChatBottom();
    }

    // «думает»: точки + сменяющаяся фраза, затем стрим ответа
    function streamAnswer() {
      const phrases = ["Анализирую запрос", "Ищу тарифы и условия", "Формирую ответ"];
      const think = document.createElement("div");
      think.className = "chat-think rv-block";
      think.innerHTML =
        '<span class="chat-think-dots"><i></i><i></i><i></i></span><span class="chat-think-tx">' +
        phrases[0] +
        "</span>";
      chatThread.appendChild(think);
      requestAnimationFrame(() => think.classList.add("on"));
      const tx = think.querySelector(".chat-think-tx") as HTMLElement;
      let pi = 0;
      thinkCyc = setInterval(() => {
        pi++;
        if (pi >= phrases.length) return;
        tx.style.opacity = "0";
        tx.style.filter = "blur(4px)";
        setTimeout(() => {
          tx.textContent = phrases[pi];
          tx.style.opacity = "";
          tx.style.filter = "";
        }, 180);
      }, 560);
      chatTimer = setTimeout(() => {
        if (thinkCyc) {
          clearInterval(thinkCyc);
          thinkCyc = null;
        }
        think.remove();
        runSteps(buildAnswer(), 0);
      }, 1550);
    }

    // проигрыватель шагов раскрытия (шаг возвращает паузу до следующего)
    function runSteps(steps: Array<() => number>, i: number) {
      if (i >= steps.length) return;
      const pause = steps[i]();
      chatTimer = setTimeout(() => runSteps(steps, i + 1), pause);
    }

    // сборка захардкоженного ответа как набора шагов blur-раскрытия
    function buildAnswer(): Array<() => number> {
      const ans = document.createElement("div");
      ans.className = "chat-ans";
      chatThread.appendChild(ans);
      const steps: Array<() => number> = [];
      // блок целиком: проявляется из размытия и снизу
      const block = (cls: string, html: string, pause: number) =>
        steps.push(() => {
          const el = document.createElement("div");
          el.className = cls + " rv-block";
          el.innerHTML = html;
          ans.appendChild(el);
          requestAnimationFrame(() => el.classList.add("on"));
          return pause;
        });
      // прозаический блок: слова проявляются по одному (эффект генерации)
      const prose = (cls: string, text: string, wd: number, endPause: number) => {
        let line: HTMLElement;
        steps.push(() => {
          line = document.createElement("div");
          line.className = cls;
          ans.appendChild(line);
          return 0;
        });
        const parts = text.split(" ");
        parts.forEach((w, idx) =>
          steps.push(() => {
            const s = document.createElement("span");
            s.className = "rv-word";
            s.textContent = w + (idx < parts.length - 1 ? " " : "");
            line.appendChild(s);
            requestAnimationFrame(() => s.classList.add("on"));
            return wd;
          })
        );
        steps.push(() => endPause);
      };

      const pie =
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="rgba(3,3,6,0.55)" stroke-width="1.5"/><path d="M10 10V2a8 8 0 0 1 6.9 4z" fill="rgba(3,3,6,0.55)"/></svg>';
      const chev =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      block("chat-sugg", "Может пригодиться прямо сейчас:", 220);
      block(
        "chat-chips",
        '<button class="chat-chip">' +
          pie +
          "Тариф</button>" +
          '<button class="chat-chip">' +
          pie +
          "Сменить тариф</button>" +
          '<button class="chat-chip">' +
          pie +
          "Подписи к тарифу</button>" +
          '<button class="chat-chip chat-chip-more">Ещё 3 ' +
          chev +
          "</button>",
        260
      );
      block("chat-hr", "", 140);
      prose("chat-h", "Тарифы в Альфа-Банке", 46, 150);
      prose(
        "chat-p",
        "Выбор подходящего тарифа — важный шаг для эффективного управления финансами вашей компании. Правильный тариф помогает оптимизировать расходы на банковское обслуживание и получать только нужные вам услуги.",
        24,
        170
      );
      prose("chat-h2", "Как выбрать тариф:", 46, 130);
      block(
        "chat-li",
        '<span class="dash">—</span><span>Перейдите в раздел «<a class="chat-lnk" href="#">Тариф</a>» и выберите подходящий вариант, ознакомившись с его условиями</span>',
        130
      );
      block(
        "chat-li",
        '<span class="dash">—</span><span>Скачайте файл «Подробно о тарифе» для детального изучения</span>',
        130
      );
      block(
        "chat-li",
        '<span class="dash">—</span><span>Нажмите «Перейти к настройкам смены тарифа» и следуйте инструкциям на экране</span>',
        130
      );
      block(
        "chat-li",
        '<span class="dash">—</span><span>Сравните несколько подходящих вариантов, учитывая не только ежемесячную плату, но и стоимость всех необходимых операций</span>',
        160
      );
      block("chat-expand", "Развернуть", 260);

      block("chat-sec", 'Операции <span class="chat-sec-c">· 29</span>', 180);
      const opRow =
        '<div class="chat-ava" style="background:#f26fae">Р</div>' +
        '<div class="chat-op-main"><div class="chat-op-name">ООО «Ромашка»</div><div class="chat-op-desc">Ком. за Форм.по запр.Клиента Отчёта о проверке контрагента</div></div>' +
        '<div class="chat-op-right"><div class="chat-op-sum">15 000,00 ₽</div><div class="chat-op-date">16.05.2023</div></div>' +
        '<div class="chat-status">Исполнен</div>';
      for (let k = 0; k < 5; k++) block("chat-op", opRow, 95);

      block("chat-sec", 'Контрагенты <span class="chat-sec-c">· 7</span>', 160);
      const cps: Array<[string, string, string, string]> = [
        ["#5b8def", "A", "AVALON ALLIANCE — FZCO", "United Arab Emirates"],
        ["#ef3124", "А", "ООО «Альфа-Банк»", "Регион не указан"],
        ["#2aa775", "В", "АО «ВЛАДИМИРСКИЕ КОММУНАЛЬНЫЕ СИСТЕМЫ»", "Московская область"],
        ["#f5a623", "И", "ООО «Интернет Решения»", "Московская область"],
        ["#5b8def", "A", "AVALON ALLIANCE — FZCO", "United Arab Emirates"],
        ["#f5a623", "И", "ООО «Интернет Решения»", "Московская область"],
        ["#ef3124", "А", "ООО «Альфа-Банк»", "Регион не указан"],
      ];
      cps.forEach((c) =>
        block(
          "chat-cp",
          '<div class="chat-ava" style="background:' +
            c[0] +
            '">' +
            c[1] +
            "</div>" +
            '<div class="chat-cp-main"><div class="chat-cp-name">' +
            c[2] +
            '</div><div class="chat-cp-reg">' +
            c[3] +
            "</div></div>",
          85
        )
      );

      return steps;
    }

    // ── обработчики ──
    // клик по свёрнутой пилюле — разворачивает поле
    const onPillClick = () => {
      if (!nbar.classList.contains("active")) nbActivate();
    };
    // кнопка справа: свёрнуто — разворачивает, развёрнуто — поднимает чат
    const onGoClick = (e: MouseEvent) => {
      e.stopPropagation();
      if (nbar.classList.contains("active")) openChat();
      else nbActivate();
    };
    // Enter в поле — поднимает чат с введённым запросом
    const onInputKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        openChat();
      }
    };
    // клик мимо пилюли при пустом поле — сворачивает обратно
    const onDocClick = (e: MouseEvent) => {
      if (
        nbar.classList.contains("active") &&
        !nbPill.contains(e.target as Node) &&
        !nbInput.value.trim()
      )
        nbCollapse();
    };
    // закрытие: крестик или Esc. Esc-цепочка: чат → Spotlight → сворачивание строки
    const onSpotClose = () => setSpot(false);
    const onChatClose = () => closeChat();
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (chat.classList.contains("open")) closeChat();
      else if (spot.classList.contains("open")) setSpot(false);
      else if (nbar.classList.contains("active")) nbCollapse();
    };
    const onChatInputKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        chatSend();
      }
    };

    nbPill.addEventListener("click", onPillClick);
    nbGo.addEventListener("click", onGoClick);
    nbInput.addEventListener("keydown", onInputKey);
    document.addEventListener("click", onDocClick);
    spotClose.addEventListener("click", onSpotClose);
    chatClose.addEventListener("click", onChatClose);
    document.addEventListener("keydown", onDocKey);
    chatInput.addEventListener("keydown", onChatInputKey);
    window.addEventListener("mousemove", onMouseMove);

    // ── cleanup: снимаем глобальные слушатели, гасим таймеры/rAF (StrictMode/маршруты) ──
    return () => {
      nbPill.removeEventListener("click", onPillClick);
      nbGo.removeEventListener("click", onGoClick);
      nbInput.removeEventListener("keydown", onInputKey);
      document.removeEventListener("click", onDocClick);
      spotClose.removeEventListener("click", onSpotClose);
      chatClose.removeEventListener("click", onChatClose);
      document.removeEventListener("keydown", onDocKey);
      chatInput.removeEventListener("keydown", onChatInputKey);
      window.removeEventListener("mousemove", onMouseMove);
      if (nbRaf) cancelAnimationFrame(nbRaf);
      stopStream();
    };
  }, [rootRef, left, right, bottom]);
}
