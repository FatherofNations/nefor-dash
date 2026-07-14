# proto-forge — MCP-сервер для скоростной разработки интерактивных прототипов по Figma-макетам

> Техническая спецификация v0.1 · 2026-07-14
> Основано на опыте проекта nefor-dash (пиксель-перфект дашборды Альфа-Бизнеса:
> статика → Next.js 15, панель tools, neuro-модуль, деплой на Vercel).

---

## 1. Концепция

**Проблема.** Разработка интерактивного прототипа по банковскому макету — это не «сверстать
страницу». Это повторяющийся набор задач с известными граблями: выгрузка данных и ассетов из
Figma (обрезка контекста, пустые экспорты, запечённые фоны), подключение шрифтов дизайн-системы,
канонические анимации (блюр-стаггеры, диссолвы, морфы), инфраструктура прототипа (панель
переключения состояний, deep-links), пиксель-перфект верификация и деплой. Каждый новый человек
проходит эти грабли заново.

**Решение.** MCP-сервер, который агент (Claude Code / Cursor / любой MCP-клиент) подключает
рядом с официальным Figma MCP и получает:

1. **Базу знаний** (MCP resources) — конденсат best practices: как парсить макет, какие кривые
   и тайминги канонические, как чистить ассеты, как деплоить. Агент читает нужный документ
   ПЕРЕД задачей и не изобретает велосипед.
2. **Инструменты** (MCP tools) — автоматизация того, что мы делали руками и одноразовыми
   скриптами: скаффолд проекта из шаблона, пайплайн ассетов (скачать → почистить → WebP),
   шрифты из core-ds, санитайзер SVG, генерация анимаций по канону.
3. **Промпты** (MCP prompts) — готовые сценарии: «новый дашборд по фрейму», «новый виджет
   в пейн», «parity-QA страницы».

**Ключевое разделение ролей:**

| Слой | Ответственность |
|---|---|
| **Figma MCP** (официальный) | Источник правды: `get_design_context`, `get_variable_defs`, `get_screenshot`, `download_assets`, `use_figma` |
| **proto-forge MCP** (наш) | Экспертиза + автоматизация: знает, КАК правильно дёргать Figma MCP, чистит его выдачу, скаффолдит проект, отдаёт каноны |
| **Агент** | Оркестратор: читает гайды из proto-forge, ходит в Figma MCP за данными, пишет код в шаблоне |

proto-forge **не проксирует** Figma MCP (кроме batch-экспорта ассетов через Figma REST API —
там официальный MCP объективно слаб). Дублировать чужой API — путь к рассинхрону.

---

## 2. Архитектура

```
proto-forge/
  src/
    server.ts             # MCP-сервер: @modelcontextprotocol/sdk, stdio-транспорт
    tools/                # инструменты (по файлу на инструмент)
      scaffold.ts
      assets.ts           # import_figma_assets, sanitize_svg, optimize_images
      fonts.ts            # install_fonts (core-ds)
      tokens.ts           # extract_tokens
      animations.ts       # add_animation
      dashboards.ts       # register_dashboard
    knowledge/            # база знаний (markdown, отдаётся как resources)
      figma-import.md
      pixel-perfect.md
      animation-canon.md
      react-patterns.md
      project-structure.md
      tools-panel.md
      deep-links.md
      deploy-vercel.md
      verification.md
      design-system.md
    template/             # шаблон-стартер проекта (см. §5)
  package.json
  README.md
```

**Технологии:**
- Node.js ≥ 22, TypeScript ≥ 5.7.
- `@modelcontextprotocol/sdk` (актуальный мажор), схемы аргументов — `zod`.
- Транспорт: **stdio** (основной — Claude Code, Cursor, Windsurf ставят так).
  Опционально Streamable HTTP для командного хостинга (v2, см. роадмап).
- `sharp` — обработка изображений (WebP lossless, flood-fill чистка, маски).
- Fetch — встроенный `fetch`/`undici` (Node 22).
- Конфигурация через env: `FIGMA_TOKEN` (REST-экспорт ассетов), `PROTO_TEMPLATE_DIR`
  (переопределение пути к шаблону). Никаких токенов в аргументах тулов.

