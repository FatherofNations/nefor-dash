/* ═══ Арена «Броневика» собирается из живого дашборда ═══
   Блоки вёрстки становятся местностью: рекламные карточки — кирпич, который
   можно прострелить; сайдбар, табы и кружки — сталь, её снаряд не берёт;
   лента операций — кусты, сквозь них ездят и стреляют, но танк в них не видно.
   Всё остальное — свободная земля.

   Кирпич хранится четвертями, как в жанре и положено: попадание сносит две
   четверти со стороны выстрела, а не всю клетку. Из этого и получается
   характерное «прогрызание» стены. */

export const CELL = 16;

export const EMPTY = 0;
export const BRICK = 1;
export const STEEL = 2;
export const TREES = 3;

/** биты четвертей кирпичной клетки */
export const TL = 1;
export const TR = 2;
export const BL = 4;
export const BR = 8;
export const FULL = TL | TR | BL | BR;

const BRICK_SEL = [
  ".banners > .banner",
  ".chips .chip",
  ".hello",
  ".tasks-row .tasks-line",
  ".widgets .widget",
  ".widgets2 .wg2",
  ".widgets3 .wg3",
  ".m2-card",
].join(",");
const STEEL_SEL = [".sidebar", ".tabs", ".rail-pill", ".m2-stack"].join(",");
/* Кусты должны попадать в видимый кадр, иначе механика «в зарослях танка не
   видно» просто не показывается: лента операций лежит ниже сгиба. Крупная
   карточка онбординга для этого подходит лучше всего. */
const TREES_SEL = [".ob-card", ".feed .table", ".feed .filters", ".sb2-promo"].join(",");

/** Плашка баланса: возле неё стоит хранилище, его и защищаем. */
export const VAULT_SEL = ".sidebar .sb-amt";

export interface Arena {
  cell: number;
  cols: number;
  rows: number;
  w: number;
  h: number;
  /** тип местности в клетке */
  kind: Uint8Array;
  /** уцелевшие четверти кирпича */
  mask: Uint8Array;
  /** хранилище: левая-верхняя клетка блока 2×2 */
  vault: number;
  vaultAlive: boolean;
  /** откуда выезжает игрок и откуда лезут враги */
  playerSpawn: number;
  enemySpawns: number[];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: number;
}

function boxes(sel: string, kind: number, w: number, h: number): Box[] {
  const out: Box[] = [];
  document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
    // скрытые пейны лежат в DOM поверх активного — без проверки они бы
    // замуровали пол-арены невидимой стеной
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
    const r = el.getBoundingClientRect();
    if (r.width < 12 || r.height < 10) return;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= w || r.top >= h) return;
    out.push({ x: r.left, y: r.top, w: r.width, h: r.height, kind });
  });
  return out;
}

const inside = (b: Box, x: number, y: number) =>
  x > b.x - 2 && x < b.x + b.w + 2 && y > b.y - 2 && y < b.y + b.h + 2;

