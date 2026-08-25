/* ═══ Движок «Броневика» ═══
   Местность печётся в два offscreen-слоя: земля (кирпич и сталь) под танками и
   кроны (кусты) поверх них — из-за этого танк в зарослях видно лишь по стволу.
   Перерисовывается не весь слой, а одна клетка, в которую попали. */

import { Baked, bake, pxDot } from "../td/pixel";
import { TANK_ART, TANK_NEON, TankKind, VAULT_ART, VAULT_DEAD_ART } from "./art";
import {
  Arena,
  BRICK,
  BL,
  BR,
  STEEL,
  TL,
  TR,
  TREES,
  drivable,
  hitBrick,
  shootable,
} from "./arena";

const PX = 2;
const S = 2; // 1 арт-пиксель = 2 CSS-px, танк выходит 32×32
const TANK = 32;
const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** 0 — вверх, 1 — вправо, 2 — вниз, 3 — влево */
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export interface Stats {
  lives: number;
  level: number;
  left: number;
  onField: number;
  vault: boolean;
  paused: boolean;
  over: null | "win" | "lose";
  kills: number;
}

export interface Hooks {
  onStats: (s: Stats) => void;
  onToast: (title: string, sub?: string) => void;
  onShake: () => void;
  sfx: (n: "shot" | "brick" | "steel" | "boom" | "spawn" | "hurt" | "vault") => void;
}

interface Tank {
  kind: TankKind;
  x: number;
  y: number;
  dir: number;
  speed: number;
  cd: number;
  hp: number;
  think: number;
  enemy: boolean;
  /** неуязвимость после появления, сек */
  shield: number;
  frozen: number;
}

interface Bullet {
  x: number;
  y: number;
  dir: number;
  enemy: boolean;
  speed: number;
}

interface Boom {
  x: number;
  y: number;
  t: number;
  big: boolean;
}

const SPEC: Record<TankKind, { speed: number; hp: number; cd: number; bullet: number }> = {
  player: { speed: 108, hp: 1, cd: 0.42, bullet: 400 },
  grunt: { speed: 56, hp: 1, cd: 1.5, bullet: 300 },
  swift: { speed: 104, hp: 1, cd: 1.2, bullet: 380 },
  armor: { speed: 42, hp: 4, cd: 1.3, bullet: 320 },
};

