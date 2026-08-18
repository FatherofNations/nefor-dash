/* ═══ Баланс игры: башни, апгрейды, враги, волны, экономика ═══
   Тема — оборона расчётного счёта от того, что его обычно и опустошает.
   Башни называются как подразделения банка, враги — как списания. */

import type { EnemyKey, TowerKey } from "./art";

export type Fire = "bullet" | "shell" | "mortar" | "flame" | "chain";

export interface TowerDef {
  key: TowerKey;
  name: string;
  desc: string;
  cost: number;
  /** радиус поражения, px */
  range: number;
  /** выстрелов в секунду (у огнемёта — тиков урона) */
  rate: number;
  dmg: number;
  fire: Fire;
  /** радиус осколочного урона, px */
  splash?: number;
  /** урон/сек поджига и его длительность, сек */
  burn?: [number, number];
  /** сколько целей задевает молния (включая первую) */
  links?: number;
  /** полуугол конуса огнемёта, рад */
  cone?: number;
  /** замедление: доля от скорости и длительность, сек */
  slow?: [number, number];
}

/* Колода — ЛЕСТНИЦА: каждая следующая дороже и сильнее предыдущей, шаг 35 ₽.
   Порядок здесь же задаёт и порядок карточек, и горячие клавиши 1–5. */
export const TOWERS: TowerDef[] = [
  {
    key: "inkass",
    name: "Инкассатор",
    desc: "Очередями по одной цели. Дёшево и без пауз.",
    cost: 60,
    range: 132,
    rate: 2.8,
    dmg: 9,
    fire: "bullet",
  },
  {
    key: "penalty",
    name: "Неустойка",
    desc: "Конус огня вблизи. Поджигает всех, кого задел, — мимо брони.",
    cost: 95,
    range: 104,
    rate: 8,
    dmg: 3.6,
    fire: "flame",
    burn: [10, 2.6],
    cone: 0.5,
  },
  {
    key: "compl",
    name: "Комплаенс",
    desc: "Пробивает броню и арестовывает: −30% скорости на 2 с.",
    cost: 130,
    range: 176,
    rate: 0.8,
    dmg: 58,
    fire: "shell",
    slow: [0.3, 2],
  },
  {
    key: "fraud",
    name: "Антифрод",
    desc: "Молния прыгает по цепочке из трёх целей.",
    cost: 165,
    range: 152,
    rate: 1.15,
    dmg: 30,
    fire: "chain",
    links: 3,
  },
  {
    key: "audit",
    name: "Аудит",
    desc: "Навесом по площади. Достаёт через полкарты.",
    cost: 200,
    range: 250,
    rate: 0.5,
    dmg: 54,
    fire: "mortar",
    splash: 66,
  },
];

/* ── Апгрейды: по два на башню, и каждый усиливает ИМЕННО её роль ──
   Инкассатор — темп и пробитие, Неустойка — горение и охват, Комплаенс —
   арест, Антифрод — длина цепи, Аудит — площадь и залп. */
export interface Upgrade {
  name: string;
  desc: string;
  /** цена = базовая стоимость башни × это */
  costK: number;
}

export const UPGRADES: Record<TowerKey, [Upgrade, Upgrade]> = {
  inkass: [
    { name: "Второй ствол", desc: "Темп стрельбы +60%.", costK: 0.9 },
    { name: "Бронебойные", desc: "Урон +40% и полное игнорирование брони.", costK: 1.5 },
  ],
  penalty: [
    { name: "Горючая смесь", desc: "Поджиг +90% урона и держится на секунду дольше.", costK: 0.9 },
    { name: "Широкое сопло", desc: "Конус в полтора раза шире, дальность +35%.", costK: 1.5 },
  ],
  compl: [
    { name: "Арест счёта", desc: "Замедление до −55% и держится 3,5 с.", costK: 0.9 },
    { name: "Выемка", desc: "Урон +60%, арест накрывает всех в 70 px от попадания.", costK: 1.5 },
  ],
  fraud: [
    { name: "Четвёртое звено", desc: "Цепь на 4 цели, затухание слабее.", costK: 0.9 },
    { name: "Пятое звено", desc: "Цепь на 5 целей, урон +35%.", costK: 1.5 },
  ],
  audit: [
    { name: "Кассетный заряд", desc: "Радиус осколков +45%.", costK: 0.9 },
    { name: "Двойной залп", desc: "Две мины за выстрел, урон +25%.", costK: 1.5 },
  ],
};

/** Итоговые характеристики башни с учётом её уровня. */
export interface TowerStats {
  dmg: number;
  rate: number;
  range: number;
  splash: number;
  links: number;
  cone: number;
  burn: [number, number] | null;
  slow: [number, number] | null;
  /** игнорировать броню цели */
  pierce: boolean;
  /** радиус, в котором замедление цепляет соседей */
  slowRadius: number;
  /** снарядов за выстрел (Аудит-2) */
  volley: number;
}