**Принципы:**
- Каждый тул идемпотентен и печатает, что сделал (агенту нужен фидбек для отчёта).
- Тулы не трогают git и не деплоят — это решения человека/агента (правило проекта:
  деплой только по явной команде).
- База знаний — это markdown, который агент читает целиком; каждый документ ≤ ~600 строк,
  сфокусирован, с примерами кода. Не энциклопедия — конденсат.

---

## 3. Resources — база знаний

URI-схема: `proto://knowledge/<имя>`. Каждый ресурс = один документ. Содержание — конденсат
реального опыта (ниже — что обязано войти в каждый).

### 3.1 `figma-import.md` — выгрузка данных из Figma
- Правило №1: **данные только из Figma MCP** (`get_design_context` / `get_variable_defs` /
  `download_assets`), не со скриншотов. Скриншот — только эталон для диффа.
- `get_design_context` обрезается на ~25k токенов → **дозапрашивать по под-узлам**, не
  пытаться взять весь фрейм одним вызовом.
- Листинг страниц/фреймов: `get_metadata` без nodeId может врать (показывает одну страницу) —
  полный список добывается read-only кодом через `use_figma`
  (`figma.root.children` / `page.children`).
- Инстансы с instance-path id (`I…;…`): `getNodeByIdAsync` возвращает null — обходить дерево
  от родителя и экспортировать через `exportAsync` + `base64Encode`.
- Некоторые узлы рендерятся пустыми в изоляции (`get_screenshot` = 1×1) — данные тянуть
  `get_design_context` по каждому под-узлу отдельно.
- Макет — живой документ: дизайнер переделывает фреймы, узлы переезжают
  (пример: search-кнопка 199:31967→199:56451). При повторном заходе перепроверять
  `get_metadata`, не доверять старым node-id.
- Текст из компонентов-статусов может быть недоступен (Status без лейбла) — ставить
  осмысленный дефолт и фиксировать отступление в handoff.
- Asset-URL Figma живут 7 дней; у python-urllib падает SSL — качать через curl или Node fetch.

### 3.2 `pixel-perfect.md` — методика точной вёрстки
- Эталон: `get_screenshot` фрейма → PNG. Сверка: headless Chrome скриншот той же геометрии
  **строго по http://localhost** (по `file://` часть `<img>` стабильно не дорисовывается) →
  `PIL Image.blend` с эталоном. Цель — расхождение только в font-hinting.
- Крупную статичную разметку переносить **byte-perfect** (не переписывать «по мотивам»),
  поведение навешивать поверх. Отступления от макета — только по явной просьбе, каждое
  фиксировать списком «осознанные отступления».
- CSS-транзишены в фоновой вкладке/headless заморожены: конечные состояния проверять инжектом
  `*{transition:none!important}`; середину транзишена ловить трюком
  `transition-duration:60s + transition-delay:-30s`; CSS-анимации — `animation-delay:-t +
  animation-play-state:paused`.
- `--virtual-time-budget` сдвигает часы JS-анимаций — ранние фазы проверять обычным
  скриншотом через ~0.3s wall-clock.
- Дифф-техника для одного виджета: SVG-экспорт узла + бленд.

### 3.3 `animation-canon.md` — канон моушена (главная ценность)
Все рецепты с готовым CSS и значениями:

