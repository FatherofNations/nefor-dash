/* ═══ Движок ТД: симуляция и отрисовка ═══
   Один канвас поверх дашборда. Статика (обводки зданий, сетка улиц, маршруты)
   печётся в offscreen один раз на раскладку и блитится одним drawImage —
   каждый кадр перерисовываются только живые объекты. Вся геометрия в CSS-px,
   масштаб под DPR задан трансформацией контекста. */

import { Baked, bake, pxDot, pxLine } from "./pixel";
import { BARREL, ENEMY_ART, EnemyKey, NEON, TOWER_ART, TowerKey } from "./art";
import {
  EARLY_BONUS,
  ENEMIES,
  EnemyDef,
  MAX_LVL,
  SELL_RATE,
  START_BUDGET,
  TOWERS,
  TowerDef,
  TowerStats,
  UPGRADES,
  WAVE_COUNT,
  WAVE_GAP,
  bountyMul,
  chainDecay,
  hpMul,
  statsOf,
  upgradeCost,
  waveBonus,
  waveOf,
} from "./defs";
import { Field, Pt, Route, Slot, normalAt, pointAt, slotAt } from "./field";

/** сторона «крупного пикселя»: весь арт живёт на этой сетке */
const PX = 2;
const S = 2; // масштаб спрайтов (1 арт-пиксель = S CSS-px)

export interface Stats {
  budget: number;
  account: number;
  accountMax: number;
  wave: number;
  waves: number;
  /** сек до следующей волны; −1 — волна идёт */
  countdown: number;
  /** сколько врагов на волне ещё не убито: невыпущенные + живые */
  left: number;
  /** всего врагов в этой волне */
  waveTotal: number;
  selected: TowerKey | null;
  paused: boolean;
  speed: number;
  over: null | "win" | "lose";
  /** итоги партии — для финального экрана */
  kills: number;
  earned: number;
}

export interface Hooks {
  onStats: (s: Stats) => void;
  onAccount: (v: number) => void;
  onToast: (title: string, sub?: string) => void;
  /** тип врага вышел на поле впервые — показать его карточку */
  onNewEnemy: (key: EnemyKey) => void;
  onShake: () => void;
  /** зона сброса для продажи — прямоугольник колоды башен */
  sellZone: () => { x: number; y: number; w: number; h: number };
  /** тащим башню: подсветить колоду и показать сумму возврата */
  onDragSell: (over: boolean, refund: number) => void;
  /** кликнули по поставленной башне — показать панель улучшения */
  onTowerPanel: (info: TowerInfo | null) => void;
  sfx: (name: "shot" | "boom" | "zap" | "flame" | "leak" | "build" | "die" | "wave") => void;
}

interface Enemy {
  def: EnemyDef;
  hp: number;
  maxHp: number;
  /** награда с учётом множителя волны — фиксируется на спавне */
  bounty: number;
  route: Route;
  ri: number;
  d: number;
  lane: number;
  x: number;
  y: number;
  face: number;
  anim: number;
  /** своя полоса на улице — к ней враг возвращается после обгона */
  lane0: number;
  burn: number;
  burnT: number;
  /** замедление: остаток времени и доля, на которую режется скорость.
      НЕ стакается — новое попадание просто перезаписывает эффект. */
  slowT: number;
  slowF: number;
  /** остаток свечения от разряда цепи — только визуал */
  zapT: number;
  flash: number;
}

interface Tower {
  def: TowerDef;
  slot: Slot;
  x: number; // низ-центр слота
  y: number;
  /** сколько всего в неё вложено (покупка + апгрейды) — с этого и возврат */
  paid: number;
  /** 0 — базовая, 1–2 — прокачанная */
  lvl: number;
  st: TowerStats;
  /** обесточена боссом до конца волны */
  frozen: boolean;
  cd: number;
  angle: number;
  flash: number;
  heat: number; // огнемёт: длина языка пламени 0..1
}

/** Что показать в панели улучшения выбранной башни. */
export interface TowerInfo {
  key: TowerKey;
  name: string;
  lvl: number;
  maxLvl: number;
  /** экранная точка, к которой прижимается панель */
  x: number;
  y: number;
  upName: string | null;
  upDesc: string | null;
  upCost: number | null;
  sell: number;
  frozen: boolean;
  affordable: boolean;
}

interface Shot {
  mortar: boolean;
  x: number;
  y: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  dmg: number;
  splash: number;
  color: string;
  target: Enemy | null;
  /** замедление при попадании (Комплаенс) */
  slow: [number, number] | null;
  /** радиус, в котором замедление цепляет соседей (Комплаенс-2) */
  slowRadius: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  size: number;
  grav: number;
}
interface Tracer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  color: string;
}
interface Bolt {
  pts: Pt[];
  t: number;
  color: string;
}
interface Boom {
  x: number;
  y: number;
  t: number;
  r: number;
  color: string;
}
interface Label {
  x: number;
  y: number;
  t: number;
  text: string;
  color: string;
}