export function statsOf(def: TowerDef, lvl: number): TowerStats {
  const s: TowerStats = {
    dmg: def.dmg,
    rate: def.rate,
    range: def.range,
    splash: def.splash ?? 0,
    links: def.links ?? 1,
    cone: def.cone ?? 0.5,
    burn: def.burn ? [def.burn[0], def.burn[1]] : null,
    slow: def.slow ? [def.slow[0], def.slow[1]] : null,
    pierce: false,
    slowRadius: 0,
    volley: 1,
  };
  if (lvl < 1) return s;
  switch (def.key) {
    case "inkass":
      s.rate *= 1.6;
      if (lvl >= 2) {
        s.dmg *= 1.4;
        s.pierce = true;
      }
      break;
    case "penalty":
      if (s.burn) s.burn = [s.burn[0] * 1.9, s.burn[1] + 1];
      if (lvl >= 2) {
        s.cone *= 1.5;
        s.range *= 1.35;
      }
      break;
    case "compl":
      s.slow = [0.55, 3.5];
      if (lvl >= 2) {
        s.dmg *= 1.6;
        s.slowRadius = 70;
      }
      break;
    case "fraud":
      s.links = 4;
      if (lvl >= 2) {
        s.links = 5;
        s.dmg *= 1.35;
      }
      break;
    case "audit":
      s.splash *= 1.45;
      if (lvl >= 2) {
        s.volley = 2;
        s.dmg *= 1.25;
      }
      break;
  }
  return s;
}

/** Затухание урона по цепочке — с апгрейдом цепь бьёт ровнее. */
export const chainDecay = (lvl: number) => (lvl >= 1 ? 0.82 : 0.68);

export const MAX_LVL = 2;
/** Цена следующего уровня (или null, если башня уже прокачана). */
export const upgradeCost = (def: TowerDef, lvl: number) =>
  lvl >= MAX_LVL ? null : Math.round(def.cost * UPGRADES[def.key][lvl].costK);

export interface EnemyDef {
  key: EnemyKey;
  name: string;
  /** короткое имя для узкой колонки бестиария (по умолчанию — name) */
  short?: string;
  hp: number;
  /** px/сек */
  speed: number;
  /** ₽ в бюджет за убийство */
  bounty: number;
  /** сколько уносит со счёта за прорыв */
  steal: number;
  /** плоское снижение входящего урона */
  armor: number;
  scale: number;
}

/** Порядок вывода в бестиарии — от мелочи к боссу. */
export const ENEMY_ORDER: EnemyKey[] = ["pena", "commission", "fine", "tax", "block"];

/* Скорость обратна живучести: мелочь проскакивает раньше, чем её успевают
   расстрелять, а тяжёлые ползут. Награды намеренно скупые — деньги должны
   быть дефицитом, из-за которого приходится выбирать между новой башней и
   апгрейдом уже стоящей. */
export const ENEMIES: Record<EnemyKey, EnemyDef> = {
  pena: { key: "pena", name: "Пеня", hp: 22, speed: 276, bounty: 3, steal: 18_000, armor: 0, scale: 2 },
  commission: { key: "commission", name: "Комиссия", hp: 36, speed: 162, bounty: 5, steal: 30_000, armor: 1, scale: 2 },
  fine: { key: "fine", name: "Штраф", hp: 74, speed: 82, bounty: 8, steal: 58_000, armor: 2, scale: 2 },
  tax: { key: "tax", name: "Налог", hp: 270, speed: 64, bounty: 18, steal: 145_000, armor: 7, scale: 2 },
  block: { key: "block", name: "Блокировка 115-ФЗ", short: "Блокировка", hp: 1500, speed: 30, bounty: 100, steal: 520_000, armor: 11, scale: 2 },
};

export interface Spawn {
  key: EnemyKey;
  count: number;
  /** пауза между особями, мс */
  gap: number;
  /** задержка от начала волны, мс */
  delay?: number;
}

export interface Wave {
  spawns: Spawn[];
  /** подпись волны в тосте */
  note?: string;
  /** имя босс-волны */
  title?: string;
  /** сколько боссов (они же обесточивают столько башен) */
  bosses: number;
}

/** Сколько волн держится оборона. Каждая десятая — босс-волна. */
export const WAVE_COUNT = 100;
/** Босс-волна каждые BOSS_EVERY волн, боссов в ней = номер/BOSS_EVERY. */
export const BOSS_EVERY = 10;

