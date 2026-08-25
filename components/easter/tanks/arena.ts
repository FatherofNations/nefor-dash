/* ═══ Карта «Броневика» — это сам дашборд ═══
   Каждый блок вёрстки становится своим типом местности, и типы намеренно
   перемешаны: сайдбар не должен быть одной сплошной бетонной плитой, иначе
   пол-экрана превращается в мёртвую зону. Логотип и бургер — бетон, иконки
   счетов и карточки — кирпич, поиск и промо — вода, онбординг — лёд.

   Кирпич хранится ЧЕТВЕРТЯМИ: попадание сносит две со стороны выстрела, и из
   этого получается характерное прогрызание стены сегмент за сегментом. */

export const CELL = 16;

export const EMPTY = 0;
export const BRICK = 1;
export const CONCRETE = 2;
export const WATER = 3;
export const ICE = 4;
export const FOREST = 5;

export const TL = 1;
export const TR = 2;
export const BL = 4;
export const BR = 8;
export const FULL = TL | TR | BL | BR;

/* Раскладка дашборда → местность. Порядок важен: что ниже, то и побеждает при
   наложении, поэтому бетон объявлен последним. */
const TERRAIN: [string, number][] = [
  [".ob-card", ICE],
  [".feed .table, .tasks-row .tasks-line, .hello", FOREST],
  [".feed .filters, .sb-search, .sec-head, .sb2-promo", WATER],
  [
    ".banners > .banner, .chips .chip, .sb2-card, .ai-card, .sb-mi, .sb-ico, .widget, .wg2, .wg3, .m2-card",
    BRICK,
  ],
  [".tabs, .rail-pill, .sb-logo, .sb-burger, .sb-toggle, .m2-stack", CONCRETE],
];

export interface Arena {
  cell: number;
  cols: number;
  rows: number;
  w: number;
  h: number;
  kind: Uint8Array;
  mask: Uint8Array;
  /** база: левая-верхняя клетка блока 2×2 */
  base: number;
  baseAlive: boolean;
  /** во что превращён воротник базы: кирпич или бетон (лопата) */
  baseWall: number;
  playerSpawn: number;
  enemySpawns: number[];
}

interface Box { x: number; y: number; w: number; h: number; kind: number }

function collect(w: number, h: number): Box[] {
  const out: Box[] = [];
  for (const [sel, kind] of TERRAIN) {
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      // скрытые пейны лежат в DOM поверх активного — иначе замуруют пол-карты
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 8) return;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= w || r.top >= h) return;
      out.push({ x: r.left, y: r.top, w: r.width, h: r.height, kind });
    });
  }
  return out;
}

const hits = (b: Box, x: number, y: number) =>
  x > b.x - 2 && x < b.x + b.w + 2 && y > b.y - 2 && y < b.y + b.h + 2;

export function buildArena(w: number, h: number, reserved: DOMRect[] = []): Arena {
  const cell = CELL;
  const cols = Math.floor(w / cell);
  const rows = Math.floor(h / cell);
  const n = cols * rows;
  const kind = new Uint8Array(n);
  const mask = new Uint8Array(n);
  const boxes = collect(w, h);

  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const i = ry * cols + rx;
      const cx = rx * cell + cell / 2;
      const cy = ry * cell + cell / 2;
      for (const b of boxes) if (hits(b, cx, cy)) kind[i] = b.kind;
      if (kind[i] === BRICK) mask[i] = FULL;
    }
  }

  // панели интерфейса игры вырезаем из карты целиком
  for (const r of reserved) {
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const cx = rx * cell + cell / 2;
        const cy = ry * cell + cell / 2;
        if (cx > r.left && cx < r.right && cy > r.top && cy < r.bottom) {
          kind[ry * cols + rx] = CONCRETE;
          mask[ry * cols + rx] = 0;
        }
      }
    }
  }

  const set = (i: number, k: number) => {
    if (i < 0 || i >= n) return;
    kind[i] = k;
    mask[i] = k === BRICK ? FULL : 0;
  };
  const clear2x2 = (i: number) => {
    const c = i % cols;
    const r = (i / cols) | 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set((r + dy) * cols + c + dx, EMPTY);
  };

  /* ── связность ──
     Танк занимает 2×2 клетки, поэтому считаем не проходимость клеток, а
     «стоянки»: позиция годна, если свободны все четыре клетки под корпусом.
     Раскладка дашборда каждый раз разная, и при узком окне полоса воды легко
     замыкает пятачок у нижнего края. Танк, поставленный в такой карман, не
     сдвинется до конца партии: воду не пробить и не объехать. Поэтому база,
     игрок и точки выезда садятся только в самую большую связную область. */
  const canStand = (c: number, r: number) => {
    if (c < 0 || r < 0 || c + 1 >= cols || r + 1 >= rows) return false;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const k = kind[(r + dy) * cols + c + dx];
        if (k === CONCRETE || k === WATER || k === BRICK) return false;
      }
    }
    return true;
  };

  const comp = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      if (comp[r * cols + c] !== -1 || !canStand(c, r)) continue;
      const id = sizes.length;
      let size = 0;
      comp[r * cols + c] = id;
      stack.push(r * cols + c);
      while (stack.length) {
        const i = stack.pop()!;
        size++;
        const cc = i % cols;
        const rr = (i / cols) | 0;
        const nb: [number, number][] = [[cc - 1, rr], [cc + 1, rr], [cc, rr - 1], [cc, rr + 1]];
        for (const [nc, nr] of nb) {
          if (nc < 0 || nr < 0 || nc + 1 >= cols || nr + 1 >= rows) continue;
          const j = nr * cols + nc;
          if (comp[j] !== -1 || !canStand(nc, nr)) continue;
          comp[j] = id;
          stack.push(j);
        }
      }
      sizes.push(size);
    }
  }
  let field = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[field]) field = i;

  /** Ближайшая к желаемому месту стоянка на главном поле. */
  const spotNear = (col: number, row: number) => {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (comp[i] !== field) continue;
      const dc = (i % cols) - col;
      const dr = ((i / cols) | 0) - row;
      const d = dc * dc + dr * dr;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) return best;
    // вырожденный случай: свободных стоянок нет вовсе — расчищаем принудительно
    const c = Math.max(1, Math.min(cols - 3, col));
    const r = Math.max(1, Math.min(rows - 3, row));
    return r * cols + c;
  };

  /* ── база внизу по центру, игрок слева от неё, враги приходят сверху ── */
  const base = spotNear(Math.floor(cols / 2) - 1, rows - 4);
  const baseCol = base % cols;
  const baseRow = (base / cols) | 0;
  const playerSpawn = spotNear(baseCol - 4, baseRow);
  const enemySpawns = [
    spotNear(2, 1),
    spotNear(Math.floor(cols / 2) - 1, 1),
    spotNear(cols - 4, 1),
  ];

  for (const i of [base, playerSpawn, ...enemySpawns]) clear2x2(i);

  /* Кирпичный воротник базы — его же лопата превращает в бетон. Кладём его
     последним и не трогаем пятачки выезда, иначе можно замуровать спавн. */
  const pads = [playerSpawn, ...enemySpawns].map((i) => [i % cols, (i / cols) | 0]);
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -1; dx <= 2; dx++) {
      if (dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1) continue;
      const x = baseCol + dx;
      const y = baseRow + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      if (pads.some(([pc, pr]) => x >= pc && x <= pc + 1 && y >= pr && y <= pr + 1)) continue;
      set(y * cols + x, BRICK);
    }
  }

  return {
    cell, cols, rows, w, h, kind, mask,
    base, baseAlive: true, baseWall: BRICK,
    playerSpawn, enemySpawns,
  };
}