| Рецепт | Значения |
|---|---|
| **Появление из блюра** (канон) | скрыто: `opacity:0; filter:blur(10–12px); translateY(6–10px)`; появление `0.5s cubic-bezier(0.25,0.1,0.25,1)`; transform `0.55s cubic-bezier(0.32,0.72,0,1)` |
| **Скрытие** (канон, асимметрия!) | `0.22s ease-in`, без задержки — прячем быстро, показываем медленно |
| **Стаггер сверху вниз** | `transition-delay: calc(120ms + var(--i)*30ms)`; `--i` на элементах (или nth-child при ≤12 детях) |
| **Переключение пейнов** (табов) | оба пейна absolute в одной точке; старый — канон скрытия до `opacity:0`; новый — канон появления со стаггером. Свап состояния — при полной прозрачности |
| **Своп целых страниц** | тот же рецепт пейнов на контент-обёртке; ФРЕЙМ (подложка+рамка) не анимируется — растворяется только наполнение. История итераций: равномерный блюр без ухода в 0 и вуаль-волна с mask отклонены — подмена контента видна; правильно только через opacity 0 |
| **Структурная кривая** | ширины/панели/top-стеки: `0.55s cubic-bezier(0.32,0.72,0,1)` (iOS-ощущение) |
| **Сворачивание** | ease-in-out `cubic-bezier(0.65,0,0.35,1)` — кривая берётся из состояния-НАЗНАЧЕНИЯ, поэтому expand/collapse разводятся разными кривыми |
| **Хлопок-морф** (пилюля) | ширина плавно `cubic-bezier(0.5,0,0.2,1)`, «живость» — keyframe scale `0.97→1.05→1` за 0.55s `cubic-bezier(0.22,1,0.36,1)`. ВАЖНО: keyframe с transform перебивает ВЕСЬ transform — обнулять переменные магнита перед запуском |
| **Скользящая капсула табов** | абсолютный слой под кнопками; left/width по `getBoundingClientRect` (субпиксель!); keyframe squish (scale 0.9 на весь полёт); перемер на `document.fonts.ready` с `transition:none` |
| **Вертикальный тикер строк** | клип-контейнер, строки absolute, старая `translateY(-H)`, новая с `+H`, `0.45s cubic-bezier(0.32,0.72,0,1)`; ширина контейнера — JS по rect |
| **Вращающаяся обводка** | `@property --angle` + conic-gradient + mask-composite:exclude; цикл с «передышкой» (0→50% оборот, 50→100% hold; 360≡0 — петля бесшовна) |
| **Магнит к курсору** | mousemove + rAF-троттл, радиус ~210px, смещение `dx*coef*f` с clamp; писать в CSS-переменные `--mx/--my`, транслировать одним transform; выключать при active/открытых оверлеях |
| **Blur-стриминг текста** | блоки `.rv-block` (opacity/blur10/translateY8→0), слова `.rv-word` (blur6+opacity; transform на inline не работает) |

Правила: блюр-паттерн создаёт transform → элемент становится контекстом наложения (z-index
дропдаунов ставить на контейнер); переиспользовать кривые из этого списка, не изобретать.

### 3.4 `react-patterns.md` — перенос статики в Next.js
- Архитектура миграции: byte-perfect HTML через `dangerouslySetInnerHTML` из автогенерённого
  `htmlPartials.ts` (экстрактор нормализует пути ассетов), поведение — типизированные хуки
  с `document.querySelector` + **полный cleanup** (StrictMode прогоняет эффекты дважды).
- `React.memo` на компонентах с `dangerouslySetInnerHTML` обязателен — иначе апдейт контекста
  пере-инжектит статику и стирает JS-выставленные стили.
- Данные, читаемые из DOM при маунте, — захардкоживать (второй StrictMode-прогон читает
  очищенный DOM).
- Оверлеи (fixed-модалки) — вне трансформируемого контента; обёртки — `display:contents`
  (но на display:contents не работают filter/opacity/transform — анимируемая обёртка должна
  быть реальным боксом `fixed inset:0`).
- `filter` на предке делает его containing block для fixed-потомков — безопасно только если
  предок сам `fixed inset:0` (геометрия совпадает с вьюпортом).
- Поэтапный уход от партиалов: перевести партиал в JSX → доказать паритет сравнением
  нормализованного `outerHTML` (длина+хеш) до/после → удалить мёртвый экспорт.
- Не запускать `next build` при живом `next dev` (общий `.next` ломается); Fast Refresh
  не переживает смену числа хуков — полный рестарт.