/* Имена босс-волн — по нарастанию страшности для владельца счёта. */
const BOSS_NAMES = [
  "ТЕХНИЧЕСКИЙ СБОЙ",
  "КВАРТАЛЬНЫЙ ОТЧЁТ",
  "ДВОЙНАЯ КОНВЕРТАЦИЯ",
  "НАЛОГОВАЯ ДЕКЛАРАЦИЯ",
  "ВСТРЕЧНАЯ ПРОВЕРКА",
  "ЗАПРОС ПО 115-ФЗ",
  "ПРОВЕРКА ЦБ",
  "МЕЖДУНАРОДНЫЕ САНКЦИИ",
  "ОТЗЫВ ЛИЦЕНЗИИ",
  "НАЧАЛЬНИК ПРИШЁЛ",
];
export const bossTitle = (n: number) =>
  BOSS_NAMES[Math.min(BOSS_NAMES.length - 1, Math.floor(n / BOSS_EVERY) - 1)];

/* Первые волны расписаны руками: они знакомят с типами по одному, чтобы
   объявление «новый противник» успевало сработать и игрок понял, чем бить. */
const INTRO: Omit<Wave, "bosses">[] = [
  { spawns: [{ key: "commission", count: 6, gap: 820 }], note: "мелкие списания" },
  { spawns: [{ key: "commission", count: 9, gap: 620 }] },
  { spawns: [{ key: "pena", count: 12, gap: 300 }], note: "пени идут роем" },
  {
    spawns: [
      { key: "commission", count: 8, gap: 560 },
      { key: "fine", count: 4, gap: 900, delay: 1600 },
    ],
  },
  {
    spawns: [
      { key: "fine", count: 9, gap: 620 },
      { key: "pena", count: 6, gap: 300, delay: 2400 },
    ],
  },
  {
    spawns: [
      { key: "pena", count: 18, gap: 240 },
      { key: "commission", count: 7, gap: 620, delay: 2200 },
    ],
  },
  {
    spawns: [
      { key: "tax", count: 2, gap: 2600 },
      { key: "commission", count: 12, gap: 520, delay: 900 },
      { key: "pena", count: 12, gap: 260, delay: 3400 },
    ],
    note: "пошли налоги — нужна пробивная башня",
  },
  {
    spawns: [
      { key: "fine", count: 12, gap: 520 },
      { key: "pena", count: 16, gap: 260, delay: 3000 },
    ],
  },
  {
    spawns: [
      { key: "tax", count: 4, gap: 2000 },
      { key: "fine", count: 10, gap: 620, delay: 1400 },
      { key: "pena", count: 16, gap: 260, delay: 3600 },
    ],
  },
];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Прирост численности: сверх обычного роста ещё +5 особей за каждую волну. */
const EXTRA_PER_WAVE = 5;

/**
 * Состав волны. До конца INTRO — по таблице, дальше генерится: мелочи и
 * середняков становится больше, паузы между ними короче, а каждая десятая
 * волна приводит боссов — по одному за каждый десяток (10-я → 1, 50-я → 5).
 */
const totalOf = (w: Wave) => w.spawns.reduce((sum, sp) => sum + sp.count, 0);

/* Численность не должна проседать НИКОГДА: игрок читает уменьшение как
   «стало легче», хотя враги при этом только крепчают. Просадки возникали
   сами собой — и в ручной таблице, и после каждой босс-волны (босс раздувал
   свою волну, следующая оказывалась меньше). Поэтому волны строятся по
   порядку, с памятью о предыдущей: недобор добивается мелочью.
   Кэш заодно делает waveOf дешёвым — его дёргает HUD несколько раз в секунду. */
const cache: Wave[] = [];

export function waveOf(n: number): Wave {
  for (let i = cache.length; i < n; i++) {
    const w = buildWave(i + 1);
    const need = i > 0 ? totalOf(cache[i - 1]) : 0;
    const gap = need - totalOf(w);
    if (gap > 0) {
      const pena = w.spawns.find((sp) => sp.key === "pena");
      if (pena) pena.count += gap;
      else w.spawns.push({ key: "pena", count: gap, gap: 200, delay: 1500 });
    }
    cache.push(w);
  }
  return cache[n - 1];
}