/** Сколько танков и какой смеси приносит уровень. */
function levelPack(level: number): TankKind[] {
  const out: TankKind[] = [];
  const n = 8 + level * 2;
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    if (level >= 3 && r < 0.18 + level * 0.02) out.push("armor");
    else if (level >= 2 && r < 0.45) out.push("swift");
    else out.push("grunt");
  }
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

  private tankArt = new Map<TankKind, Baked>();
  private vaultArt!: Baked;
  private vaultDead!: Baked;
  private ground: HTMLCanvasElement | null = null;
  private canopy: HTMLCanvasElement | null = null;

  private player: Tank | null = null;
  private enemies: Tank[] = [];
  private bullets: Bullet[] = [];
  private booms: Boom[] = [];

  private queue: TankKind[] = [];
  private level = 1;
  private lives = 3;
  private kills = 0;
  private spawnCd = 0;
  private respawn = 0;
  private paused = false;
  private hidden = false;
  private over: null | "win" | "lose" = null;
  private time = 0;
  private statTick = 0;
  private keys = new Set<string>();

  constructor(canvas: HTMLCanvasElement, arena: Arena, hooks: Hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.a = arena;
    this.hooks = hooks;
    for (const k of Object.keys(TANK_ART) as TankKind[]) {
      this.tankArt.set(k, bake(TANK_ART[k], S));
    }
    this.vaultArt = bake(VAULT_ART, S);
    this.vaultDead = bake(VAULT_DEAD_ART, S);
    this.resize();
    this.startLevel(1);
  }

  /* ── жизненный цикл ── */
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

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
  }

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

  setArena(a: Arena) {
    this.a = a;
    this.resize();
  }

  setHidden(v: boolean) {
    if (this.hidden === v) return;
    this.hidden = v;
    if (!v) this.last = performance.now();
    this.pushStats();
  }

  togglePause() {
    if (this.over) return;
    this.paused = !this.paused;
    this.pushStats();
  }

  key(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  restart() {
    this.enemies = [];
    this.bullets = [];
    this.booms = [];
    this.lives = 3;
    this.kills = 0;
    this.over = null;
    this.a.vaultAlive = true;
    this.startLevel(1);
    this.pushStats();
  }

  private startLevel(n: number) {
    this.level = n;
    this.queue = levelPack(n);
    this.spawnCd = 0.6;
    this.spawnPlayer();
    this.hooks.onToast(`УРОВЕНЬ ${n}`, `Противников: ${this.queue.length}`);
  }

  private spawnPlayer() {
    const i = this.a.playerSpawn;
    this.player = {
      kind: "player",
      x: (i % this.a.cols) * this.a.cell,
      y: ((i / this.a.cols) | 0) * this.a.cell,
      dir: 0,
      speed: SPEC.player.speed,
      cd: 0,
      hp: 1,
      think: 0,
      enemy: false,
      shield: 2.2,
      frozen: 0,
    };
  }

  private pushStats() {
    this.hooks.onStats({
      lives: this.lives,
      level: this.level,
      left: this.queue.length + this.enemies.length,
      onField: this.enemies.length,
      vault: this.a.vaultAlive,
      paused: this.paused,
      over: this.over,
      kills: this.kills,
    });
  }

  /* ═══ симуляция ═══ */
  private update(dt: number) {
    this.time += dt;

    // подвоз противника: больше четырёх на поле не выпускаем
    if (this.queue.length && this.enemies.length < 4) {
      this.spawnCd -= dt;
      if (this.spawnCd <= 0) {
        this.spawnCd = 2.2;
        this.spawnEnemy();
      }
    }

    if (!this.player && this.respawn > 0) {
      this.respawn -= dt;
      if (this.respawn <= 0) this.spawnPlayer();
    }

    this.movePlayer(dt);
    for (const e of this.enemies) this.moveEnemy(e, dt);
    this.moveBullets(dt);
    this.booms = this.booms.filter((b) => (b.t += dt) < (b.big ? 0.55 : 0.3));

    if (!this.queue.length && !this.enemies.length && this.over === null) {
      if (this.level >= 10) {
        this.over = "win";
        this.hooks.onToast("ХРАНИЛИЩЕ ЦЕЛО", `Десять уровней. Подбито: ${this.kills}`);
      } else {
        this.startLevel(this.level + 1);
      }
      this.pushStats();
    }

    this.statTick += dt;
    if (this.statTick > 0.2) {
      this.statTick = 0;
      this.pushStats();
    }
  }

  private spawnEnemy() {
    const kind = this.queue.shift()!;
    const spots = this.a.enemySpawns;
    const i = spots[(Math.random() * spots.length) | 0];
    const x = (i % this.a.cols) * this.a.cell;
    const y = ((i / this.a.cols) | 0) * this.a.cell;
    // не высаживаем прямо в чужую корму
    for (const o of this.enemies) if (Math.abs(o.x - x) < TANK && Math.abs(o.y - y) < TANK) return;
    const sp = SPEC[kind];
    this.enemies.push({
      kind,
      x,
      y,
      dir: 2,
      speed: sp.speed,
      cd: rnd(0.4, 1.2),
      hp: sp.hp,
      think: 0,
      enemy: true,
      shield: 0,
      frozen: 0,
    });
    this.booms.push({ x: x + TANK / 2, y: y + TANK / 2, t: 0, big: false });
    this.hooks.sfx("spawn");
    this.pushStats();
  }

  /** Помещается ли танк левым верхним углом в (x, y). */
  private fits(x: number, y: number): boolean {
    const c = this.a.cell;
    const c0 = Math.floor(x / c);
    const c1 = Math.floor((x + TANK - 1) / c);
    const r0 = Math.floor(y / c);
    const r1 = Math.floor((y + TANK - 1) / c);
    if (x < 0 || y < 0 || x + TANK > this.a.w || y + TANK > this.a.h) return false;
    for (let r = r0; r <= r1; r++) {
      for (let cc = c0; cc <= c1; cc++) if (!drivable(this.a, cc, r)) return false;
    }
    return true;
  }

  private blockedByTank(t: Tank, x: number, y: number): boolean {
    const all: Tank[] = this.player ? [this.player, ...this.enemies] : [...this.enemies];
    for (const o of all) {
      if (o === t) continue;
      if (Math.abs(o.x - x) < TANK - 2 && Math.abs(o.y - y) < TANK - 2) return true;
    }
    return false;
  }

  /** Шаг танка вперёд с прилипанием к половине клетки поперёк движения. */
  private step(t: Tank, dt: number): boolean {
    const dist = t.speed * dt;
    let nx = t.x + DX[t.dir] * dist;
    let ny = t.y + DY[t.dir] * dist;
    // подтягиваем поперечную ось к сетке — иначе в проём не попасть никогда
    const half = this.a.cell / 2;
    if (DX[t.dir]) ny = this.glide(t.y, half, dist);
    else nx = this.glide(t.x, half, dist);
    if (!this.fits(nx, ny) || this.blockedByTank(t, nx, ny)) return false;
    t.x = nx;
    t.y = ny;
    return true;
  }

  private glide(v: number, grid: number, dist: number) {
    const target = Math.round(v / grid) * grid;
    if (Math.abs(target - v) < 0.01) return target;
    return v + Math.sign(target - v) * Math.min(Math.abs(target - v), dist);
  }

  private movePlayer(dt: number) {
    const p = this.player;
    if (!p) return;
    if (p.shield > 0) p.shield -= dt;
    p.cd -= dt;
    const k = this.keys;
    let dir = -1;
    if (k.has("ArrowUp") || k.has("KeyW")) dir = 0;
    else if (k.has("ArrowRight") || k.has("KeyD")) dir = 1;
    else if (k.has("ArrowDown") || k.has("KeyS")) dir = 2;
    else if (k.has("ArrowLeft") || k.has("KeyA")) dir = 3;
    if (dir >= 0) {
      p.dir = dir;
      this.step(p, dt);
    }
    if ((k.has("Space") || k.has("KeyJ")) && p.cd <= 0) {
      p.cd = SPEC.player.cd;
      this.fire(p);
    }
  }

  private moveEnemy(e: Tank, dt: number) {
    e.cd -= dt;
    e.think -= dt;
    if (e.think <= 0) {
      e.think = rnd(0.5, 1.6);
      e.dir = this.chooseDir(e);
    }
    if (!this.step(e, dt)) {
      // упёрлись — думаем раньше срока, иначе танк вязнет в стене
      e.think = 0;
      e.dir = this.chooseDir(e);
    }
    if (e.cd <= 0 && this.wantsShot(e)) {
      e.cd = SPEC[e.kind].cd * rnd(0.8, 1.3);
      this.fire(e);
    }
  }

  /** Курс: чаще к хранилищу, иногда наугад — иначе все идут гуськом. */
  private chooseDir(e: Tank): number {
    const vx = (this.a.vault % this.a.cols) * this.a.cell;
    const vy = ((this.a.vault / this.a.cols) | 0) * this.a.cell;
    const opts: number[] = [];
    if (Math.random() < 0.72) {
      if (Math.abs(vx - e.x) > Math.abs(vy - e.y)) opts.push(vx < e.x ? 3 : 1, vy < e.y ? 0 : 2);
      else opts.push(vy < e.y ? 0 : 2, vx < e.x ? 3 : 1);
    }
    opts.push(0, 1, 2, 3);
    for (const d of opts) {
      const nx = e.x + DX[d] * 3;
      const ny = e.y + DY[d] * 3;
      if (this.fits(nx, ny) && !this.blockedByTank(e, nx, ny)) return d;
    }
    return (e.dir + 1) % 4;
  }

  /** Стреляем, если по курсу игрок, хранилище или просто стена — прогрызём. */
  private wantsShot(e: Tank): boolean {
    if (Math.random() < 0.25) return true;
    const p = this.player;
    const vx = (this.a.vault % this.a.cols) * this.a.cell;
    const vy = ((this.a.vault / this.a.cols) | 0) * this.a.cell;
    const aligned = (tx: number, ty: number) => {
      if (DX[e.dir]) return Math.abs(ty - e.y) < TANK && Math.sign(tx - e.x) === DX[e.dir];
      return Math.abs(tx - e.x) < TANK && Math.sign(ty - e.y) === DY[e.dir];
    };
    if (p && aligned(p.x, p.y)) return true;
    return aligned(vx, vy);
  }

  private fire(t: Tank) {
    const sp = SPEC[t.kind];
    this.bullets.push({
      x: t.x + TANK / 2 + DX[t.dir] * (TANK / 2),
      y: t.y + TANK / 2 + DY[t.dir] * (TANK / 2),
      dir: t.dir,
      enemy: t.enemy,
      speed: sp.bullet,
    });
    this.hooks.sfx("shot");
  }

  private moveBullets(dt: number) {
    const live: Bullet[] = [];
    for (const b of this.bullets) {
      let alive = true;
      // шагаем мелко, чтобы на скорости не проскочить сквозь стену
      const steps = Math.max(1, Math.ceil((b.speed * dt) / 6));
      for (let s = 0; s < steps && alive; s++) {
        b.x += (DX[b.dir] * b.speed * dt) / steps;
        b.y += (DY[b.dir] * b.speed * dt) / steps;
        alive = this.bulletHit(b);
      }
      if (alive) live.push(b);
    }
    this.bullets = live;
  }

  /** @returns остался ли снаряд в живых */
  private bulletHit(b: Bullet): boolean {
    const a = this.a;
    if (b.x < 0 || b.y < 0 || b.x > a.w || b.y > a.h) return false;
    const c = Math.floor(b.x / a.cell);
    const r = Math.floor(b.y / a.cell);

    // хранилище
    const vc = a.vault % a.cols;
    const vr = (a.vault / a.cols) | 0;
    if (a.vaultAlive && c >= vc && c <= vc + 1 && r >= vr && r <= vr + 1) {
      a.vaultAlive = false;
      this.over = "lose";
      this.booms.push({ x: b.x, y: b.y, t: 0, big: true });
      this.hooks.sfx("vault");
      this.hooks.onShake();
      this.hooks.onToast("ХРАНИЛИЩЕ ВСКРЫТО", `Продержались до уровня ${this.level}.`);
      this.pushStats();
      return false;
    }

    if (!shootable(a, c, r)) {
      const i = r * a.cols + c;
      if (a.kind[i] === BRICK) {
        hitBrick(a, c, r, DX[b.dir], DY[b.dir]);
        this.repaintCell(i);
        this.hooks.sfx("brick");
      } else {
        this.hooks.sfx("steel");
      }
      this.booms.push({ x: b.x, y: b.y, t: 0, big: false });
      return false;
    }

    // танки
    const hitBox = (t: Tank) =>
      b.x > t.x + 3 && b.x < t.x + TANK - 3 && b.y > t.y + 3 && b.y < t.y + TANK - 3;
    if (!b.enemy) {
      for (const e of this.enemies) {
        if (!hitBox(e)) continue;
        e.hp--;
        this.booms.push({ x: b.x, y: b.y, t: 0, big: e.hp <= 0 });
        if (e.hp <= 0) {
          this.enemies = this.enemies.filter((o) => o !== e);
          this.kills++;
          this.hooks.sfx("boom");
          this.pushStats();
        } else {
          this.hooks.sfx("steel");
        }
        return false;
      }
    } else {
      const p = this.player;
      if (p && hitBox(p)) {
        if (p.shield > 0) return false;
        this.player = null;
        this.lives--;
        this.booms.push({ x: p.x + TANK / 2, y: p.y + TANK / 2, t: 0, big: true });
        this.hooks.sfx("hurt");
        this.hooks.onShake();
        if (this.lives <= 0) {
          this.over = "lose";
          this.hooks.onToast("БРОНЕВИК ПОТЕРЯН", `Продержались до уровня ${this.level}.`);
        } else {
          this.respawn = 1.4;
        }
        this.pushStats();
        return false;
      }
      // свой своего не бьёт, но снаряд гасится
      for (const e of this.enemies) if (hitBox(e)) return false;
    }
    return true;
  }

  /* ═══ отрисовка ═══ */
  private draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.a.w, this.a.h);
    if (!this.ground) this.bakeTerrain();
    ctx.drawImage(this.ground!, 0, 0, this.a.w, this.a.h);
    this.drawVault();
    for (const e of this.enemies) this.drawTank(e);
    if (this.player) this.drawTank(this.player);
    this.drawBullets();
    ctx.drawImage(this.canopy!, 0, 0, this.a.w, this.a.h);
    this.drawBooms();
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
    const [gcv, gg] = this.layer();
    this.ground = gcv;
    const [cc, cg] = this.layer();
    this.canopy = cc;
    for (let i = 0; i < this.a.kind.length; i++) this.paint(gg, cg, i);
  }

  private repaintCell(i: number) {
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

  /* Плитка кладётся полупрозрачной: под кирпичом должно просвечивать, что это
     баннер, а под сталью — сайдбар. Иначе от «полигона на дашборде» остаётся
     просто полигон, и связь с интерфейсом теряется. */
  private paint(g: CanvasRenderingContext2D, cg: CanvasRenderingContext2D, i: number) {
    const a = this.a;
    const c = a.cell;
    const x = (i % a.cols) * c;
    const y = ((i / a.cols) | 0) * c;
    const k = a.kind[i];
    if (k === BRICK && a.mask[i]) {
      const q = c / 2;
      const put = (bit: number, qx: number, qy: number) => {
        if (!(a.mask[i] & bit)) return;
        g.fillStyle = "rgba(138, 74, 38, 0.84)";
        g.fillRect(qx, qy, q, q);
        g.fillStyle = "rgba(181, 106, 60, 0.8)";
        for (let ry = 0; ry < q; ry += 4) g.fillRect(qx, qy + ry, q, 3);
        g.fillStyle = "rgba(74, 36, 16, 0.9)";
        g.fillRect(qx, qy + q - 1, q, 1);
        g.fillRect(qx + q - 1, qy, 1, q);
      };
      put(TL, x, y);
      put(TR, x + q, y);
      put(BL, x, y + q);
      put(BR, x + q, y + q);
    } else if (k === STEEL) {
      g.fillStyle = "rgba(90, 103, 136, 0.72)";
      g.fillRect(x, y, c, c);
      g.fillStyle = "rgba(139, 154, 196, 0.8)";
      g.fillRect(x + 1, y + 1, c - 2, 2);
      g.fillRect(x + 1, y + 1, 2, c - 2);
      g.fillStyle = "rgba(45, 54, 78, 0.8)";
      g.fillRect(x + c - 3, y + 2, 2, c - 4);
      g.fillRect(x + 2, y + c - 3, c - 4, 2);
    } else if (k === TREES) {
      cg.fillStyle = "rgba(28, 74, 24, 0.7)";
      cg.fillRect(x, y, c, c);
      cg.fillStyle = "rgba(63, 138, 48, 0.78)";
      for (let ry = 0; ry < c; ry += 4) {
        for (let rx = (ry / 4) % 2 ? 0 : 2; rx < c; rx += 4) cg.fillRect(x + rx, y + ry, 3, 3);
      }
    }
  }

  private drawVault() {
    const a = this.a;
    const x = (a.vault % a.cols) * a.cell;
    const y = ((a.vault / a.cols) | 0) * a.cell;
    const art = a.vaultAlive ? this.vaultArt : this.vaultDead;
    this.ctx.drawImage(art.c, Math.round(x), Math.round(y));
    if (a.vaultAlive) {
      const p = 0.4 + Math.sin(this.time * 3) * 0.3;
      this.ctx.strokeStyle = `rgba(182, 255, 61, ${p})`;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(x - 1.5, y - 1.5, TANK + 3, TANK + 3);
    }
  }

  private drawTank(t: Tank) {
    const ctx = this.ctx;
    const baked = this.tankArt.get(t.kind)!;
    // мигание неуязвимости после появления
    if (t.shield > 0 && Math.floor(t.shield * 12) % 2 === 0) return;
    ctx.save();
    ctx.translate(Math.round(t.x) + TANK / 2, Math.round(t.y) + TANK / 2);
    ctx.rotate((t.dir * Math.PI) / 2);
    ctx.drawImage(baked.c, -baked.w / 2, -baked.h / 2);
    ctx.restore();
    if (t.shield > 0) {
      ctx.strokeStyle = "rgba(165, 247, 255, 0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(t.x - 1.5, t.y - 1.5, TANK + 3, TANK + 3);
    }
  }

  private drawBullets() {
    for (const b of this.bullets) {
      pxDot(this.ctx, b.x, b.y, 2, b.enemy ? "#ffb3a6" : "#ffffff", PX);
      pxDot(this.ctx, b.x, b.y, 1, b.enemy ? "#ff5a4a" : "#a5f7ff", PX);
    }
  }

  private drawBooms() {
    const ctx = this.ctx;
    for (const b of this.booms) {
      const dur = b.big ? 0.55 : 0.3;
      const k = b.t / dur;
      const r = (b.big ? 26 : 11) * (0.35 + k);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.globalCompositeOperation = "lighter";
      const n = b.big ? 10 : 5;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + k * 2;
        pxDot(
          ctx,
          b.x + Math.cos(ang) * r,
          b.y + Math.sin(ang) * r,
          k < 0.4 ? 3 : 2,
          k < 0.35 ? "#fff3c4" : k < 0.7 ? "#ffb03a" : "#a8360f",
          PX
        );
      }
      pxDot(ctx, b.x, b.y, b.big ? 4 : 3, k < 0.5 ? "#ffffff" : "#ffd23d", PX);
      ctx.restore();
    }
  }
}

export { TANK_NEON };