### 3.5 `project-structure.md` — структура проекта (см. §5, шаблон)

### 3.6 `tools-panel.md` — панель прототипа
- Контекст в root layout → переживает смену роута (панель не закрывается при свопе).
- Селектор дашбордов (карточки), тогглы вариантов, свитчи состояний; Esc закрывает.
- Рамка-обрезка: `clip-path: inset(12px 332px 12px 12px round 20px)` на fixed-обёртке
  (контент 1:1, НЕ масштабируется); фон полей — класс на `html` (содержимое body всё fixed).
  clip-path клипает и fixed-потомков.
- Разделение «фрейм/наполнение»: `.board` (подложка+clip, статична) → `.board-body`
  (скролл-контейнер, анимируется при свопах).
- Смена содержимого панели — ремаунт секции по `key` + стаггер-анимация по канону.

### 3.7 `deep-links.md` — состояние в URL
- Дашборд — в пути; параметры — в query (`?menu=v2&stack=over,usd`).
- Запись: `window.history.replaceState` (Next 15 поддерживает; без навигации/ре-фетча).
- Чтение: один mount-эффект читает `location.search` и применяет теми же сеттерами, что UI.
- НЕ использовать `useSearchParams` — не тянуть Suspense-boundary, статика/SSR целы.
- Первый кадр по deep-link на не-дефолтный вариант — SSR рендерит дефолт (осознанный
  компромисс; лечится только динамическим рендером).

### 3.8 `deploy-vercel.md` — деплой и его грабли
- **Framework Preset**: проект, созданный под статику, имеет `framework:null` — пуш Next.js
  НЕ переключает пресет, билд идёт `@vercel/static-build` → «Ready», но все роуты 404.
  Страховка: коммитить `vercel.json {"framework":"nextjs"}`. Диагностика:
  `.vercel/output/builds.json` (`use`, `detectedFramework`).
- Deployment Protection (`ssoProtection`) прячет прототип за SSO — выключать через
  PATCH `/v9/projects/{id}` при публичном шаринге.
- Канонический алиас может НЕ переехать на новый прод-деплой — сверять hash чанка на домене
  и на URL деплоя; лечится `vercel promote <deploy-url>`.
- Надёжный флоу: `rm -rf .next .vercel/output` → `vercel build --prod` → проверить builder →
  `vercel deploy --prebuilt --prod` → (promote при рассинхроне) → push.
- Токен CLI использовать только внутри скриптов, не печатать в вывод.

### 3.9 `verification.md` — как проверять результат
- Чек-лист parity-QA: все роуты рендерятся; 0 битых `img` (`naturalWidth===0`); консоль без
  ошибок/hydration; интерактив прокликан программно (dispatchEvent, не «на глаз»); тайминги
  анимаций сэмплированы `getComputedStyle` по кадрам.
- Скриншоты — доказательство, не метод проверки: сначала измерить DOM, потом снять кадр.
- Замороженные rAF/транзишены в фоновых вкладках; `preview_click` мимо
  `pointer-events:none` элементов — кликать dispatchEvent'ом.

### 3.10 `design-system.md` — работа с дизайн-системой (core-ds)
- Шрифты: `github.com/core-ds/core-components` →
  `.storybook/public/fonts/*.woff2` (Alfa Interface Sans regular/medium/bold, Styrene UI bold).
  Подключение: `@font-face` с `font-display:swap` + `ReactDOM.preload` (не `next/font/local` —
  он хеширует имя семейства, а вербатим-CSS ссылается литералом).
- Иконки: пакет `core-ds/icons` — SVG берутся как CSS-маски (пример: ArrowBackMIcon);
  из экспортов вычищать запечённый `fill-opacity` (двойная полупрозрачность у масок).
- Контентные шрифты макета могут отличаться от хрома (SF Pro = `-apple-system` для контента,
  Alfa для интерфейсного хрома) — проверять `font_family` в design context, не предполагать.

---

## 4. Tools — инструменты

