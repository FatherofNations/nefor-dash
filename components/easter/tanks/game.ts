/* ═══ Движок «Броневика» ═══
   Классический цикл: спавн → движение → стрельба → разрушение карты → бонусы →
   защита базы → зачистка волны → следующая. Ничего сверх этого: игра должна
   оставаться быстрой и читаемой, а не превращаться в стратегию.

   Местность печётся в два offscreen-слоя — земля под танками и кроны леса над
   ними; при попадании перерисовывается одна клетка, а не весь слой. */

import { Baked, bake, pxDot } from "../td/pixel";
import {
  BASE_ART, BASE_DEAD_ART, POWER_ART, PLAYER_UPGRADE, POWER_SCORE,
  PowerKind, TANK_ART, TANK_FLASH, TankKind,
} from "./art";
import {
  Arena, BRICK, COLLAR, CONCRETE, EMPTY, FOREST, FULL, ICE, WATER, TL, TR, BL, BR,
  damage, drivable, setBaseWall, shootable, slippery,
} from "./arena";

/* Всё игровое крупнее вёрстки в полтора раза: клетка 24, танк 48, спрайты
   пекутся с шагом 3. Скорости подняты тем же множителем, иначе на большой
   карте всё поехало бы медленнее. */
const PX = 3;
const S = 3;
const TANK = 48;
const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export interface Stats {
  lives: number;
  level: number;
  levels: number;
  left: number;
  score: number;
  weapon: number;
  shield: boolean;
  freeze: boolean;
  base: boolean;
  paused: boolean;
  over: null | "win" | "lose";
}

export interface Hooks {
  onStats: (s: Stats) => void;
  onToast: (title: string, sub?: string) => void;
  onShake: () => void;
  sfx: (n: string) => void;
}

interface Tank {
  kind: TankKind;
  x: number; y: number; dir: number;
  speed: number; cd: number; hp: number; maxHp: number;
  enemy: boolean;
  /** сек неуязвимости (шлем или появление) */
  shield: number;
  /** сек заморозки (часы) */
  freeze: number;
  /** остаток инерции на льду */
  slide: number;
  think: number;
  power: number;
  /** мигает бонусом — с него падает приз */
  bonus: boolean;
}

interface Bullet {
  x: number; y: number; dir: number; enemy: boolean;
  speed: number; power: number; dead: boolean;
}
interface Power { kind: PowerKind; x: number; y: number; t: number; life: number }
interface Boom { x: number; y: number; t: number; kind: "hit" | "tank" | "heavy" }
interface Mark { x: number; y: number; t: number }
/** Точка спавна отмигала — через `t` секунд оттуда выедет танк. */
interface Hatch { x: number; y: number; t: number }
interface Crumb { x: number; y: number; vx: number; vy: number; t: number }

const SPEC: Record<TankKind, {
  speed: number; hp: number; cd: number; bullet: number; power: number; score: number;
}> = {
  player: { speed: 156, hp: 1, cd: 0.40, bullet: 600, power: 1, score: 0 },
  grunt:  { speed: 78,  hp: 1, cd: 1.5,  bullet: 435, power: 1, score: 100 },
  swift:  { speed: 162, hp: 1, cd: 1.3,  bullet: 510, power: 1, score: 200 },
  armor:  { speed: 57,  hp: 4, cd: 1.4,  bullet: 450, power: 1, score: 300 },
  heavy:  { speed: 66,  hp: 2, cd: 0.9,  bullet: 540, power: 2, score: 400 },
};

export const LEVELS = 8;
const MAX_FIELD = 4;
/** Во сколько шагов волны обходится кирпичная клетка: обойти дешевле, чем ломать. */
const WALL_COST = 12;