interface Pending {
  key: EnemyKey;
  at: number; // мс от старта волны
}

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** Полоса не должна вылезать за ширину улицы (коридоры от 40px). */
const LANE_MAX = 15;
const clampLane = (v: number) => (v < -LANE_MAX ? -LANE_MAX : v > LANE_MAX ? LANE_MAX : v);
const dist2 = (ax: number, ay: number, bx: number, by: number) =>
  (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

export class Game {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private dead = false;

  private field: Field;
  private hooks: Hooks;
  private canvas: HTMLCanvasElement;

  private towerArt = new Map<TowerKey, Baked>();
  private enemyArt = new Map<EnemyKey, Baked[]>();
  private statics: HTMLCanvasElement | null = null;
  private slotsLayer: HTMLCanvasElement | null = null;

  private enemies: Enemy[] = [];
  private towers: Tower[] = [];
  private taken = new Set<number>();
  private shots: Shot[] = [];
  private sparks: Spark[] = [];
  private tracers: Tracer[] = [];
  private bolts: Bolt[] = [];
  private booms: Boom[] = [];
  private labels: Label[] = [];
  private flames: Spark[] = [];

  private budget = START_BUDGET;
  private account: number;
  private accountMax: number;
  private wave = 0;
  private pending: Pending[] = [];
  private waveT = 0;
  private waveTotal = 0;
  private gap = WAVE_GAP;
  private running = false; // волна в процессе выпуска/зачистки
  private paused = false;
  private speed = 1;
  private over: null | "win" | "lose" = null;
  private kills = 0;
  private earned = 0;
  private panelFor: Tower | null = null;

  private seen = new Set<EnemyKey>(); // какие типы врагов уже объявляли
  private selected: TowerKey | null = null;
  private mouse: Pt | null = null;
  private drag: Tower | null = null;
  private dragPos: Pt = { x: 0, y: 0 };
  private dragMoved = false;
  private hoverTower: Tower | null = null;
  private time = 0;
  private statTick = 0;

  constructor(canvas: HTMLCanvasElement, field: Field, account: number, hooks: Hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.field = field;
    this.hooks = hooks;
    this.account = account;
    this.accountMax = account;
    for (const k of Object.keys(TOWER_ART) as TowerKey[]) {
      this.towerArt.set(k, bake(TOWER_ART[k], S));
    }
    for (const k of Object.keys(ENEMY_ART) as EnemyKey[]) {
      const a = ENEMY_ART[k];
      this.enemyArt.set(
        k,
        a.frames.map((ops) => bake({ w: a.w, h: a.h, pal: a.pal, ops, outline: 8 }, S))
      );
    }
    this.resize();
  }

  /* ── жизненный цикл ── */
  start() {
    this.last = performance.now();
    this.pushStats();
    this.hooks.onToast("ЗАЩИТА СЧЁТА", "Ставьте башни на крыши. Волна 1 на подходе.");
    const frame = (now: number) => {
      if (this.dead) return;
      const dt = Math.min(0.05, (now - this.last) / 1000) * this.speed;
      this.last = now;
      if (!this.paused && !this.over) this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
  }

  /** пересобрать поле (ресайз окна, сдвиг раскладки) */
  setField(f: Field) {
    const prevSlots = this.field.slots.length;
    this.field = f;
    this.statics = null;
    this.slotsLayer = null;
    this.taken.clear();
    this.drag = null;
    /* Перепривязка башен. Слоты нарезаются детерминированно, в порядке обхода
       DOM, поэтому пока набор крыш не изменился, id слота стабилен — по нему и
       переносим. Это важно для сдвига раскладки: искать слот по СТАРЫМ
       координатам башни бессмысленно, там уже другое место (или пусто). */
    const sameLayout = f.slots.length === prevSlots;
    const kept: Tower[] = [];
    for (const t of this.towers) {
      /* Сначала место, которое НАКРЫВАЕТ текущий центр башни: так она остаётся
         ровно там, где стоит, даже если набор слотов пересобрался. Дальше — id
         (он стабилен, пока крыши те же). */
      let s = slotAt(f, t.x, t.y - 1);
      if ((!s || this.taken.has(s.id)) && sameLayout) s = f.slots[t.slot.id];
      /* Совсем не нашлось (раскладка сменила размер) — берём ближайшее
         свободное: башня переедет на соседнюю клетку, но не пропадёт вместе с
         вложенными деньгами. */
      if (!s || this.taken.has(s.id)) {
        let bestD = 140 * 140;
        let best: Slot | null = null;
        for (const c of f.slots) {
          if (this.taken.has(c.id)) continue;
          const dx = c.x + c.w / 2 - t.x;
          const dy = c.y + c.h - t.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        s = best;
      }
      if (!s || this.taken.has(s.id)) continue;
      t.slot = s;
      t.x = s.x + s.w / 2;
      t.y = s.y + s.h;
      this.taken.add(s.id);
      kept.push(t);
    }
    this.towers = kept;
    // враги на исчезнувших маршрутах переезжают на ближайший уцелевший
    for (const e of this.enemies) {
      if (!f.routes.length) continue;
      e.ri = Math.min(e.ri, f.routes.length - 1);
      e.route = f.routes[e.ri];
      e.d = Math.min(e.d, e.route.len - 1);
    }
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { w, h } = this.field;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  /* ── ввод ── */
  select(k: TowerKey | null) {
    this.selected = this.selected === k ? null : k;
    this.pushStats();
  }

  move(x: number, y: number) {
    this.mouse = { x, y };
    this.hoverTower = this.towerAt(x, y);
  }

  leave() {
    this.mouse = null;
    this.hoverTower = null;
  }

  click(x: number, y: number) {
    if (this.over) return;
    const def = TOWERS.find((t) => t.key === this.selected);
    if (!def) return;
    const slot = slotAt(this.field, x, y);
    if (!slot || this.taken.has(slot.id)) return;
    const price = def.cost;
    if (this.budget < price) {
      this.hooks.onToast("НЕ ХВАТАЕТ ₽", `${def.name} стоит ${price} ₽`);
      return;
    }
    this.budget -= price;
    this.towers.push({
      def,
      slot,
      x: slot.x + slot.w / 2,
      y: slot.y + slot.h,
      paid: price,
      lvl: 0,
      st: statsOf(def, 0),
      frozen: false,
      cd: 0,
      angle: Math.PI,
      flash: 0,
      heat: 0,
    });
    this.taken.add(slot.id);
    this.hooks.sfx("build");
    this.ring(slot.x + slot.w / 2, slot.y + slot.h - 12, 34, NEON[def.key][1]);
    this.pushStats();
  }

  /** правая кнопка: снять выбор, а над построенной башней — продать её */
  rightClick(x: number, y: number) {
    const t = this.towerAt(x, y);
    if (t) {
      this.sell(t);
      return;
    }
    if (this.selected) this.select(this.selected);
  }

  private refundOf(t: Tower) {
    return Math.round(t.paid * SELL_RATE);
  }

  private sell(t: Tower) {
    this.towers = this.towers.filter((o) => o !== t);
    this.taken.delete(t.slot.id);
    if (this.panelFor === t) this.closePanel();
    const back = this.refundOf(t);
    this.budget += back;
    this.label(t.x, t.y - 26, `+${back} ₽`, "#9ff6ff");
    this.ring(t.x, t.y - 12, 30, "#9ff6ff");
    this.hooks.sfx("build");
    this.pushStats();
  }

  /* ── панель улучшения выбранной башни ── */
  private infoOf(t: Tower): TowerInfo {
    const up = t.lvl < MAX_LVL ? UPGRADES[t.def.key][t.lvl] : null;
    const cost = upgradeCost(t.def, t.lvl);
    return {
      key: t.def.key,
      name: t.def.name,
      lvl: t.lvl,
      maxLvl: MAX_LVL,
      x: t.x,
      y: t.slot.y,
      upName: up?.name ?? null,
      upDesc: up?.desc ?? null,
      upCost: cost,
      sell: this.refundOf(t),
      frozen: t.frozen,
      affordable: cost != null && this.budget >= cost,
    };
  }

  private openPanel(t: Tower) {
    this.panelFor = t;
    this.hooks.onTowerPanel(this.infoOf(t));
  }

  closePanel() {
    if (!this.panelFor) return;
    this.panelFor = null;
    this.hooks.onTowerPanel(null);
  }

  /** купить следующий уровень для башни, открытой в панели */
  upgrade() {
    const t = this.panelFor;
    if (!t || t.lvl >= MAX_LVL) return;
    const cost = upgradeCost(t.def, t.lvl)!;
    if (this.budget < cost) {
      this.hooks.onToast("НЕ ХВАТАЕТ ₽", `Улучшение стоит ${cost} ₽`);
      return;
    }
    this.budget -= cost;
    t.paid += cost;
    t.lvl++;
    t.st = statsOf(t.def, t.lvl);
    this.hooks.sfx("build");
    this.ring(t.x, t.y - 14, 40, NEON[t.def.key][1]);
    this.label(t.x, t.y - 30, `УР. ${t.lvl}`, NEON[t.def.key][2]);
    this.openPanel(t); // перерисовать панель с новым уровнем
    this.pushStats();
  }

  /** продать башню, открытую в панели */
  sellOpen() {
    if (this.panelFor) this.sell(this.panelFor);
  }

  /* ── перетаскивание башни в колоду = продажа за половину уплаченного ── */
  pointerDown(x: number, y: number): boolean {
    if (this.over) return false;
    const t = this.towerAt(x, y);
    if (!t) return false;
    this.drag = t;
    this.dragPos = { x, y };
    this.dragMoved = false;
    this.hooks.onDragSell(false, this.refundOf(t));
    return true;
  }

  pointerMove(x: number, y: number) {
    if (!this.drag) return;
    if (Math.hypot(x - this.dragPos.x, y - this.dragPos.y) > 4) this.dragMoved = true;
    this.dragPos = { x, y };
    this.hooks.onDragSell(this.overSellZone(x, y), this.refundOf(this.drag));
  }

  /** @returns true, если жест был перетаскиванием (клик подавить) */
  pointerUp(x: number, y: number): boolean {
    const t = this.drag;
    if (!t) return false;
    this.drag = null;
    this.hooks.onDragSell(false, 0);
    const moved = this.dragMoved;
    if (moved) {
      if (this.overSellZone(x, y)) this.sell(t);
      return true;
    }
    // клик без протаскивания — это запрос панели улучшения
    if (this.panelFor === t) this.closePanel();
    else this.openPanel(t);
    return true;
  }

  private overSellZone(x: number, y: number) {
    const z = this.hooks.sellZone();
    return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  }

  togglePause() {
    if (this.over) return;
    this.paused = !this.paused;
    this.pushStats();
  }

  /** переключение 1× ↔ 2× */
  toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : 1;
    this.pushStats();
  }

  /** вызвать волну раньше срока — за каждую сэкономленную секунду премия */
  callWave() {
    if (this.over || this.running) return;
    const bonus = Math.max(0, Math.round(this.gap) * EARLY_BONUS);
    if (bonus > 0) {
      this.budget += bonus;
      this.label(this.field.core.x, this.field.core.y - 30, `+${bonus} ₽`, "#b6ff3d");
    }
    this.gap = 0;
  }

  private towerAt(x: number, y: number) {
    const s = slotAt(this.field, x, y);
    return (s && this.towers.find((t) => t.slot.id === s.id)) || null;
  }

  /** Сколько врагов в следующей волне — счётчик в паузе показывает её. */
  private nextTotal() {
    const n = Math.min(WAVE_COUNT, this.wave + 1);
    return waveOf(n).spawns.reduce((sum, sp) => sum + sp.count, 0);
  }

  private pushStats() {
    this.hooks.onStats({
      budget: Math.floor(this.budget),
      account: this.account,
      accountMax: this.accountMax,
      wave: this.wave,
      waves: WAVE_COUNT,
      countdown: this.running ? -1 : Math.max(0, Math.ceil(this.gap)),
      left: this.running ? this.pending.length + this.enemies.length : this.nextTotal(),
      waveTotal: this.running ? this.waveTotal : this.nextTotal(),
      selected: this.selected,
      paused: this.paused,
      speed: this.speed,
      over: this.over,
      kills: this.kills,
      earned: Math.round(this.earned),
    });
    if (this.panelFor) this.hooks.onTowerPanel(this.infoOf(this.panelFor));
  }

  /* ═══════════ симуляция ═══════════ */
  private update(dt: number) {
    this.time += dt;
    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateShots(dt);
    this.updateFx(dt);

    this.statTick += dt;
    if (this.statTick > 0.2) {
      this.statTick = 0;
      this.pushStats();
    }
  }

  private updateWaves(dt: number) {
    if (!this.running) {
      this.gap -= dt;
      if (this.gap <= 0) this.startWave();
      return;
    }
    this.waveT += dt * 1000;
    while (this.pending.length && this.pending[0].at <= this.waveT) {
      this.spawn(this.pending.shift()!.key);
    }
    if (!this.pending.length && !this.enemies.length) this.endWave();
  }

  private startWave() {
    if (this.wave >= WAVE_COUNT) return;
    this.wave++;
    const w = waveOf(this.wave);
    this.pending = [];
    for (const s of w.spawns) {
      for (let i = 0; i < s.count; i++) {
        this.pending.push({ key: s.key, at: (s.delay ?? 0) + i * s.gap });
      }
    }
    this.pending.sort((a, b) => a.at - b.at);
    this.waveTotal = this.pending.length;
    this.waveT = 0;
    this.running = true;
    this.hooks.sfx("wave");
    this.hooks.onToast(
      w.title ? w.title : `ВОЛНА ${this.wave} / ${WAVE_COUNT}`,
      w.title ? `Волна ${this.wave} · ${w.note ?? ""}`.trim() : w.note
    );

    /* Босс обесточивает по башне на каждого себя — на всю волну. Выбираем
       случайные из ещё работающих: так игрок не может «застраховаться»
       расстановкой, но и не теряет всю оборону разом. */
    if (w.bosses > 0) {
      const live = this.towers.filter((t) => !t.frozen);
      for (let i = live.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [live[i], live[j]] = [live[j], live[i]];
      }
      const hit = live.slice(0, w.bosses);
      for (const t of hit) {
        t.frozen = true;
        this.ring(t.x, t.y - 14, 44, "#6ee7ff");
      }
      if (hit.length) {
        this.hooks.onToast(
          "ОБЕСТОЧЕНО",
          hit.length === 1
            ? `«${hit[0].def.name}» не работает до конца волны`
            : `${hit.length} башни не работают до конца волны`
        );
      }
    }
    // типы, которые игрок увидит впервые, — объявляем отдельной карточкой
    for (const s of w.spawns) {
      if (this.seen.has(s.key)) continue;
      this.seen.add(s.key);
      this.hooks.onNewEnemy(s.key);
    }
    this.pushStats();
  }

  private endWave() {
    this.running = false;
    for (const t of this.towers) t.frozen = false; // питание восстановлено
    if (this.wave >= WAVE_COUNT) {
      this.over = "win";
      this.hooks.onToast("ЗАЩИТА УДЕРЖАНА", "Счёт цел. Все волны отбиты.");
      this.pushStats();
      return;
    }
    const bonus = waveBonus(this.wave);
    this.budget += bonus;
    this.gap = WAVE_GAP;
    this.label(this.field.core.x, this.field.core.y - 34, `+${bonus} ₽`, "#b6ff3d");
    this.pushStats();
  }

  private spawn(key: EnemyKey) {
    const routes = this.field.routes;
    if (!routes.length) return;
    const ri = (Math.random() * routes.length) | 0;
    const def = ENEMIES[key];
    const hp = Math.round(def.hp * hpMul(this.wave));
    const lane = key === "block" ? 0 : rnd(-9, 9);
    this.enemies.push({
      def,
      hp,
      maxHp: hp,
      bounty: Math.round(def.bounty * bountyMul(this.wave)),
      route: routes[ri],
      ri,
      d: 0,
      lane,
      lane0: lane,
      x: routes[ri].pts[0].x,
      y: routes[ri].pts[0].y,
      face: -1,
      anim: Math.random() * 10,
      burn: 0,
      burnT: 0,
      slowT: 0,
      slowF: 0,
      zapT: 0,
      flash: 0,
    });
  }

  /** Замедление не стакается: новое попадание перезаписывает эффект, беря
      лучшее из старого и нового, а не перемножая их. */
  private applySlow(e: Enemy, factor: number, dur: number) {
    e.slowF = Math.max(e.slowF, factor);
    e.slowT = Math.max(e.slowT, dur);
  }

  private updateEnemies(dt: number) {
    const alive: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.burnT > 0) {
        e.burnT -= dt;
        this.damage(e, e.burn * dt, true);
        if (Math.random() < dt * 14) {
          this.sparks.push({
            x: e.x + rnd(-6, 6),
            y: e.y + rnd(-8, 2),
            vx: rnd(-8, 8),
            vy: rnd(-34, -14),
            t: 0,
            life: rnd(0.2, 0.45),
            color: Math.random() < 0.5 ? "#ff8a1f" : "#ffd23d",
            size: 1,
            grav: -20,
          });
        }
      }
      if (e.hp <= 0) {
        this.kill(e);
        continue;
      }
      e.flash = Math.max(0, e.flash - dt * 6);
      e.zapT = Math.max(0, e.zapT - dt);
      if (e.slowT > 0) {
        e.slowT -= dt;
        if (e.slowT <= 0) e.slowF = 0;
      }
      const speed = e.def.speed * (e.slowT > 0 ? 1 - e.slowF : 1);
      e.d += speed * dt;
      e.anim += dt * (speed / 26);
      if (e.d >= e.route.len) {
        this.leak(e);
        continue;
      }
      alive.push(e);
    }
    this.enemies = alive;

    /* ── разъезд на маршруте ──
       Раньше догнавший просто упирался в спину переднему: шустрая «Пеня»
       вставала в очередь за «Налогом» и вся её скорость пропадала. Теперь
       упираются только те, кто НЕ быстрее идущего впереди; быстрый вместо
       этого уходит на соседнюю полосу и обгоняет. Когда дорога свободна,
       полоса плавно возвращается к своей. */
    const byRoute = new Map<number, Enemy[]>();
    for (const e of this.enemies) {
      const arr = byRoute.get(e.ri);
      if (arr) arr.push(e);
      else byRoute.set(e.ri, [e]);
    }
    const passing = new Set<Enemy>();
    for (const arr of byRoute.values()) {
      arr.sort((a, b) => b.d - a.d); // впереди — первый
      for (let i = 1; i < arr.length; i++) {
        const lead = arr[i - 1];
        const me = arr[i];
        const gapWant = (me.def.scale + lead.def.scale) * 5 + 8;
        if (lead.d - me.d >= gapWant) continue;
        // разошлись по ширине улицы — друг другу не мешают
        if (Math.abs(lead.lane - me.lane) > 11) continue;
        if (me.def.speed > lead.def.speed) {
          // догоняющий быстрее — уходит вбок и обгоняет
          const dir = me.lane >= lead.lane ? 1 : -1;
          me.lane = clampLane(me.lane + dir * dt * 60);
          passing.add(me);
        } else if (me.def.speed < lead.def.speed) {
          /* Впереди кто-то быстрее — он оторвётся сам. Тормозить себя здесь
             нельзя: иначе «Налог», которого обгоняет рой «Пеней», волочился
             бы за ними и терял собственную скорость. */
          const dir = me.lane <= lead.lane ? -1 : 1;
          me.lane = clampLane(me.lane + dir * dt * 30);
          passing.add(me);
        } else {
          me.d = lead.d - gapWant; // равные по скорости — держат колонну
        }
      }
    }
    for (const e of this.enemies) {
      if (passing.has(e)) continue;
      // возврат на свою полосу после обгона
      const back = e.lane0 - e.lane;
      if (Math.abs(back) > 0.4) e.lane += Math.sign(back) * Math.min(Math.abs(back), dt * 26);
    }

    for (const e of this.enemies) {
      const p = pointAt(e.route, e.d);
      const n = normalAt(e.route, e.d);
      const nx = p.x + n.x * e.lane;
      const ny = p.y + n.y * e.lane;
      e.face = nx > e.x + 0.05 ? 1 : nx < e.x - 0.05 ? -1 : e.face;
      e.x = nx;
      e.y = ny;
    }
  }

  private damage(e: Enemy, raw: number, ignoreArmor = false) {
    const d = ignoreArmor ? raw : Math.max(raw * 0.2, raw - e.def.armor);
    e.hp -= d;
    e.flash = 1;
  }

  private kill(e: Enemy) {
    this.budget += e.bounty;
    this.kills++;
    this.earned += e.bounty;
    this.label(e.x, e.y - 14, `+${e.bounty} ₽`, "#b6ff3d");
    this.hooks.sfx("die");
    const col = ENEMY_ART[e.def.key].pal;
    for (let i = 0; i < (e.def.key === "block" ? 34 : 12); i++) {
      const a = rnd(0, TAU);
      const sp = rnd(28, 130);
      this.sparks.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        t: 0,
        life: rnd(0.25, 0.6),
        color: col[[1, 2, 5, 6][i % 4]],
        size: e.def.key === "block" ? 2 : 1,
        grav: 190,
      });
    }
    if (e.def.key === "block") {
      this.ring(e.x, e.y, 120, "#ff3a2e");
      this.hooks.sfx("boom");
    }
    this.pushStats();
  }

  private leak(e: Enemy) {
    this.account = Math.max(0, this.account - e.def.steal);
    this.hooks.onAccount(this.account);
    this.hooks.onShake();
    this.hooks.sfx("leak");
    const c = this.field.core;
    this.ring(c.x, c.y, 90, "#ff2f4d");
    this.label(c.x, c.y - 30, `−${(e.def.steal / 1000) | 0}к ₽`, "#ff6a7a");
    for (let i = 0; i < 16; i++) {
      const a = rnd(0, TAU);
      this.sparks.push({
        x: c.x,
        y: c.y,
        vx: Math.cos(a) * rnd(40, 150),
        vy: Math.sin(a) * rnd(40, 150),
        t: 0,
        life: rnd(0.25, 0.55),
        color: i % 2 ? "#ff2f4d" : "#ffd23d",
        size: 1,
        grav: 120,
      });
    }
    if (this.account <= 0) {
      this.over = "lose";
      this.hooks.onToast("СЧЁТ ОБНУЛЁН", `Продержались до волны ${this.wave}.`);
    }
    this.pushStats();
  }

  /* ── башни ── */
  private updateTowers(dt: number) {
    for (const t of this.towers) {
      t.flash = Math.max(0, t.flash - dt * 8);
      if (t.frozen) {
        t.heat = 0;
        continue; // обесточена боссом — не целится и не стреляет
      }
      t.cd -= dt;
      const target = this.pickTarget(t);
      if (target) {
        const muzzle = this.muzzle(t);
        t.angle = Math.atan2(target.y - muzzle.y, target.x - muzzle.x);
      }
      if (t.def.fire === "flame") {
        t.heat = Math.max(0, t.heat - dt * 3);
        if (target) {
          t.heat = Math.min(1, t.heat + dt * 6);
          if (t.cd <= 0) {
            t.cd = 1 / t.st.rate;
            this.flame(t);
          }
          this.flameParticles(t, dt);
        }
        continue;
      }
      if (!target || t.cd > 0) continue;
      t.cd = 1 / t.st.rate;
      t.flash = 1;
      this.fire(t, target);
    }
  }

  private pickTarget(t: Tower): Enemy | null {
    let best: Enemy | null = null;
    let bestLeft = Infinity;
    const r2 = t.st.range * t.st.range;
    const px = t.x;
    const py = t.y - 14;
    for (const e of this.enemies) {
      if (dist2(px, py, e.x, e.y) > r2) continue;
      const left = e.route.len - e.d;
      if (left < bestLeft) {
        bestLeft = left;
        best = e;
      }
    }
    return best;
  }

  /** экранная точка среза ствола (или корпуса, если ствола нет) */
  private muzzle(t: Tower): Pt {
    const b = BARREL[t.def.key];
    const art = TOWER_ART[t.def.key];
    if (!b) return { x: t.x, y: t.y - art.h * S * 0.7 };
    const px = t.x + (b.pivot[0] - art.w / 2) * S;
    const py = t.y - (art.h - b.pivot[1]) * S;
    return { x: px, y: py };
  }

  private barrelTip(t: Tower): Pt {
    const b = BARREL[t.def.key];
    const m = this.muzzle(t);
    if (!b) return m;
    const a = this.barrelAngle(t);
    return { x: m.x + Math.cos(a) * b.length * S, y: m.y + Math.sin(a) * b.length * S };
  }

  private barrelAngle(t: Tower) {
    const b = BARREL[t.def.key];
    if (b?.up) return Math.cos(t.angle) >= 0 ? -0.95 : Math.PI + 0.95;
    return t.angle;
  }

  private fire(t: Tower, target: Enemy) {
    const tip = this.barrelTip(t);
    const color = NEON[t.def.key][1];
    const st = t.st;
    switch (t.def.fire) {
      case "bullet": {
        this.damage(target, st.dmg, st.pierce);
        this.tracers.push({ x0: tip.x, y0: tip.y, x1: target.x, y1: target.y, t: 0, color });
        this.hooks.sfx("shot");
        this.spark(target.x, target.y, 4, color);
        break;
      }
      case "shell": {
        this.shots.push({
          mortar: false,
          x: tip.x,
          y: tip.y,
          sx: tip.x,
          sy: tip.y,
          tx: target.x,
          ty: target.y,
          t: 0,
          dur: Math.max(0.12, Math.hypot(target.x - tip.x, target.y - tip.y) / 620),
          dmg: st.dmg,
          splash: 0,
          color,
          target,
          slow: st.slow,
          slowRadius: st.slowRadius,
        });
        this.hooks.sfx("boom");
        this.muzzleBurst(t, tip, color);
        break;
      }
      case "mortar": {
        // навес летит в упреждённую точку: за время полёта цель уходит вперёд
        for (let i = 0; i < st.volley; i++) {
          const flight = Math.max(0.45, Math.hypot(target.x - tip.x, target.y - tip.y) / 420);
          const lead = pointAt(target.route, target.d + target.def.speed * flight);
          // второй снаряд залпа кладём рядом, иначе он бьёт в ту же точку
          const off = i === 0 ? 0 : rnd(-st.splash * 0.55, st.splash * 0.55);
          this.shots.push({
            mortar: true,
            x: tip.x,
            y: tip.y,
            sx: tip.x,
            sy: tip.y,
            tx: lead.x + off,
            ty: lead.y + (i === 0 ? 0 : rnd(-14, 14)),
            t: i === 0 ? 0 : -0.18, // залп «два-один», а не строго одновременно
            dur: flight,
            dmg: st.dmg,
            splash: st.splash || 40,
            color,
            target: null,
            slow: null,
            slowRadius: 0,
          });
        }
        this.hooks.sfx("boom");
        this.muzzleBurst(t, tip, color);
        break;
      }
      case "chain": {
        const chain: Enemy[] = [target];
        let from = target;
        while (chain.length < st.links) {
          let next: Enemy | null = null;
          let nd = 96 * 96;
          for (const e of this.enemies) {
            if (chain.includes(e)) continue;
            const d = dist2(from.x, from.y, e.x, e.y);
            if (d < nd) {
              nd = d;
              next = e;
            }
          }
          if (!next) break;
          chain.push(next);
          from = next;
        }
        let dmg = st.dmg;
        let prev: Pt = tip;
        for (const e of chain) {
          this.damage(e, dmg);
          e.zapT = 0.32; // след разряда на цели — видно всю цепочку
          this.bolts.push({ pts: jag(prev, { x: e.x, y: e.y }), t: 0, color });
          this.spark(e.x, e.y, 5, color);
          prev = { x: e.x, y: e.y };
          dmg *= chainDecay(t.lvl);
        }
        this.hooks.sfx("zap");
        break;
      }
    }
  }

  private flame(t: Tower) {
    const tip = this.barrelTip(t);
    const cone = t.st.cone;
    const r2 = t.st.range * t.st.range;
    let hit = false;
    for (const e of this.enemies) {
      if (dist2(tip.x, tip.y, e.x, e.y) > r2) continue;
      const a = Math.atan2(e.y - tip.y, e.x - tip.x);
      let da = Math.abs(a - t.angle) % TAU;
      if (da > Math.PI) da = TAU - da;
      if (da > cone) continue;
      this.damage(e, t.st.dmg);
      if (t.st.burn) {
        e.burn = t.st.burn[0];
        e.burnT = t.st.burn[1];
      }
      hit = true;
    }
    if (hit) this.hooks.sfx("flame");
  }

  private flameParticles(t: Tower, dt: number) {
    const tip = this.barrelTip(t);
    const n = Math.min(6, Math.round(dt * 150 * t.heat));
    for (let i = 0; i < n; i++) {
      const a = t.angle + rnd(-t.st.cone * 0.8, t.st.cone * 0.8);
      const sp = rnd(140, 300);
      this.flames.push({
        x: tip.x,
        y: tip.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        t: 0,
        life: rnd(0.16, 0.34) * (t.st.range / 96),
        color: "",
        size: 1,
        grav: -30,
      });
    }
  }

  private muzzleBurst(t: Tower, tip: Pt, color: string) {
    for (let i = 0; i < 7; i++) {
      const a = this.barrelAngle(t) + rnd(-0.5, 0.5);
      const sp = rnd(60, 190);
      this.sparks.push({
        x: tip.x,
        y: tip.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        t: 0,
        life: rnd(0.1, 0.24),
        color: i % 2 ? color : "#ffffff",
        size: 1,
        grav: 40,
      });
    }
  }

  private updateShots(dt: number) {
    const live: Shot[] = [];
    for (const s of this.shots) {
      s.t += dt / s.dur;
      // снаряд ведёт цель, пока она жива; погибла — долетает по последней точке
      if (s.target && s.target.hp > 0 && this.enemies.includes(s.target)) {
        s.tx = s.target.x;
        s.ty = s.target.y;
      } else {
        s.target = null;
      }
      s.x = s.sx + (s.tx - s.sx) * s.t;
      s.y = s.sy + (s.ty - s.sy) * s.t;
      if (s.t < 1) {
        live.push(s);
        continue;
      }
      if (s.splash > 0) {
        this.ring(s.tx, s.ty, s.splash, s.color);
        this.hooks.sfx("boom");
        const r2 = s.splash * s.splash;
        for (const e of this.enemies) {
          const d2 = dist2(s.tx, s.ty, e.x, e.y);
          if (d2 > r2) continue;
          this.damage(e, s.dmg * (1 - 0.45 * Math.sqrt(d2 / r2)));
        }
        for (let i = 0; i < 16; i++) {
          const a = rnd(0, TAU);
          const sp = rnd(40, 180);
          this.sparks.push({
            x: s.tx,
            y: s.ty,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            t: 0,
            life: rnd(0.2, 0.5),
            color: i % 3 ? s.color : "#ffffff",
            size: 1,
            grav: 150,
          });
        }
      } else if (s.target) {
        this.damage(s.target, s.dmg, true); // Комплаенс пробивает броню
        this.spark(s.tx, s.ty, 7, s.color);
        if (s.slow) {
          this.applySlow(s.target, s.slow[0], s.slow[1]);
          // с апгрейдом «Выемка» арест накрывает и соседей вокруг попадания
          if (s.slowRadius > 0) {
            const rr = s.slowRadius * s.slowRadius;
            for (const e of this.enemies) {
              if (e !== s.target && dist2(s.tx, s.ty, e.x, e.y) <= rr) {
                this.applySlow(e, s.slow[0], s.slow[1]);
              }
            }
            this.ring(s.tx, s.ty, s.slowRadius, "#6ee7ff");
          }
        }
      }
    }
    this.shots = live;
  }

  private updateFx(dt: number) {
    const step = (p: Spark) => {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.vx *= 1 - dt * 1.4;
      return p.t < p.life;
    };
    this.sparks = this.sparks.filter(step);
    this.flames = this.flames.filter(step);
    this.tracers = this.tracers.filter((t) => (t.t += dt) < 0.09);
    this.bolts = this.bolts.filter((b) => (b.t += dt) < 0.16);
    this.booms = this.booms.filter((b) => (b.t += dt) < 0.4);
    this.labels = this.labels.filter((l) => (l.t += dt) < 0.9);
  }

  private spark(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU);
      const sp = rnd(30, 110);
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        t: 0,
        life: rnd(0.1, 0.28),
        color: i % 2 ? color : "#ffffff",
        size: 1,
        grav: 120,
      });
    }
  }
  private ring(x: number, y: number, r: number, color: string) {
    this.booms.push({ x, y, t: 0, r, color });
  }
  private label(x: number, y: number, text: string, color: string) {
    this.labels.push({ x, y, t: 0, text, color });
  }

  /* ═══════════ отрисовка ═══════════ */
  private draw() {
    const ctx = this.ctx;
    const { w, h } = this.field;
    ctx.clearRect(0, 0, w, h);
    if (!this.statics) this.bakeStatics();
    ctx.drawImage(this.statics!, 0, 0, w, h);
    this.drawRouteFlow();
    this.drawCore();
    if (this.selected) {
      if (!this.slotsLayer) this.bakeSlots();
      ctx.globalAlpha = 0.55 + Math.sin(this.time * 4) * 0.12;
      ctx.drawImage(this.slotsLayer!, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    this.drawFlames();
    this.drawTowers();
    this.drawEnemies();
    this.drawShots();
    this.drawFx();
    this.drawGhost();
    this.drawHoverRange();
    this.drawDrag();
  }

  /** статика: сетка улиц, неоновые обводки зданий, светящиеся маршруты */
  private bakeStatics() {
    const { w, h, rects, routes, cell, cols, rows, blocked } = this.field;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement("canvas");
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // сетка по улицам — «асфальт» киберпанк-квартала
    g.fillStyle = "rgba(89, 226, 255, 0.10)";
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        if (blocked[ry * cols + rx]) continue;
        g.fillRect(rx * cell + cell / 2 - 1, ry * cell + cell / 2 - 1, 1, 1);
      }
    }

    /* Обводим ТОЛЬКО крыши — то, на что реально можно ставить башни. Раньше
       рамку получало каждое здание, и это читалось как мусор: у текстовых
       блоков рамка не совпадает ни с чем видимым, а у наклонённого баннера
       getBoundingClientRect отдаёт габаритный прямоугольник, который заметно
       больше самой карточки — рамка выглядела съехавшей. */
    for (const r of rects) {
      if (!r.roof) continue;
      const rad = Math.min(r.r, 18);
      g.strokeStyle = "rgba(76, 224, 255, 0.34)";
      g.lineWidth = 1;
      roundRect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
      g.stroke();
      g.strokeStyle = "rgba(255, 47, 184, 0.5)";
      g.lineWidth = 2;
      const t = Math.min(14, r.w / 3, r.h / 3);
      corner(g, r.x, r.y, t, 1, 1, rad);
      corner(g, r.x + r.w, r.y, t, -1, 1, rad);
      corner(g, r.x, r.y + r.h, t, 1, -1, rad);
      corner(g, r.x + r.w, r.y + r.h, t, -1, -1, rad);
    }

    // маршруты: широкий тусклый след + светлая жила по центру
    for (const rt of routes) {
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = "rgba(255, 47, 184, 0.1)";
      g.lineWidth = 24;
      poly(g, rt.pts);
      g.stroke();
      g.strokeStyle = "rgba(89, 226, 255, 0.22)";
      g.lineWidth = 2;
      g.setLineDash([9, 7]);
      poly(g, rt.pts);
      g.stroke();
      g.setLineDash([]);
    }
    this.statics = c;
  }

  /** подсветка свободных мест — только пока выбрана башня */
  private bakeSlots() {
    const f = this.field;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement("canvas");
    c.width = Math.round(f.w * dpr);
    c.height = Math.round(f.h * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.strokeStyle = "rgba(126, 255, 176, 0.5)";
    g.fillStyle = "rgba(126, 255, 176, 0.08)";
    g.lineWidth = 1;
    for (const s of f.slots) {
      if (this.taken.has(s.id)) continue;
      g.fillRect(s.x + 2, s.y + 2, s.w - 4, s.h - 4);
      // только уголки: сплошная рамка на каждом месте замусорила бы кадр
      const t = 5;
      g.beginPath();
      g.moveTo(s.x + 2, s.y + 2 + t);
      g.lineTo(s.x + 2, s.y + 2);
      g.lineTo(s.x + 2 + t, s.y + 2);
      g.moveTo(s.x + s.w - 2 - t, s.y + s.h - 2);
      g.lineTo(s.x + s.w - 2, s.y + s.h - 2);
      g.lineTo(s.x + s.w - 2, s.y + s.h - 2 - t);
      g.stroke();
    }
    this.slotsLayer = c;
  }

  /** искры, бегущие по маршруту к ядру — видно, откуда придут */
  private drawRouteFlow() {
    const ctx = this.ctx;
    for (const rt of this.field.routes) {
      const n = Math.max(2, Math.round(rt.len / 190));
      for (let i = 0; i < n; i++) {
        const d = ((this.time * 90 + (i * rt.len) / n) % rt.len);
        const p = pointAt(rt, rt.len - d);
        pxDot(ctx, p.x, p.y, 1, "rgba(89, 226, 255, 0.5)", PX);
      }
    }
  }

  private drawCore() {
    const ctx = this.ctx;
    const { x, y } = this.field.core;
    const frac = this.accountMax ? this.account / this.accountMax : 0;
    const pulse = 0.5 + Math.sin(this.time * 3) * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = `rgba(89, 226, 255, ${0.25 + pulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 15 + pulse * 3, 0, TAU);
    ctx.stroke();
    // дуга целостности: сколько от счёта осталось
    ctx.strokeStyle = frac > 0.35 ? "#7effb0" : "#ff5a6a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 21, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
    ctx.stroke();
    ctx.rotate(this.time * 0.7);
    ctx.strokeStyle = "rgba(255, 47, 184, 0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const px = Math.cos(a) * 9;
      const py = Math.sin(a) * 9;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawTowers() {
    const ctx = this.ctx;
    for (const t of this.towers) {
      const baked = this.towerArt.get(t.def.key)!;
      const b = BARREL[t.def.key];
      const neon = NEON[t.def.key];

      // ствол рисуем ПОД корпусом: срез торчит из казённика, а не поверх него
      if (b) {
        const m = this.muzzle(t);
        const a = this.barrelAngle(t);
        const ex = m.x + Math.cos(a) * b.length * S;
        const ey = m.y + Math.sin(a) * b.length * S;
        pxLine(ctx, m.x, m.y, ex, ey, b.thick, "#262d4c", PX);
        pxLine(
          ctx,
          m.x,
          m.y,
          ex - Math.cos(a) * PX,
          ey - Math.sin(a) * PX,
          Math.max(1, b.thick - 2),
          "#3b4570",
          PX
        );
        pxDot(ctx, ex, ey, 1, t.flash > 0.4 ? "#ffffff" : neon[0], PX);
        if (t.flash > 0.3) {
          pxDot(ctx, ex + Math.cos(a) * 4, ey + Math.sin(a) * 4, 3, neon[1], PX);
          pxDot(ctx, ex + Math.cos(a) * 4, ey + Math.sin(a) * 4, 1, "#ffffff", PX);
        }
      }

      /* ── знаки уровня ──
         Прокачанную башню надо узнавать с одного взгляда, поэтому уровень
         показан тремя способами сразу: светящееся кольцо под подошвой,
         шевроны над макушкой и (на втором уровне) ореол вокруг корпуса. */
      if (t.lvl > 0) {
        const pulse = 0.5 + Math.sin(this.time * 3 + t.slot.id) * 0.5;
        ctx.save();
        ctx.strokeStyle = neon[1];
        ctx.globalAlpha = 0.35 + t.lvl * 0.18 + pulse * 0.12;
        ctx.lineWidth = t.lvl;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y - 2, 15 + t.lvl * 2, 5 + t.lvl, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      if (t.lvl >= 2) {
        const g = ctx.createRadialGradient(t.x, t.y - 20, 2, t.x, t.y - 20, 30);
        g.addColorStop(0, neon[0]);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.4 + Math.sin(this.time * 2.4 + t.slot.id) * 0.12;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(t.x, t.y - 20, 30, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      const dx = Math.round(t.x - baked.w / 2);
      const dy = Math.round(t.y - baked.h + baked.pad);
      ctx.drawImage(baked.c, dx, dy);

      // шевроны над башней: по одному за уровень, тем же «крупным пикселем»
      for (let l = 0; l < t.lvl; l++) {
        const cy = dy - 5 - l * 5;
        pxLine(ctx, t.x - 4, cy + 3, t.x, cy, 1, neon[2], PX);
        pxLine(ctx, t.x, cy, t.x + 4, cy + 3, 1, neon[2], PX);
      }

      // отметка «своего» места: неоновая подошва в цвет башни
      ctx.strokeStyle = t === this.panelFor ? "#ffffff" : neon[0];
      ctx.globalAlpha = t === this.drag || t === this.panelFor ? 0.9 : 0.5;
      ctx.lineWidth = 1;
      ctx.strokeRect(t.slot.x + 1.5, t.slot.y + 1.5, t.slot.w - 3, t.slot.h - 3);
      ctx.globalAlpha = 1;

      /* обесточенная боссом — иней поверх, мигающая рамка и косой крест:
         должно быть видно с одного взгляда, какая башня выпала */
      if (t.frozen) {
        const p = 0.55 + Math.sin(this.time * 5) * 0.25;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.42;
        ctx.drawImage(baked.c, dx, dy);
        ctx.restore();
        ctx.strokeStyle = `rgba(110, 231, 255, ${p})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(t.slot.x + 1, t.slot.y + 1, t.slot.w - 2, t.slot.h - 2);
        ctx.beginPath();
        ctx.moveTo(t.slot.x + 8, t.slot.y + 8);
        ctx.lineTo(t.slot.x + t.slot.w - 8, t.slot.y + t.slot.h - 8);
        ctx.moveTo(t.slot.x + t.slot.w - 8, t.slot.y + 8);
        ctx.lineTo(t.slot.x + 8, t.slot.y + t.slot.h - 8);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = this.time * 0.8 + (i * TAU) / 4;
          pxDot(ctx, t.x + Math.cos(a) * 15, t.y - 16 + Math.sin(a) * 9, 1, "#bdf3ff", PX);
        }
      }
    }
  }

  /** башня «в руке» — летит за курсором, пока её тащат в колоду */
  private drawDrag() {
    const t = this.drag;
    if (!t) return;
    const ctx = this.ctx;
    const baked = this.towerArt.get(t.def.key)!;
    const over = this.overSellZone(this.dragPos.x, this.dragPos.y);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(
      baked.c,
      Math.round(this.dragPos.x - baked.w / 2),
      Math.round(this.dragPos.y - baked.h + baked.pad)
    );
    ctx.globalAlpha = 1;
    ctx.font = "700 11px 'Alfa Interface Sans', system-ui, sans-serif";
    ctx.textAlign = "center";
    const cap = over ? `ПРОДАТЬ +${this.refundOf(t)} ₽` : "в колоду — продать";
    ctx.fillStyle = "rgba(4, 6, 14, 0.8)";
    ctx.fillText(cap, this.dragPos.x + 1, this.dragPos.y + 15);
    ctx.fillStyle = over ? "#7effb0" : "#9ff6ff";
    ctx.fillText(cap, this.dragPos.x, this.dragPos.y + 14);
    ctx.textAlign = "left";
    ctx.restore();
  }

  private drawEnemies() {
    const ctx = this.ctx;
    for (const e of this.enemies) {
      const frames = this.enemyArt.get(e.def.key)!;
      const f = frames[((e.anim | 0) % frames.length + frames.length) % frames.length];
      // тень-подложка: без неё спрайт «висит» над дашбордом
      ctx.fillStyle = "rgba(4, 6, 14, 0.42)";
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + f.h * 0.28, f.w * 0.3, f.w * 0.13, 0, 0, TAU);
      ctx.fill();

      const dx = Math.round(e.x - f.w / 2);
      const dy = Math.round(e.y - f.h * 0.62);
      ctx.save();
      if (e.face > 0) {
        ctx.translate(Math.round(e.x) * 2, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(f.c, dx, dy);
      ctx.restore();

      if (e.flash > 0.05) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = e.flash * 0.55;
        ctx.drawImage(f.c, dx, dy);
        ctx.restore();
      }

      /* ── метки состояний. Перекрашивать спрайт нечем (канвас не умеет
         дешёвый tint), поэтому статусы читаются накладками: лёд — иней и
         дуга под ногами, горение — угли и подсветка, разряд — белые искры. */
      if (e.slowT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.5 + Math.sin(this.time * 9) * 0.12;
        ctx.drawImage(f.c, dx, dy);
        ctx.restore();
        ctx.strokeStyle = "rgba(110, 231, 255, 0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y + f.h * 0.28, f.w * 0.34, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = this.time * 1.4 + (i * TAU) / 3;
          pxDot(ctx, e.x + Math.cos(a) * 12, e.y - 6 + Math.sin(a) * 5, 1, "#bdf3ff", PX);
        }
      }
      if (e.burnT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.32 + Math.sin(this.time * 22 + e.anim) * 0.14;
        ctx.drawImage(f.c, dx, dy);
        ctx.restore();
        for (let i = 0; i < 2; i++) {
          const a = this.time * 6 + i * 3.1;
          pxDot(
            ctx,
            e.x + Math.sin(a) * 6,
            e.y - 10 - ((this.time * 34 + i * 9) % 14),
            1,
            i % 2 ? "#ffd23d" : "#ff8a1f",
            PX
          );
        }
      }
      if (e.zapT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = e.zapT / 0.32;
        for (let i = 0; i < 3; i++) {
          const a = rnd(0, TAU);
          const r0 = f.w * 0.2;
          pxLine(
            ctx,
            e.x + Math.cos(a) * r0,
            e.y - 4 + Math.sin(a) * r0,
            e.x + Math.cos(a) * (r0 + 7),
            e.y - 4 + Math.sin(a) * (r0 + 7),
            1,
            i % 2 ? "#ffffff" : "#ff9de0",
            PX
          );
        }
        ctx.restore();
      }

      // полоска HP — только у раненых, иначе кадр рябит
      if (e.hp < e.maxHp) {
        const bw = Math.max(16, f.w * 0.7);
        const bx = Math.round(e.x - bw / 2);
        const by = dy - 5;
        ctx.fillStyle = "rgba(6, 8, 18, 0.8)";
        ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
        const frac = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle =
          e.slowT > 0 ? "#6ee7ff" : e.burnT > 0 ? "#ff8a1f" : frac > 0.45 ? "#7effb0" : "#ff5a6a";
        ctx.fillRect(bx, by, Math.round(bw * frac), 2);
      }
    }
  }

  private drawShots() {
    const ctx = this.ctx;
    for (const s of this.shots) {
      // мина летит по дуге: сама точка идёт по прямой, вверх её поднимает только
      // отрисовка — так упреждение и радиус осколков считаются в плоскости поля
      const y = s.mortar ? s.y - Math.sin(Math.PI * s.t) * (46 + s.dur * 40) : s.y;
      pxDot(ctx, s.x, y, s.mortar ? 3 : 2, s.color, PX);
      pxDot(ctx, s.x, y, 1, "#ffffff", PX);
      if (s.mortar) {
        pxDot(ctx, s.x, s.y, 1, "rgba(120,140,190,0.35)", PX); // тень на земле
      }
    }
  }

  private drawFlames() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.flames) {
      const k = p.t / p.life;
      // язык пламени остывает от белого к дыму
      const color =
        k < 0.22 ? "#fff3c4" : k < 0.45 ? "#ffd23d" : k < 0.72 ? "#ff8a1f" : "#a8360f";
      pxDot(ctx, p.x, p.y, k < 0.5 ? 2 : 3, color, PX);
    }
    ctx.restore();
  }

  private drawFx() {
    const ctx = this.ctx;
    for (const t of this.tracers) {
      const a = 1 - t.t / 0.09;
      ctx.globalAlpha = a;
      pxLine(ctx, t.x0, t.y0, t.x1, t.y1, 1, t.color, PX);
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.bolts) {
      ctx.globalAlpha = 1 - b.t / 0.16;
      for (let i = 1; i < b.pts.length; i++) {
        pxLine(ctx, b.pts[i - 1].x, b.pts[i - 1].y, b.pts[i].x, b.pts[i].y, 1, b.color, PX);
      }
      ctx.globalAlpha = (1 - b.t / 0.16) * 0.6;
      for (let i = 1; i < b.pts.length; i++) {
        pxLine(ctx, b.pts[i - 1].x, b.pts[i - 1].y, b.pts[i].x, b.pts[i].y, 3, b.color, PX);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    for (const b of this.booms) {
      const k = b.t / 0.4;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (0.3 + k * 0.9), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const p of this.sparks) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k;
      pxDot(ctx, p.x, p.y, p.size, p.color, PX);
      ctx.globalAlpha = 1;
    }

    ctx.font = "700 11px 'Alfa Interface Sans', system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const l of this.labels) {
      const k = l.t / 0.9;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = "rgba(4, 6, 14, 0.75)";
      ctx.fillText(l.text, l.x + 1, l.y - k * 22 + 1);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, l.x, l.y - k * 22);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";
  }

  /** призрак выбранной башни под курсором + радиус поражения */
  private drawGhost() {
    if (!this.selected || !this.mouse || this.over || this.drag) return;
    const def = TOWERS.find((t) => t.key === this.selected)!;
    const slot = slotAt(this.field, this.mouse.x, this.mouse.y);
    if (!slot) return; // курсор не над крышей — призрак не показываем
    const ok = !this.taken.has(slot.id) && this.budget >= def.cost;
    const ctx = this.ctx;
    const x = slot.x + slot.w / 2;
    const y = slot.y + slot.h;

    ctx.save();
    ctx.strokeStyle = ok ? "#7effb0" : "#ff5a6a";
    ctx.fillStyle = ok ? "rgba(126,255,176,0.14)" : "rgba(255,90,106,0.14)";
    ctx.lineWidth = 2;
    ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
    ctx.strokeRect(slot.x + 1, slot.y + 1, slot.w - 2, slot.h - 2);

    /* Заливку радиуса держим еле заметной: у «Аудита» круг 250px, и на 0.16
       он превращался в салатовое пятно на пол-дашборда. Читается пунктир. */
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = NEON[def.key][1];
    ctx.beginPath();
    ctx.arc(x, y - 14, def.range, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = NEON[def.key][1];
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(x, y - 14, def.range, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    const baked = this.towerArt.get(def.key)!;
    ctx.globalAlpha = ok ? 0.85 : 0.4;
    ctx.drawImage(baked.c, Math.round(x - baked.w / 2), Math.round(y - baked.h + baked.pad));
    ctx.restore();
  }

  private drawHoverRange() {
    const t = this.panelFor ?? this.hoverTower;
    if (!t || this.selected) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = t === this.panelFor ? 0.75 : 0.5;
    ctx.strokeStyle = NEON[t.def.key][1];
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(t.x, t.y - 14, t.st.range, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/* ── мелкие геометрические помощники ── */
function poly(g: CanvasRenderingContext2D, pts: Pt[]) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/** уголок рамки: две короткие риски от угла вдоль сторон */
function corner(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  sx: number,
  sy: number,
  r: number
) {
  const o = r * 0.3;
  g.beginPath();
  g.moveTo(x + sx * o, y + sy * (o + t));
  g.lineTo(x + sx * o, y + sy * o);
  g.lineTo(x + sx * (o + t), y + sy * o);
  g.stroke();
}

/** ломаная молнии между двумя точками */
function jag(a: Pt, b: Pt): Pt[] {
  const steps = 5;
  const out: Pt[] = [a];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const off = rnd(-9, 9) * Math.sin(Math.PI * t);
    out.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  out.push(b);
  return out;
}