export function buildArena(w: number, h: number, reserved: DOMRect[] = []): Arena {
  const cell = CELL;
  const cols = Math.floor(w / cell);
  const rows = Math.floor(h / cell);
  const n = cols * rows;
  const kind = new Uint8Array(n);
  const mask = new Uint8Array(n);

  /* Сталь кладём последней: если карточка попала и в кирпич, и в сталь
     (например, чипса поверх сайдбара), выигрывает несокрушимое — иначе
     сквозь сайдбар можно было бы прогрызть дыру. */
  const all = [
    ...boxes(TREES_SEL, TREES, w, h),
    ...boxes(BRICK_SEL, BRICK, w, h),
    ...boxes(STEEL_SEL, STEEL, w, h),
  ];

  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const i = ry * cols + rx;
      const cx = rx * cell + cell / 2;
      const cy = ry * cell + cell / 2;
      for (const b of all) if (inside(b, cx, cy)) kind[i] = b.kind;
      if (kind[i] === BRICK) mask[i] = FULL;
    }
  }

  // панели интерфейса игры — просто пустая земля, ездить под ними незачем
  for (const r of reserved) {
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const cx = rx * cell + cell / 2;
        const cy = ry * cell + cell / 2;
        if (cx > r.left && cx < r.right && cy > r.top && cy < r.bottom) {
          const i = ry * cols + rx;
          kind[i] = STEEL;
          mask[i] = 0;
        }
      }
    }
  }

  /* ── хранилище: свободная площадка 2×2 у плашки баланса ── */
  const vr = document.querySelector<HTMLElement>(VAULT_SEL)?.getBoundingClientRect();
  const wantX = vr ? vr.right + 46 : 360;
  const wantY = vr ? vr.top + vr.height / 2 : 140;
  let vault = -1;
  let best = Infinity;
  for (let ry = 1; ry < rows - 3; ry++) {
    for (let rx = 1; rx < cols - 3; rx++) {
      const i = ry * cols + rx;
      if (kind[i] === STEEL || kind[i + 1] === STEEL) continue;
      if (kind[i + cols] === STEEL || kind[i + cols + 1] === STEEL) continue;
      const d = Math.hypot(rx * cell - wantX, ry * cell - wantY);
      if (d < best) {
        best = d;
        vault = i;
      }
    }
  }
  if (vault < 0) vault = Math.floor(rows / 2) * cols + 2;

  // площадку расчищаем, а вокруг ставим кирпичный воротник — как в жанре
  const clear = (i: number) => {
    kind[i] = EMPTY;
    mask[i] = 0;
  };
  const vc = vault % cols;
  const vrw = (vault / cols) | 0;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) clear((vrw + dy) * cols + vc + dx);
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -1; dx <= 2; dx++) {
      if (dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1) continue;
      const x = vc + dx;
      const y = vrw + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const i = y * cols + x;
      if (kind[i] === STEEL) continue;
      kind[i] = BRICK;
      mask[i] = FULL;
    }
  }

  /* ── места появления ── */
  const free = (i: number) =>
    i >= 0 && i < n && (kind[i] === EMPTY || kind[i] === TREES) && mask[i] === 0;
  const freeSpot = (fromX: number, fromY: number) => {
    let bi = -1;
    let bd = Infinity;
    for (let ry = 0; ry < rows - 1; ry++) {
      for (let rx = 0; rx < cols - 1; rx++) {
        const i = ry * cols + rx;
        if (!free(i) || !free(i + 1) || !free(i + cols) || !free(i + cols + 1)) continue;
        const d = Math.hypot(rx * cell - fromX, ry * cell - fromY);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
    }
    return bi;
  };

  const playerSpawn = freeSpot(vc * cell + 90, vrw * cell + 70);
  const enemySpawns = [
    freeSpot(w - 60, 60),
    freeSpot(w * 0.62, 40),
    freeSpot(w - 60, h * 0.55),
  ].filter((i) => i >= 0);

  return {
    cell,
    cols,
    rows,
    w,
    h,
    kind,
    mask,
    vault,
    vaultAlive: true,
    playerSpawn: playerSpawn >= 0 ? playerSpawn : vault + 4,
    enemySpawns: enemySpawns.length ? enemySpawns : [cols - 4],
  };
}

/** Можно ли въехать в клетку (кусты проезжие, разбитый кирпич тоже). */
export function drivable(a: Arena, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= a.cols || row >= a.rows) return false;
  const i = row * a.cols + col;
  const k = a.kind[i];
  if (k === STEEL) return false;
  if (k === BRICK) return a.mask[i] === 0;
  return true;
}

/** Летит ли снаряд сквозь клетку (кусты — да, кирпич и сталь — нет). */
export function shootable(a: Arena, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= a.cols || row >= a.rows) return false;
  const i = row * a.cols + col;
  const k = a.kind[i];
  if (k === STEEL) return false;
  if (k === BRICK) return a.mask[i] === 0;
  return true;
}

/** Снести четверти кирпича со стороны, откуда прилетело. @returns попали ли */
export function hitBrick(a: Arena, col: number, row: number, dx: number, dy: number): boolean {
  if (col < 0 || row < 0 || col >= a.cols || row >= a.rows) return false;
  const i = row * a.cols + col;
  if (a.kind[i] !== BRICK || a.mask[i] === 0) return false;
  let off = 0;
  if (dx > 0) off = TL | BL;
  else if (dx < 0) off = TR | BR;
  else if (dy > 0) off = TL | TR;
  else off = BL | BR;
  const before = a.mask[i];
  a.mask[i] &= ~off;
  // упёрлись в остаток — добиваем клетку, иначе снаряды вязли бы в огрызке
  if (a.mask[i] === before) a.mask[i] = 0;
  return true;
}