function buildWave(n: number): Wave {
  const bosses = n % BOSS_EVERY === 0 ? Math.floor(n / BOSS_EVERY) : 0;
  if (n <= INTRO.length) return { ...INTRO[n - 1], bosses: 0 };

  const spawns: Spawn[] = [];
  // на босс-волне мелочь выходит позже — иначе она заслоняет вход боссов
  const lead = bosses ? 2600 : 0;
  // линейная прибавка численности делится между мелочью и середняками
  const extra = (n - 1) * EXTRA_PER_WAVE;

  if (bosses) spawns.push({ key: "block", count: bosses, gap: 2400 });

  spawns.push({
    key: "pena",
    count: Math.round(clamp(8 + n * 0.9, 8, 46) + extra * 0.45),
    gap: Math.round(clamp(320 - n * 3, 110, 320)),
    delay: lead + 1200,
  });
  spawns.push({
    key: "commission",
    count: Math.round(clamp(6 + n * 0.7, 6, 38) + extra * 0.3),
    gap: Math.round(clamp(560 - n * 5, 170, 560)),
    delay: lead,
  });
  spawns.push({
    key: "fine",
    count: Math.round(clamp(4 + n * 0.55, 4, 30) + extra * 0.18),
    gap: Math.round(clamp(620 - n * 4, 220, 620)),
    delay: lead + 900,
  });
  spawns.push({
    key: "tax",
    count: Math.round(clamp(1 + n * 0.28, 1, 16) + extra * 0.07),
    gap: Math.round(clamp(2000 - n * 12, 650, 2000)),
    delay: lead + 1800,
  });

  return {
    spawns,
    bosses,
    title: bosses ? bossTitle(n) : undefined,
    note: bosses
      ? bosses === 1
        ? "блокировка обесточит одну башню"
        : `блокировок ${bosses} — обесточат ${bosses} башни`
      : undefined,
  };
}

/* Каждые десять волн враги целиком крепчают на 10%: HP, скорость, броня и
   сумма, которую уносит прорыв. Множитель НЕ трогает награду — иначе рост
   сложности сам себя и оплачивал бы. Считается ступенькой (волны 1–9 → ×1,
   10–19 → ×1.1, 20–29 → ×1.21 …), поэтому каждая десятая ощущается порогом. */
export const decadeMul = (wave: number) => Math.pow(1.1, Math.floor(wave / 10));

/** Прибавка HP за волну. */
export const hpMul = (wave: number) => 1 + (wave - 1) * 0.09;
/* Награда за голову почти НЕ растёт. Доход и так увеличивается сам собой —
   врагов с каждой волной больше. Если ещё и множитель разгонять, к 30-й волне
   касса переполняется и тратить деньги становится некуда: именно от этого
   игра и разваливалась в скуку. */
export const bountyMul = (wave: number) => 1 + (wave - 1) * 0.012;

export const START_BUDGET = 260;
/** награда за зачистку волны — скромная, основной доход с голов */
export const waveBonus = (wave: number) => Math.round(25 + wave * 3);
/** пауза перед следующей волной, сек (можно вызвать раньше — за премию) */
export const WAVE_GAP = 12;
/** премия за каждую недождавшуюся секунду */
export const EARLY_BONUS = 3;
/** возврат при разборе башни — половина того, что за неё заплатили */
export const SELL_RATE = 0.5;

/* Цена башни постоянна и не зависит от того, сколько их уже стоит: прыгающий
   ценник в колоде читался как ошибка. Денежный сток — апгрейды. */

/** запасной баланс, если плашки счёта в вёрстке не нашлось */
export const FALLBACK_ACCOUNT = 2_300_880.95;

/* ── строка характеристик для карточки в колоде ──
   Значки взяты текстовыми (с вариатором U+FE0E там, где шрифт норовит подсунуть
   эмодзи), чтобы не тащить иконочный набор ради шести глифов. Урон показываем
   в секунду: у огнемёта «за выстрел» стоит 3,6 и выглядит смешно, хотя тиков
   восемь в секунду — сопоставимое число только одно, и это DPS. */
export interface StatChip {
  icon: string;
  text: string;
  title: string;
}

export function statChips(def: TowerDef): StatChip[] {
  const s = statsOf(def, 0);
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const out: StatChip[] = [
    { icon: "⚔︎", text: `${Math.round(s.dmg * s.rate)}`, title: "Урон в секунду" },
    { icon: "≫", text: `${round1(s.rate)}/с`, title: "Выстрелов в секунду" },
    { icon: "◎", text: `${Math.round(s.range)}`, title: "Дальность, px" },
  ];
  if (s.splash) out.push({ icon: "◌", text: `${Math.round(s.splash)}`, title: "Радиус осколков, px" });
  if (s.links > 1) out.push({ icon: "⌁", text: `×${s.links}`, title: "Целей в цепи" });
  if (s.burn) {
    out.push({
      icon: "≋",
      text: `${round1(s.burn[0])}/с`,
      title: `Поджиг: ${round1(s.burn[0])} урона в секунду ${round1(s.burn[1])} с, мимо брони`,
    });
  }
  if (s.slow) {
    out.push({
      icon: "❄︎",
      text: `−${Math.round(s.slow[0] * 100)}%`,
      title: `Замедление на ${round1(s.slow[1])} с`,
    });
  }
  return out;
}