Схемы аргументов — zod; все пути — относительно корня проекта агента.

### 4.1 `scaffold_project`
Создаёт новый проект из шаблона (§5).
```
args: {
  name: string,               // имя проекта/директории
  dashboards: string[],       // имена дашбордов-заготовок (≥1)
  features: {
    toolsPanel: boolean,      // панель прототипа (default true)
    neuroBar: boolean,        // модуль умной строки (default false)
    deepLinks: boolean,       // состояние в URL (default true)
    mobileGate: boolean       // заглушка <1024px (default true)
  }
}
→ создаёт дерево, подставляет имена, печатает следующий шаг (install_fonts, extract_tokens)
```

### 4.2 `import_figma_assets`
Batch-экспорт ассетов через **Figma REST API** (нужен `FIGMA_TOKEN`). Решает грабли
официального MCP: пустые экспорты, запечённые фоны, недолговечные URL.
```
args: {
  fileKey: string,
  nodes: { id: string, name: string, format: "png"|"svg", scale?: 1|2|3|4 }[],
  outDir: string              // обычно public/assets/figma
}
поведение:
  - PNG: скачать → проверить непустоту (bbox по alpha; пустой → отчёт с советом
    перевыгрузить узел-родитель) → опционально flood-fill чистка запечённого фона от краёв
    → rounded-rect маска (для кнопок с запечёнными углами секции) → lossless WebP
    (fallback: оставить PNG, если WebP не меньше)
  - SVG: прогнать sanitize_svg (см. 4.3)
→ манифест: имя, размер, формат, применённые чистки, предупреждения
```

### 4.3 `sanitize_svg`
```
args: { files: string[] }
чистки:
  - fill="var(--fill-0, …)" → конкретный цвет (в <img> CSS-переменные не работают —
    иконка становится невидимой)
  - удаление фоновых path (по эвристике: полноразмерный prмоугольник первым элементом)
  - предупреждение о fill-opacity на элементах, которые пойдут в CSS-маску
→ отчёт по каждому файлу
```

### 4.4 `install_fonts`
```
args: { families: ("alfa-interface-sans"|"styrene-ui"|…)[], targetDir: string }
поведение: качает woff2 из core-ds (raw.githubusercontent), кладёт в public/fonts,
  генерирует styles/fonts.css (@font-face, font-display:swap) и сниппет preload для layout
```

### 4.5 `extract_tokens`
```
args: { variableDefs: json }   // выдача get_variable_defs — агент передаёт как есть
→ styles/tokens.css с CSS-переменными (:root), маппинг имён Figma → kebab-case
```

### 4.6 `add_animation`
Генерирует канон-рецепт из animation-canon под конкретный селектор.
```
args: {
  recipe: "blur-reveal"|"stagger"|"pane-switch"|"content-dissolve"|"tab-pill"|
          "ticker"|"spin-ring"|"magnet"|"stream-reveal",
  selector: string,
  params?: { items?: number, delayBase?: number, delayStep?: number, … }
}
→ CSS-блок + инструкция подключения (куда класс, что в JS), с канон-значениями по умолчанию
```

### 4.7 `register_dashboard`
```
args: { name: string, route: string, cardTitle: string, cardSubtitle: string }
→ создаёт app/<route>/page.tsx-заготовку, добавляет карточку в ToolsPanel,
  подключает в swapTo/deep-links
```

### 4.8 `get_checklist`
```
args: { stage: "import"|"layout"|"animation"|"qa"|"deploy" }
→ короткий чек-лист стадии (выжимка из knowledge, для самопроверки агента перед сдачей)
```

Не-тулы (осознанно): деплой, git-операции, запуск dev-сервера — это делает агент по гайдам
`deploy-vercel.md`; скрипт верификации живёт в шаблоне (`npm run verify`), а не в сервере.

---

## 5. Шаблон проекта (template/)

Обобщённый nefor-dash без бренд-контента:

```
template/
  app/
    layout.tsx              # CSS-подключения, preload шрифтов, ToolsProvider, mobile-gate
    page.tsx                # первый дашборд
    robots.ts               # noindex (прототипы не индексируем)
    icon.svg                # плейсхолдер
  components/
    tools/                  # ToolsProvider (контекст, swapTo-диссолв, deep-links),
                            # ToolsPanel (карточки, .twk-dyn стаггер)
    neuro/                  # NeuroBar + useNeuroBar (опционально при скаффолде)
    BodyClass.tsx
  lib/                      # заготовка хука поведения страницы (порт vanilla-паттерна)
  styles/
    tokens.css              # заполняется extract_tokens
    fonts.css               # заполняется install_fonts
    canon.css               # ВЕСЬ анимационный канон как utility-классы + комменты
    tools.css               # панель, .board/.board-body, рамка, диссолв
    mobile-gate.css
  data/                     # демо-данные отдельно от вёрстки
  scripts/
    extract.py              # экстрактор byte-perfect партиалов из статики (если путь миграции)
    verify.mjs              # parity-QA: роуты, битые img, консоль, headless-скриншоты
  .github/workflows/ci.yml  # lint + tsc + build
  vercel.json               # {"framework":"nextjs"} — страховка
  eslint.config.mjs         # flat, eslint CLI, --max-warnings 0
  package.json              # next 15 / react 19 / ts 5.7+
  HANDOFF-TEMPLATE.md       # каркас handoff-документа (заполняется по ходу)
```

Правила шаблона: глобальный CSS без UI-библиотек; ассеты в `public/assets/figma`;
`<img>` с явными путями от корня; данные в `data/*`; один дашборд = роут + карточка панели.

---

## 6. Prompts

| Промпт | Аргументы | Сценарий |
|---|---|---|
| `new-dashboard` | fileKey, nodeId, name | полный цикл: прочитать figma-import + pixel-perfect → распарсить фрейм по под-узлам → import_figma_assets → вёрстка → register_dashboard → verify |
| `new-widget` | fileKey, nodeId, pane | виджет в существующий пейн: parse → assets → вёрстка в канон-сетке → stagger |
| `port-animation` | описание/референс | подобрать рецепт из канона, применить add_animation |
| `parity-qa` | route | прогнать verification-чеклист, отчёт с измерениями |
| `ship` | — | чек-лист деплоя из deploy-vercel.md (агент выполняет сам, сервер не деплоит) |

---

## 7. Роадмап

**MVP (для одного пользователя, stdio):**
1. Каркас сервера + resources (все 10 документов базы знаний) + `get_checklist`.
2. `scaffold_project` + шаблон (выкристаллизовать из nefor-dash, заменить бренд-контент).
3. `install_fonts`, `sanitize_svg`.

**v1:**
4. `import_figma_assets` (Figma REST + sharp-пайплайн).
5. `extract_tokens`, `add_animation`, `register_dashboard`.
6. `verify.mjs` в шаблоне (playwright или headless chrome через CDP).

**v2 (команда):**
7. Streamable HTTP хостинг + auth, чтобы команда подключалась к одному серверу.
8. Версионирование базы знаний (знания пополняются с каждого проекта — это главный актив).
9. Библиотека готовых блоков (сайдбар-стек, лента операций, табло карточек) как
   параметризуемые генераторы.

---

## 8. Открытые вопросы (решить до начала разработки)

1. **Имя и владение**: отдельный репозиторий; шаблон — внутри репо сервера или отдельным
   template-repo (degit)? Рекомендация: внутри, версионируются вместе.
2. **Figma REST vs официальный MCP** для ассетов: REST надёжнее для batch и чисток, но
   требует токен с правами на файл. MVP может жить на download_assets официального MCP
   (агент качает по гайду), REST — в v1.
3. **Лицензии**: шрифты Alfa Interface Sans / core-ds — уточнить право распространения в
   шаблоне (сейчас install_fonts качает из публичного репо core-ds, не вшивает в пакет).
4. **Язык базы знаний**: русский (команда) — агенты читают свободно.