/** Состав волны: чем дальше, тем больше и тяжелее. */
function wavePack(level: number): TankKind[] {
  const out: TankKind[] = [];
  const total = 8 + level * 2;
  for (let i = 0; i < total; i++) {
    const r = Math.random();
    if (level >= 4 && r < 0.10 + level * 0.02) out.push("heavy");
    else if (level >= 3 && r < 0.32) out.push("armor");
    else if (level >= 2 && r < 0.55) out.push("swift");
    else out.push("grunt");
  }
  // ровно три носителя бонуса на волну — классическая раскладка
  return out;
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private dead = false;

  private a: Arena;
  private hooks: Hooks;
  private canvas: HTMLCanvasElement;

  private tankArt = new Map<string, Baked>();
  private powerArt = new Map<PowerKind, Baked>();
  private baseArt!: Baked;
  private baseDead!: Baked;
  private ground: HTMLCanvasElement | null = null;
  private canopy: HTMLCanvasElement | null = null;

  private player: Tank | null = null;
  private enemies: Tank[] = [];
  private bullets: Bullet[] = [];
  private powers: Power[] = [];
  private booms: Boom[] = [];
  private marks: Mark[] = [];
  private hatching: Hatch[] = [];
  private crumbs: Crumb[] = [];

  private queue: TankKind[] = [];
  private bonusIdx = new Set<number>();
  private level = 1;
  private lives = 3;
  private score = 0;
  private weapon = 1;
  private spawnCd = 0;
  private respawn = 0;
  private freezeT = 0;
  private shovelT = 0;
  private flow: Int32Array | null = null;
  private flowDirty = true;
  private flowCd = 0;
  private powerCd = rnd(12, 20);
  private paused = false;
  private hidden = false;
  private over: null | "win" | "lose" = null;
  private time = 0;
  private tick = 0;
  private keys = new Set<string>();

  constructor(canvas: HTMLCanvasElement, arena: Arena, hooks: Hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.a = arena;
    this.hooks = hooks;
    for (const k of Object.keys(TANK_ART) as TankKind[]) {
      this.tankArt.set(k, bake(TANK_ART[k], S));
      this.tankArt.set(`${k}!`, bake(TANK_FLASH[k], S));
    }
    // ствол игрока крепнет со звёздами — печём четыре варианта
    for (let lv = 0; lv < PLAYER_UPGRADE.length; lv++) {
      const base = TANK_ART.player;
      this.tankArt.set(
        `player${lv}`,
        bake({ ...base, ops: [...base.ops, ...PLAYER_UPGRADE[lv]] }, S)
      );
    }
    for (const k of Object.keys(POWER_ART) as PowerKind[]) {
      this.powerArt.set(k, bake(POWER_ART[k], S));
    }
    this.baseArt = bake(BASE_ART, S);
    this.baseDead = bake(BASE_DEAD_ART, S);
    this.resize();
    this.startLevel(1);
  }

  start() {
    this.last = performance.now();
    this.pushStats();
    const frame = (now: number) => {
      if (this.dead) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused && !this.hidden && !this.over) this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  destroy() { this.dead = true; cancelAnimationFrame(this.raf); }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.a.w * dpr);
    this.canvas.height = Math.round(this.a.h * dpr);
    this.canvas.style.width = `${this.a.w}px`;
    this.canvas.style.height = `${this.a.h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ground = null;
    this.canopy = null;
  }

  setArena(a: Arena) { this.a = a; this.resize(); this.buildFlow(); this.flowDirty = false; }
  setHidden(v: boolean) {
    if (this.hidden === v) return;
    this.hidden = v;
    if (!v) this.last = performance.now();
  }
  togglePause() { if (!this.over) { this.paused = !this.paused; this.pushStats(); } }
  key(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  restart() {
    this.enemies = []; this.bullets = []; this.powers = [];
    this.booms = []; this.marks = []; this.crumbs = []; this.hatching = [];
    this.lives = 3; this.score = 0; this.weapon = 1;
    this.over = null; this.freezeT = 0; this.shovelT = 0;
    this.a.baseAlive = true;
    setBaseWall(this.a, BRICK);
    this.flowDirty = true;
    this.startLevel(1);
    this.pushStats();
  }

  private startLevel(n: number) {
    this.level = n;
    this.queue = wavePack(n);
    // трое случайных из волны приносят бонус
    this.bonusIdx = new Set<number>();
    while (this.bonusIdx.size < Math.min(3, this.queue.length)) {
      this.bonusIdx.add((Math.random() * this.queue.length) | 0);
    }
    this.spawnCd = 1;
    this.spawnPlayer();
    this.hooks.onToast(`ВОЛНА ${n}`, `Танков: ${this.queue.length}`);
  }

  private spawnPlayer() {
    const i = this.a.playerSpawn;
    this.player = {
      kind: "player",
      x: (i % this.a.cols) * this.a.cell,
      y: ((i / this.a.cols) | 0) * this.a.cell,
      dir: 0, speed: SPEC.player.speed, cd: 0, hp: 1, maxHp: 1,
      enemy: false, shield: 2.4, freeze: 0, slide: 0, think: 0,
      power: this.weapon, bonus: false,
    };
  }

  private pushStats() {
    this.hooks.onStats({
      lives: this.lives, level: this.level, levels: LEVELS,
      left: this.queue.length + this.enemies.length,
      score: this.score, weapon: this.weapon,
      shield: !!this.player && this.player.shield > 0,
      freeze: this.freezeT > 0,
      base: this.a.baseAlive,
      paused: this.paused, over: this.over,
    });
  }

  /* ═══ симуляция ═══ */
  private update(dt: number) {
    this.time += dt;
    if (this.freezeT > 0) this.freezeT -= dt;
    if (this.flowDirty) {
      this.flowCd -= dt;
      if (this.flowCd <= 0) { this.buildFlow(); this.flowDirty = false; this.flowCd = 0.3; }
    }
    if (this.shovelT > 0) {
      this.shovelT -= dt;
      if (this.shovelT <= 0) { setBaseWall(this.a, BRICK); this.repaintCollar(); }
    }

    this.updateSpawns(dt);
    this.updateHatching(dt);
    if (!this.player && this.respawn > 0) {
      this.respawn -= dt;
      if (this.respawn <= 0) this.spawnPlayer();
    }
    this.movePlayer(dt);
    for (const e of this.enemies) this.moveEnemy(e, dt);
    this.moveBullets(dt);
    this.updatePowers(dt);

    this.booms = this.booms.filter((b) => (b.t += dt) < (b.kind === "hit" ? 0.22 : 0.6));
    this.marks = this.marks.filter((m) => (m.t += dt) < 1);
    this.crumbs = this.crumbs.filter((c) => {
      c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 260 * dt;
      return c.t < 0.5;
    });

    if (!this.queue.length && !this.enemies.length && !this.over) {
      if (this.level >= LEVELS) {
        this.over = "win";
        this.hooks.onToast("БАЗА УДЕРЖАНА", `Все волны отбиты. Очки: ${this.score}`);
      } else this.startLevel(this.level + 1);
      this.pushStats();
    }

    this.tick += dt;
    if (this.tick > 0.2) { this.tick = 0; this.pushStats(); }
  }

  /** Точка спавна сначала мигает, и только потом из неё выезжает танк. */
  private updateSpawns(dt: number) {
    if (!this.queue.length || this.enemies.length >= MAX_FIELD) return;
    this.spawnCd -= dt;
    if (this.spawnCd > 0) return;
    // интервал сокращается с волнами — давление на базу растёт
    this.spawnCd = Math.max(1.1, 3 - this.level * 0.2);
    const spots = this.a.enemySpawns;
    const i = spots[(Math.random() * spots.length) | 0];
    const x = (i % this.a.cols) * this.a.cell;
    const y = ((i / this.a.cols) | 0) * this.a.cell;
    this.marks.push({ x, y, t: 0 });
    /* Отложенный выезд считаем в игровом времени, а НЕ setTimeout: таймер
       тикал бы и на паузе, и в свёрнутой вкладке — танк вылезал бы, пока игра
       стоит. */
    this.hatching.push({ x, y, t: 0.9 });
    this.hooks.sfx("warn");
  }

  private updateHatching(dt: number) {
    const wait: Hatch[] = [];
    for (const h of this.hatching) {
      h.t -= dt;
      if (h.t > 0) { wait.push(h); continue; }
      this.hatch(h.x, h.y);
    }
    this.hatching = wait;
  }

  private hatch(x: number, y: number) {
    if (!this.queue.length) return;
    const idx = this.queue.length - 1;
    const kind = this.queue.pop()!;
    const sp = SPEC[kind];
    this.enemies.push({
      kind, x, y, dir: 2, speed: sp.speed, cd: rnd(0.5, 1.4),
      hp: sp.hp, maxHp: sp.hp, enemy: true, shield: 0, freeze: 0,
      slide: 0, think: 0, power: sp.power, bonus: this.bonusIdx.has(idx),
    });
    this.hooks.sfx("spawn");
    this.pushStats();
  }

  private fits(x: number, y: number): boolean {
    const c = this.a.cell;
    if (x < 0 || y < 0 || x + TANK > this.a.w || y + TANK > this.a.h) return false;
    const c0 = Math.floor(x / c), c1 = Math.floor((x + TANK - 1) / c);
    const r0 = Math.floor(y / c), r1 = Math.floor((y + TANK - 1) / c);
    for (let r = r0; r <= r1; r++) {
      for (let cc = c0; cc <= c1; cc++) if (!drivable(this.a, cc, r)) return false;
    }
    // база — тоже препятствие
    if (this.a.baseAlive) {
      const bc = this.a.base % this.a.cols, br = (this.a.base / this.a.cols) | 0;
      const bx = bc * c, by = br * c;
      if (x < bx + c * 2 && x + TANK > bx && y < by + c * 2 && y + TANK > by) return false;
    }
    return true;
  }

  private busy(t: Tank, x: number, y: number): boolean {
    const all = this.player ? [this.player, ...this.enemies] : this.enemies;
    for (const o of all) {
      if (o === t) continue;
      if (Math.abs(o.x - x) < TANK - 2 && Math.abs(o.y - y) < TANK - 2) return true;
    }
    return false;
  }

  private onIce(t: Tank) {
    const c = this.a.cell;
    return slippery(this.a, Math.floor((t.x + TANK / 2) / c), Math.floor((t.y + TANK / 2) / c));
  }

  private glide(v: number, grid: number, dist: number) {
    const target = Math.round(v / grid) * grid;
    if (Math.abs(target - v) < 0.01) return target;
    return v + Math.sign(target - v) * Math.min(Math.abs(target - v), dist);
  }

  /** Шаг вперёд с прилипанием поперечной оси к半-клетке. */
  private step(t: Tank, dt: number): boolean {
    const dist = t.speed * dt;
    let nx = t.x + DX[t.dir] * dist;
    let ny = t.y + DY[t.dir] * dist;
    const half = this.a.cell / 2;
    if (DX[t.dir]) ny = this.glide(t.y, half, dist);
    else nx = this.glide(t.x, half, dist);
    if (!this.fits(nx, ny) || this.busy(t, nx, ny)) return false;
    t.x = nx; t.y = ny;
    return true;
  }

  private movePlayer(dt: number) {
    const p = this.player;
    if (!p) return;
    if (p.shield > 0) p.shield -= dt;
    p.cd -= dt;
    p.power = this.weapon;
    const k = this.keys;
    let dir = -1;
    if (k.has("ArrowUp") || k.has("KeyW")) dir = 0;
    else if (k.has("ArrowRight") || k.has("KeyD")) dir = 1;
    else if (k.has("ArrowDown") || k.has("KeyS")) dir = 2;
    else if (k.has("ArrowLeft") || k.has("KeyA")) dir = 3;

    const ice = this.onIce(p);
    if (dir >= 0) {
      p.dir = dir;
      this.step(p, dt);
      if (ice) p.slide = 0.45; // на льду занос продолжается после отпускания
    } else if (ice && p.slide > 0) {
      p.slide -= dt;
      if (!this.step(p, dt)) p.slide = 0;
    } else {
      p.slide = 0;
    }
    if ((k.has("Space") || k.has("KeyJ")) && p.cd <= 0) {
      p.cd = SPEC.player.cd / (this.weapon >= 2 ? 1.35 : 1);
      this.fire(p);
    }
  }

  /* ── волна до базы ──
     Раньше враг выбирал сторону жадно: «к базе, если пускают». На карте со
     стенами это и выглядит как бессмысленное катание — упёрся, отскочил,
     поехал вбок. Теперь один раз на всех считаем расстояние до базы по сетке
     стоянок 2×2. Кирпич в волне проходим, но дорогой: обойти дешевле, а если
     обхода нет — танк идёт напролом и прострелит стену. Вода и бетон
     непроходимы совсем. */
  private buildFlow() {
    const a = this.a;
    const { cols, rows } = a;
    const n = cols * rows;
    const dist = new Int32Array(n).fill(-1);
    const costAt = (c: number, r: number) => {
      if (c < 0 || r < 0 || c + 1 >= cols || r + 1 >= rows) return -1;
      let cost = 1;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = (r + dy) * cols + c + dx;
          const k = a.kind[i];
          if (k === CONCRETE || k === WATER) return -1;
          if (k === BRICK && a.mask[i]) cost = WALL_COST;
        }
      }
      return cost;
    };

    // двоичная куча: узлов пара тысяч, этого с запасом
    const heapI: number[] = [];
    const heapD: number[] = [];
    const push = (i: number, d: number) => {
      heapI.push(i); heapD.push(d);
      let c = heapI.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heapD[p] <= heapD[c]) break;
        [heapI[p], heapI[c]] = [heapI[c], heapI[p]];
        [heapD[p], heapD[c]] = [heapD[c], heapD[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heapI[0];
      const lastI = heapI.pop()!;
      const lastD = heapD.pop()!;
      if (heapI.length) {
        heapI[0] = lastI; heapD[0] = lastD;
        let p = 0;
        for (;;) {
          const l = p * 2 + 1;
          const r = l + 1;
          let m = p;
          if (l < heapD.length && heapD[l] < heapD[m]) m = l;
          if (r < heapD.length && heapD[r] < heapD[m]) m = r;
          if (m === p) break;
          [heapI[p], heapI[m]] = [heapI[m], heapI[p]];
          [heapD[p], heapD[m]] = [heapD[m], heapD[p]];
          p = m;
        }
      }
      return top;
    };

    dist[a.base] = 0;
    push(a.base, 0);
    while (heapI.length) {
      const i = pop();
      const d = dist[i];
      const c = i % cols;
      const r = (i / cols) | 0;
      for (let k = 0; k < 4; k++) {
        const nc = c + DX[k];
        const nr = r + DY[k];
        const w = costAt(nc, nr);
        if (w < 0) continue;
        const j = nr * cols + nc;
        const nd = d + w;
        if (dist[j] >= 0 && dist[j] <= nd) continue;
        dist[j] = nd;
        push(j, nd);
      }
    }
    this.flow = dist;
  }

  /** Прямо по курсу целый кирпич — значит, дорогу надо прострелить. */
  private brickAhead(t: Tank): boolean {
    const a = this.a;
    const c = a.cell;
    const nx = t.x + DX[t.dir] * (TANK / 2 + c * 0.6) + TANK / 2;
    const ny = t.y + DY[t.dir] * (TANK / 2 + c * 0.6) + TANK / 2;
    const col = Math.floor(nx / c);
    const row = Math.floor(ny / c);
    if (col < 0 || row < 0 || col >= a.cols || row >= a.rows) return false;
    const i = row * a.cols + col;
    return a.kind[i] === BRICK && a.mask[i] !== 0;
  }

  private moveEnemy(e: Tank, dt: number) {
    if (this.freezeT > 0) return; // часы: враги стоят
    e.cd -= dt;
    e.think -= dt;
    if (e.think <= 0) {
      // случайность в поведении: иначе все идут одной тропой
      e.think = rnd(0.4, 1.7);
      e.dir = this.pickDir(e);
    }
    const moved = this.step(e, dt);
    // упёрлись в кирпич — не мечемся, а сносим стену: курс держим
    if (!moved && !this.brickAhead(e)) { e.think = 0; e.dir = this.pickDir(e); }
    if (this.onIce(e) && !moved) e.slide = 0;
    if (e.cd <= 0 && this.wantsShot(e)) {
      e.cd = SPEC[e.kind].cd * rnd(0.75, 1.35);
      this.fire(e);
    }
  }

  private pickDir(e: Tank): number {
    const a = this.a;
    const opts: number[] = [];
    /* Идём вниз по волне. Небольшая доля случайных поворотов оставлена нарочно:
       без неё вся волна выстраивается в одну нитку по кратчайшему пути. */
    if (this.flow && Math.random() > 0.12) {
      const col = Math.round(e.x / a.cell);
      const row = Math.round(e.y / a.cell);
      const here = this.flow[Math.min(a.cols * a.rows - 1, Math.max(0, row * a.cols + col))];
      let best = -1;
      let bd = here >= 0 ? here : Infinity;
      for (const d of [0, 1, 2, 3].sort(() => Math.random() - 0.5)) {
        const nc = col + DX[d];
        const nr = row + DY[d];
        if (nc < 0 || nr < 0 || nc + 1 >= a.cols || nr + 1 >= a.rows) continue;
        const v = this.flow[nr * a.cols + nc];
        if (v < 0 || v >= bd) continue;
        bd = v; best = d;
      }
      if (best >= 0) opts.push(best);
    }
    const shuffled = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    opts.push(...shuffled);
    for (const d of opts) {
      const nx = e.x + DX[d] * 3;
      const ny = e.y + DY[d] * 3;
      if (this.fits(nx, ny) && !this.busy(e, nx, ny)) return d;
    }
    return (e.dir + 2) % 4;
  }

  private wantsShot(e: Tank): boolean {
    if (this.brickAhead(e)) return true; // расчищаем себе дорогу к базе
    if (Math.random() < 0.18) return true;
    const bx = (this.a.base % this.a.cols) * this.a.cell;
    const by = ((this.a.base / this.a.cols) | 0) * this.a.cell;
    const inLine = (tx: number, ty: number) =>
      DX[e.dir]
        ? Math.abs(ty - e.y) < TANK && Math.sign(tx - e.x) === DX[e.dir]
        : Math.abs(tx - e.x) < TANK && Math.sign(ty - e.y) === DY[e.dir];
    if (this.player && inLine(this.player.x, this.player.y)) return true;
    return inLine(bx, by);
  }

  private fire(t: Tank) {
    const sp = SPEC[t.kind];
    const power = t.enemy ? sp.power : this.weapon;
    this.bullets.push({
      x: t.x + TANK / 2 + DX[t.dir] * (TANK / 2),
      y: t.y + TANK / 2 + DY[t.dir] * (TANK / 2),
      dir: t.dir, enemy: t.enemy,
      speed: sp.bullet + (t.enemy ? 0 : (this.weapon - 1) * 60),
      power, dead: false,
    });
    this.hooks.sfx("shot");
  }

  private moveBullets(dt: number) {
    for (const b of this.bullets) {
      if (b.dead) continue;
      const steps = Math.max(1, Math.ceil((b.speed * dt) / 5));
      for (let s = 0; s < steps && !b.dead; s++) {
        b.x += (DX[b.dir] * b.speed * dt) / steps;
        b.y += (DY[b.dir] * b.speed * dt) / steps;
        if (!this.bulletAlive(b)) b.dead = true;
      }
    }
    // встречные снаряды гасят друг друга
    for (let i = 0; i < this.bullets.length; i++) {
      const a = this.bullets[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.bullets.length; j++) {
        const c = this.bullets[j];
        // гасят друг друга только встречные — два вражеских летят каждый своим
        if (c.dead || c.enemy === a.enemy) continue;
        if (Math.abs(a.x - c.x) > 10 || Math.abs(a.y - c.y) > 10) continue;
        a.dead = c.dead = true;
        this.booms.push({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, t: 0, kind: "hit" });
        this.hooks.sfx("clink");
        break;
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  private bulletAlive(b: Bullet): boolean {
    const a = this.a;
    if (b.x < 0 || b.y < 0 || b.x > a.w || b.y > a.h) return false;
    const c = Math.floor(b.x / a.cell);
    const r = Math.floor(b.y / a.cell);

    // база бьётся и своим снарядом — как в классике
    if (a.baseAlive) {
      const bc = a.base % a.cols, br = (a.base / a.cols) | 0;
      if (c >= bc && c <= bc + 1 && r >= br && r <= br + 1) {
        a.baseAlive = false;
        this.over = "lose";
        this.booms.push({ x: b.x, y: b.y, t: 0, kind: "heavy" });
        this.hooks.sfx("base");
        this.hooks.onShake();
        this.hooks.onToast("БАЗА УНИЧТОЖЕНА", `Волна ${this.level}. Очки: ${this.score}`);
        this.pushStats();
        return false;
      }
    }

    if (!shootable(a, c, r)) {
      const res = damage(a, c, r, DX[b.dir], DY[b.dir], b.power);
      this.repaint(r * a.cols + c);
      this.flowDirty = true; // стена изменилась — волну пересчитать
      if (res === "brick") {
        this.hooks.sfx("brick");
        for (let i = 0; i < 5; i++) {
          this.crumbs.push({
            x: b.x, y: b.y, vx: rnd(-105, 105), vy: rnd(-165, -45), t: 0,
          });
        }
      } else if (res === "concrete") {
        this.hooks.sfx("boom");
      } else {
        this.hooks.sfx("clink");
      }
      this.booms.push({ x: b.x, y: b.y, t: 0, kind: "hit" });
      return false;
    }

    const box = (t: Tank) =>
      b.x > t.x + 5 && b.x < t.x + TANK - 5 && b.y > t.y + 5 && b.y < t.y + TANK - 5;
    if (!b.enemy) {
      for (const e of this.enemies) {
        if (!box(e)) continue;
        e.hp -= b.power >= 2 ? 2 : 1;
        if (e.hp > 0) { this.hooks.sfx("clink"); this.booms.push({ x: b.x, y: b.y, t: 0, kind: "hit" }); return false; }
        this.killEnemy(e);
        return false;
      }
    } else {
      const p = this.player;
      if (p && box(p)) {
        if (p.shield > 0) return false;
        this.hitPlayer();
        return false;
      }
      // сквозь своих снаряд пролетает: враги не воюют между собой и не глушат
      // выстрелы друг другу, иначе строй сам себя разбирает
    }
    return true;
  }

  private killEnemy(e: Tank) {
    this.enemies = this.enemies.filter((o) => o !== e);
    this.score += SPEC[e.kind].score;
    this.booms.push({
      x: e.x + TANK / 2, y: e.y + TANK / 2, t: 0,
      kind: e.kind === "heavy" || e.kind === "armor" ? "heavy" : "tank",
    });
    this.hooks.sfx(e.kind === "heavy" ? "bigboom" : "boom");
    if (e.bonus) this.dropPower();
    this.pushStats();
  }

  private hitPlayer() {
    const p = this.player!;
    this.player = null;
    this.lives--;
    this.weapon = 1; // усиление теряется вместе с машиной
    this.booms.push({ x: p.x + TANK / 2, y: p.y + TANK / 2, t: 0, kind: "heavy" });
    this.hooks.sfx("bigboom");
    this.hooks.onShake();
    if (this.lives <= 0) {
      this.over = "lose";
      this.hooks.onToast("БРОНЕВИКИ КОНЧИЛИСЬ", `Волна ${this.level}. Очки: ${this.score}`);
    } else this.respawn = 1.5;
    this.pushStats();
  }

  /* ── бонусы ── */
  private updatePowers(dt: number) {
    this.powerCd -= dt;
    if (this.powerCd <= 0) { this.powerCd = rnd(14, 26); this.dropPower(); }
    const live: Power[] = [];
    for (const p of this.powers) {
      p.t += dt;
      if (p.t < p.life) live.push(p);
    }
    /* Берём БЛИЖАЙШИЙ бонус, а не первый попавшийся в списке. Радиус подбора
       шире танка, и когда рядом лежали два приза, срабатывал тот, что старше:
       наезжаешь на гранату, а применяется лопата. */
    const pl = this.player;
    if (pl) {
      const cx = pl.x + TANK / 2;
      const cy = pl.y + TANK / 2;
      let take = -1;
      let bd = Infinity;
      for (let i = 0; i < live.length; i++) {
        const dx = Math.abs(live[i].x - cx);
        const dy = Math.abs(live[i].y - cy);
        if (dx > 32 || dy > 32) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; take = i; }
      }
      if (take >= 0) {
        const [got] = live.splice(take, 1);
        this.takePower(got.kind);
      }
    }
    this.powers = live;
  }

  /** Бонус кладём на свободную клетку — никогда внутрь стены. */
  private dropPower() {
    const a = this.a;
    const kinds: PowerKind[] = ["star", "grenade", "helmet", "clock", "shovel", "armor"];
    for (let tries = 0; tries < 200; tries++) {
      const c = 1 + ((Math.random() * (a.cols - 3)) | 0);
      const r = 1 + ((Math.random() * (a.rows - 3)) | 0);
      if (!drivable(a, c, r) || !drivable(a, c + 1, r) || !drivable(a, c, r + 1)) continue;
      this.powers.push({
        kind: kinds[(Math.random() * kinds.length) | 0],
        x: c * a.cell + a.cell, y: r * a.cell + a.cell,
        t: 0, life: 12,
      });
      this.hooks.sfx("bonus");
      return;
    }
  }

  private takePower(k: PowerKind) {
    this.score += POWER_SCORE;
    this.hooks.sfx("pickup");
    const p = this.player;
    switch (k) {
      case "star":
        this.weapon = Math.min(4, this.weapon + 1);
        this.hooks.onToast("ЗВЕЗДА", this.weapon >= 4 ? "Максимум: бетон пробивается" : `Оружие ${this.weapon}`);
        break;
      case "grenade": {
        const all = [...this.enemies];
        for (const e of all) this.killEnemy(e);
        this.hooks.onToast("ГРАНАТА", "Поле зачищено");
        break;
      }
      case "helmet":
        if (p) p.shield = 12;
        this.hooks.onToast("ШЛЕМ", "Неуязвимость 12 с");
        break;
      case "clock":
        this.freezeT = 10;
        this.hooks.onToast("ЧАСЫ", "Враги замерли");
        break;
      case "shovel":
        setBaseWall(this.a, CONCRETE);
        this.repaintCollar();
        this.shovelT = 20;
        this.hooks.onToast("ЛОПАТА", "Бетон вокруг базы");
        break;
      case "armor":
        if (p) { p.maxHp = 3; p.hp = 3; p.shield = Math.max(p.shield, 3); }
        this.hooks.onToast("БРОНЯ", "Держит больше попаданий");
        break;
    }
    this.pushStats();
  }

  /* ═══ отрисовка ═══ */
  private draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.a.w, this.a.h);
    if (!this.ground) this.bakeTerrain();
    ctx.drawImage(this.ground!, 0, 0, this.a.w, this.a.h);
    this.drawShovelWarn();
    this.drawWater();
    this.drawBase();
    this.drawPowers();
    this.drawMarks();
    for (const e of this.enemies) this.drawTank(e);
    if (this.player) this.drawTank(this.player);
    this.drawBullets();
    ctx.drawImage(this.canopy!, 0, 0, this.a.w, this.a.h);
    this.drawFx();
  }

  private layer(): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement("canvas");
    c.width = Math.round(this.a.w * dpr);
    c.height = Math.round(this.a.h * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    return [c, g];
  }

  private bakeTerrain() {
    const [gc, gg] = this.layer();
    const [cc, cg] = this.layer();
    this.ground = gc;
    this.canopy = cc;
    for (let i = 0; i < this.a.kind.length; i++) this.paint(gg, cg, i);
  }

  private repaint(i: number) {
    if (!this.ground || !this.canopy) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const gg = this.ground.getContext("2d")!;
    const cg = this.canopy.getContext("2d")!;
    gg.setTransform(dpr, 0, 0, dpr, 0, 0);
    cg.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = this.a.cell;
    const x = (i % this.a.cols) * c;
    const y = ((i / this.a.cols) | 0) * c;
    gg.clearRect(x, y, c, c);
    cg.clearRect(x, y, c, c);
    this.paint(gg, cg, i);
  }

  /* Плитка полупрозрачная: под ней должен читаться дашборд — он и есть арена. */
  private paint(g: CanvasRenderingContext2D, cg: CanvasRenderingContext2D, i: number) {
    const a = this.a;
    const c = a.cell;
    const x = (i % a.cols) * c;
    const y = ((i / a.cols) | 0) * c;
    const k = a.kind[i];
    if (k === BRICK && a.mask[i]) {
      this.brickCell(g, x, y, c, a.mask[i]);
    } else if (k === CONCRETE) {
      this.concreteCell(g, x, y, c);
    } else if (k === ICE) {
      g.fillStyle = "rgba(196, 226, 240, 0.62)";
      g.fillRect(x, y, c, c);
      g.fillStyle = "rgba(255, 255, 255, 0.75)";
      g.fillRect(x + 2, y + 2, 4, 1);
      g.fillRect(x + c - 7, y + c - 5, 5, 1);
      g.fillRect(x + 3, y + c - 6, 1, 3);
    } else if (k === FOREST) {
      /* Крона кроет почти наглухо — прячется в ней и игрок, и враг. Видно
         только то, что попало в прорехи: их около десятой части клетки.
         Дырки считаются от номера клетки, а не случайно, иначе листва
         перемигивала бы при каждой перерисовке. */
      cg.fillStyle = "rgba(22, 72, 20, 0.97)";
      cg.fillRect(x, y, c, c);
      cg.fillStyle = "rgba(50, 126, 38, 0.97)";
      for (let ry = 0; ry < c; ry += 4) {
        for (let rx = (ry / 4) % 2 ? 0 : 2; rx < c; rx += 4) cg.fillRect(x + rx, y + ry, 3, 3);
      }
      let seed = (i * 2654435761) >>> 0;
      const gap = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let g = 0; g < 3; g++) {
        cg.clearRect(x + ((gap() * (c - 3)) | 0), y + ((gap() * (c - 3)) | 0), 3, 3);
      }
    }
  }

  private concreteCell(g: CanvasRenderingContext2D, x: number, y: number, c: number) {
    g.fillStyle = "rgba(150, 156, 164, 0.9)";
    g.fillRect(x, y, c, c);
    g.fillStyle = "rgba(220, 224, 230, 0.95)";
    g.fillRect(x + 1, y + 1, c - 3, 2);
    g.fillRect(x + 1, y + 1, 2, c - 3);
    g.fillStyle = "rgba(88, 94, 102, 0.95)";
    g.fillRect(x + c - 3, y + 2, 2, c - 3);
    g.fillRect(x + 2, y + c - 3, c - 3, 2);
  }

  /** Двенадцать клеток воротника вокруг базы. */
  private collar(): number[] {
    const a = this.a;
    const bc = a.base % a.cols;
    const br = (a.base / a.cols) | 0;
    const out: number[] = [];
    for (let dy = -COLLAR; dy <= COLLAR + 1; dy++) {
      for (let dx = -COLLAR; dx <= COLLAR + 1; dx++) {
        if (dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1) continue;
        const x = bc + dx;
        const y = br + dy;
        if (x < 0 || y < 0 || x >= a.cols || y >= a.rows) continue;
        out.push(y * a.cols + x);
      }
    }
    return out;
  }

  /* Лопата меняет вид стены, а не только её прочность: без перерисовки
     испечённого слоя бетон появлялся в модели и не появлялся на экране. */
  private repaintCollar() {
    for (const i of this.collar()) this.repaint(i);
  }

  /** Бетон под лопатой мигает последние секунды — предупреждение. */
  private drawShovelWarn() {
    if (this.shovelT <= 0 || this.shovelT > 4) return;
    if (Math.floor(this.shovelT * 6) % 2 === 0) return;
    const a = this.a;
    const c = a.cell;
    for (const i of this.collar()) {
      if (a.kind[i] !== CONCRETE) continue;
      const x = (i % a.cols) * c;
      const y = ((i / a.cols) | 0) * c;
      this.ctx.clearRect(x, y, c, c);
      this.brickCell(this.ctx, x, y, c, FULL);
    }
  }

  private brickCell(
    g: CanvasRenderingContext2D, x: number, y: number, c: number, m: number
  ) {
    const q = c / 2;
    const put = (bit: number, qx: number, qy: number) => {
      if (!(m & bit)) return;
      g.fillStyle = "rgba(150, 72, 34, 0.88)";
      g.fillRect(qx, qy, q, q);
      g.fillStyle = "rgba(198, 110, 62, 0.9)";
      for (let ry = 0; ry < q; ry += 4) g.fillRect(qx + (ry % 8 ? 0 : 1), qy + ry, q - 1, 3);
      g.fillStyle = "rgba(70, 32, 14, 0.9)";
      g.fillRect(qx, qy + q - 1, q, 1);
      g.fillRect(qx + q - 1, qy, 1, q);
    };
    put(TL, x, y); put(TR, x + q, y); put(BL, x, y + q); put(BR, x + q, y + q);
  }

  /** Вода живёт волной, поэтому рисуется в кадре, а не печётся. */
  private drawWater() {
    const a = this.a;
    const ctx = this.ctx;
    const c = a.cell;
    for (let i = 0; i < a.kind.length; i++) {
      if (a.kind[i] !== WATER) continue;
      const x = (i % a.cols) * c;
      const y = ((i / a.cols) | 0) * c;
      ctx.fillStyle = "rgba(24, 68, 150, 0.72)";
      ctx.fillRect(x, y, c, c);
      ctx.fillStyle = "rgba(90, 160, 230, 0.85)";
      const ph = Math.sin(this.time * 2.2 + (x + y) * 0.05) * 2;
      ctx.fillRect(x + 2, y + 4 + ph, c - 6, 1);
      ctx.fillRect(x + 4, y + 10 - ph, c - 8, 1);
    }
  }

  private drawBase() {
    const a = this.a;
    const art = a.baseAlive ? this.baseArt : this.baseDead;
    /* Спрайт шире клеток на обводку, поэтому кладём его ПО ЦЕНТРУ блока 2×2, а
       не от угла: иначе логотип сидит со сдвигом вправо-вниз и выглядит криво. */
    const cx = (a.base % a.cols) * a.cell + a.cell;
    const cy = ((a.base / a.cols) | 0) * a.cell + a.cell;
    this.ctx.drawImage(art.c, Math.round(cx - art.w / 2), Math.round(cy - art.h / 2));
  }

  private drawMarks() {
    for (const m of this.marks) {
      // предупреждение: точка спавна мигает звездой перед выездом
      const k = m.t / 1;
      const r = 12 + Math.sin(this.time * 30) * 6;
      this.ctx.save();
      this.ctx.globalAlpha = 1 - k * 0.4;
      this.ctx.strokeStyle = "#f0c419";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      for (let s = 0; s < 4; s++) {
        const ang = (s / 4) * TAU + this.time * 6;
        this.ctx.moveTo(m.x + TANK / 2, m.y + TANK / 2);
        this.ctx.lineTo(m.x + TANK / 2 + Math.cos(ang) * r, m.y + TANK / 2 + Math.sin(ang) * r);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  private drawPowers() {
    for (const p of this.powers) {
      const left = p.life - p.t;
      // перед исчезновением бонус мигает
      if (left < 3 && Math.floor(left * 8) % 2 === 0) continue;
      const art = this.powerArt.get(p.kind)!;
      const pop = p.t < 0.3 ? 0.4 + (p.t / 0.3) * 0.6 : 1;
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.scale(pop, pop);
      this.ctx.drawImage(art.c, -art.w / 2, -art.h / 2);
      this.ctx.restore();
    }
  }

  private drawTank(t: Tank) {
    const ctx = this.ctx;
    if (t.shield > 0 && Math.floor(t.shield * 12) % 2 === 0 && t.shield < 2.4) return;
    const flash = t.enemy && t.bonus && Math.floor(this.time * 5) % 2 === 0;
    const key = t.enemy
      ? (flash ? `${t.kind}!` : t.kind)
      : `player${Math.min(3, this.weapon - 1)}`;
    const baked = this.tankArt.get(key) ?? this.tankArt.get(t.kind)!;
    ctx.save();
    ctx.translate(Math.round(t.x) + TANK / 2, Math.round(t.y) + TANK / 2);
    ctx.rotate((t.dir * Math.PI) / 2);
    // прятать танк в лесу — забота кроны: она глухая, но дырявая
    ctx.drawImage(baked.c, -baked.w / 2, -baked.h / 2);
    ctx.restore();
    if (t.shield > 0) {
      ctx.strokeStyle = "rgba(189, 234, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(t.x - 2, t.y - 2, TANK + 4, TANK + 4);
    }
    if (t.enemy && t.maxHp > 1) {
      // сколько брони осталось — полоска над корпусом
      const wdt = TANK * (t.hp / t.maxHp);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(t.x, t.y - 5, TANK, 3);
      ctx.fillStyle = "#59b04a";
      ctx.fillRect(t.x, t.y - 5, wdt, 3);
    }
  }

  private drawBullets() {
    for (const b of this.bullets) {
      pxDot(this.ctx, b.x, b.y, b.power >= 2 ? 3 : 2, "#ffffff", PX);
      pxDot(this.ctx, b.x, b.y, 1, b.enemy ? "#ffc0b0" : "#f0c419", PX);
    }
  }

  private drawFx() {
    const ctx = this.ctx;
    for (const c of this.crumbs) {
      ctx.globalAlpha = 1 - c.t / 0.5;
      pxDot(ctx, c.x, c.y, 1, "#c66e3e", PX);
      ctx.globalAlpha = 1;
    }
    for (const b of this.booms) {
      const dur = b.kind === "hit" ? 0.22 : 0.6;
      const k = b.t / dur;
      const big = b.kind === "heavy";
      const r = (b.kind === "hit" ? 12 : big ? 45 : 27) * (0.35 + k);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.globalCompositeOperation = "lighter";
      const n = b.kind === "hit" ? 4 : big ? 12 : 8;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + k * 1.6;
        pxDot(ctx, b.x + Math.cos(ang) * r, b.y + Math.sin(ang) * r,
          k < 0.4 ? 3 : 2, k < 0.3 ? "#fff6cf" : k < 0.65 ? "#f0a23c" : "#a8360f", PX);
      }
      pxDot(ctx, b.x, b.y, big ? 5 : 3, k < 0.5 ? "#ffffff" : "#f0c419", PX);
      ctx.restore();
    }
  }
}

export { EMPTY };