/** Проезжая ли клетка: вода и бетон держат, лес и лёд — нет. */
export function drivable(a: Arena, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= a.cols || row >= a.rows) return false;
  const i = row * a.cols + col;
  const k = a.kind[i];
  if (k === CONCRETE || k === WATER) return false;
  if (k === BRICK) return a.mask[i] === 0;
  return true;
}

/** Пролетит ли снаряд: над водой и лесом — да, сквозь стены — нет. */
export function shootable(a: Arena, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= a.cols || row >= a.rows) return false;
  const i = row * a.cols + col;
  const k = a.kind[i];
  if (k === CONCRETE) return false;
  if (k === BRICK) return a.mask[i] === 0;
  return true;
}

/** Скользкая ли клетка — по льду танк несёт по инерции. */
export function slippery(a: Arena, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= a.cols || row >= a.rows) return false;
  return a.kind[row * a.cols + col] === ICE;
}

export function isForest(a: Arena, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= a.cols || row >= a.rows) return false;
  return a.kind[row * a.cols + col] === FOREST;
}

/**
 * Попадание в стену.
 * @param power 1 — обычный снаряд, 2+ — усиленный (берёт бетон)
 * @returns что разрушено: "brick" | "concrete" | "none"
 */
export function damage(
  a: Arena,
  col: number,
  row: number,
  dx: number,
  dy: number,
  power: number
): "brick" | "concrete" | "none" {
  if (col < 0 || row < 0 || col >= a.cols || row >= a.rows) return "none";
  const i = row * a.cols + col;
  if (a.kind[i] === CONCRETE) {
    if (power < 3) return "none"; // обычный снаряд бетон не берёт
    a.kind[i] = EMPTY;
    return "concrete";
  }
  if (a.kind[i] !== BRICK || a.mask[i] === 0) return "none";
  // сносим две четверти со стороны выстрела — сегменты живут отдельно
  let off = 0;
  if (dx > 0) off = TL | BL;
  else if (dx < 0) off = TR | BR;
  else if (dy > 0) off = TL | TR;
  else off = BL | BR;
  const before = a.mask[i];
  a.mask[i] &= ~off;
  // усиленный снаряд валит клетку целиком, обычный доедает остаток
  if (power >= 2 || a.mask[i] === before) a.mask[i] = 0;
  return "brick";
}

/** Лопата: воротник базы на время становится бетонным. */
export function setBaseWall(a: Arena, k: number) {
  a.baseWall = k;
  const c = a.base % a.cols;
  const r = (a.base / a.cols) | 0;
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -1; dx <= 2; dx++) {
      if (dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1) continue;
      const x = c + dx;
      const y = r + dy;
      if (x < 0 || y < 0 || x >= a.cols || y >= a.rows) continue;
      const i = y * a.cols + x;
      // восстанавливаем только то, что и было стеной, — дыры в полу не лепим
      if (a.kind[i] === EMPTY && k === BRICK) continue;
      a.kind[i] = k;
      a.mask[i] = k === BRICK ? FULL : 0;
    }
  }
}
