/* ═══ Карта «Броневика» — это сам дашборд ═══
   Каждый блок вёрстки становится своим типом местности, и типы намеренно
   перемешаны: сайдбар не должен быть одной сплошной бетонной плитой, иначе
   пол-экрана превращается в мёртвую зону. Логотип и бургер — бетон, иконки
   счетов и карточки — кирпич, поиск и промо — вода, онбординг — лёд.

   Кирпич хранится ЧЕТВЕРТЯМИ: попадание сносит две со стороны выстрела, и из
   этого получается характерное прогрызание стены сегмент за сегментом. */

/* Клетка крупная нарочно: на 16 px карта расползалась в пустое поле, по
   которому нечего обходить. Танк по-прежнему ровно 2×2 клетки. */
export const CELL = 24;

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

/* Раскладка дашборда → местность, по схеме от дизайнера.
   Порядок важен: что ниже, то и побеждает при наложении. Поэтому крупная плита
   объявляется раньше своей начинки — карточка онбординга разливается водой, а
   иконки и подписи на ней остаются островками кирпича и травы. Сайдбар взят
   одной бетонной плитой целиком: внутренние .sb-* нарочно не перечислены,
   иначе они разбили бы её на лоскуты. */
const TERRAIN: [string, number][] = [
  [".ob-card", WATER],
  [
    ".banners > .banner, .chips .chip, .sec-head, .rail-pill, .ai-card, .widget, .wg2, .wg3, .m2-card, .ob-cell .ob-ico, .ob-cell .progress, .feed .filters, .feed .table",
    BRICK,
  ],
  [".hello, .chip.luck, .ob-cell .ob-txt", FOREST],
  // строка задач вместе со звёздочкой и «Больше» — одна бетонная полоса
  [".tabs, .tasks-row", CONCRETE],
  // вода внутри кирпичного баннера — окно в стене
  [".banner .b-sub", WATER],
  /* Сайдбар кладём ПОСЛЕДНИМ, чтобы он перекрыл всё, что внутри него лежит:
     иначе любая мелкая карточка в меню выступает кирпичом посреди бетона. */
  [".sidebar", CONCRETE],
];

/** Толщина кирпичного воротника базы в клетках. */
export const COLLAR = 2;

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

export function buildArena(w: number, h: number, reserved: DOMRect[] = []): Arena {
  const cell = CELL;
  const cols = Math.floor(w / cell);
  const rows = Math.floor(h / cell);
  const n = cols * rows;
  const kind = new Uint8Array(n);
  const mask = new Uint8Array(n);
  const boxes = collect(w, h);

  /* Блок забирает только те клетки, что укладываются в него ЦЕЛИКОМ.
     Раньше клетка красилась по своему центру, и зазор в 12 px между соседними
     баннерами при клетке в 24 px центра не содержал — соседи сливались в одну
     плиту, причём то сливались, то нет, в зависимости от того, куда попала
     сетка. Так границы стоят ровно всегда. */
  for (const b of boxes) {
    let c0 = Math.ceil(b.x / cell);
    let c1 = Math.floor((b.x + b.w) / cell) - 1;
    let r0 = Math.ceil(b.y / cell);
    let r1 = Math.floor((b.y + b.h) / cell) - 1;
    // мелочь, в которую не влезает ни одной целой клетки, берёт свою серединную
    if (c1 < c0) c0 = c1 = Math.floor((b.x + b.w / 2) / cell);
    if (r1 < r0) r0 = r1 = Math.floor((b.y + b.h / 2) / cell);
    for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
        const i = r * cols + c;
        kind[i] = b.kind;
        mask[i] = b.kind === BRICK ? FULL : 0;
      }
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

  /* ── кладки в пустых полях ──
     На схеме между сайдбаром и контентом и справа от контента стоят кирпичные
     колонны: без них поля по краям — голый асфальт, где нечего обходить.
     Считаем зазоры по факту вёрстки, чтобы это работало на любом окне. */
  const column = (x0: number, x1: number, yf0: number, yf1: number) => {
    const c0 = Math.ceil(x0 / cell);
    const c1 = Math.floor(x1 / cell);
    if (c1 - c0 < 2) return;
    const wid = Math.min(3, c1 - c0);
    const cx = c0 + (((c1 - c0 - wid) / 2) | 0);
    for (let r = Math.round(rows * yf0); r < Math.round(rows * yf1); r++) {
      if (r < 1 || r >= rows - 1) continue;
      for (let x = cx; x < cx + wid; x++) if (kind[r * cols + x] === EMPTY) set(r * cols + x, BRICK);
    }
  };
  const rectOf = (sel: string) => {
    const el = document.querySelector<HTMLElement>(sel);
    return el ? el.getBoundingClientRect() : null;
  };
  const sb = rectOf(".sidebar");
  const ct = rectOf(".content");
  if (sb && ct && ct.left - sb.right > cell * 2) {
    column(sb.right + 4, ct.left - 4, 0.02, 0.22);
    column(sb.right + 4, ct.left - 4, 0.26, 0.36);
  }

  /* ── площадка базы ──
     На схеме под базой лёд, и он выходит из-под кирпичного квадрата по бокам.
     Кладём его ДО расчёта связности: центр карточки онбординга — вода, а по
     воде ставить нельзя, и база уехала бы на ближайшую сушу. */
  const obc = rectOf(".ob-card");
  const wishCol = obc ? Math.round((obc.left + obc.width / 2) / cell) : (cols / 2) | 0;
  const wishRow = obc ? Math.round((obc.top + obc.height / 2) / cell) : (rows / 2) | 0;
  for (let dy = -COLLAR - 4; dy <= COLLAR + 3; dy++) {
    for (let dx = -COLLAR - 7; dx <= COLLAR + 8; dx++) {
      const x = wishCol + dx;
      const y = wishRow + dy;
      if (x < 1 || y < 1 || x >= cols - 1 || y >= rows - 1) continue;
      // стелем поверх всего, кроме бетона: на схеме середина нижней полосы —
      // чистый лёд, островки остались только в боковых водяных третях
      if (kind[y * cols + x] === CONCRETE) continue;
      set(y * cols + x, ICE);
    }
  }

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
        // кирпич преградой не считаем: он простреливается, а вода и бетон — нет
        if (k === CONCRETE || k === WATER) return false;
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

  /** Ближайшая к желаемому месту стоянка на главном поле, мимо запретной зоны. */
  const spotNear = (col: number, row: number, skip?: (c: number, r: number) => boolean) => {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (comp[i] !== field) continue;
      if (skip && skip(i % cols, (i / cols) | 0)) continue;
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

  /* ── база, игрок над ней, выезды по схеме ──
     База стоит в середине карточки онбординга — как нарисовано: по центру
     контента и в нижней трети. Если карточки нет (узкое окно, другой таб),
     падаем на центр экрана. */
  const base = spotNear(wishCol, wishRow);
  const baseCol = base % cols;
  const baseRow = (base / cols) | 0;

  /* Пятачок выезда не должен задевать воротник базы. Воротник кладётся заново
     при рестарте и от лопаты — и тогда он замуровал бы стоящего вплотную. */
  const inCollar = (c: number, r: number) =>
    c + 1 >= baseCol - COLLAR && c <= baseCol + COLLAR + 1 &&
    r + 1 >= baseRow - COLLAR && r <= baseRow + COLLAR + 1;

  const playerSpawn = spotNear(baseCol, baseRow - COLLAR - 3, inCollar);
  // семь точек выезда, доли взяты со схемы: верх, оба поля и середина
  const enemySpawns = ([
    [0.32, 0.07], [0.89, 0.07], [0.39, 0.19], [0.82, 0.19],
    [0.24, 0.39], [0.60, 0.41], [0.96, 0.39],
  ] as [number, number][]).map(([fx, fy]) =>
    spotNear(Math.round(cols * fx), Math.round(rows * fy), inCollar));

  for (const i of [base, playerSpawn, ...enemySpawns]) clear2x2(i);

  /* Кирпичный воротник базы — его же лопата превращает в бетон. Пятачки выезда
     сюда не заходят по построению, так что класть можно без оглядки. */
  for (let dy = -COLLAR; dy <= COLLAR + 1; dy++) {
    for (let dx = -COLLAR; dx <= COLLAR + 1; dx++) {
      if (dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1) continue;
      const x = baseCol + dx;
      const y = baseRow + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      set(y * cols + x, BRICK);
    }
  }

  /* Бетонная затычка над пятачком игрока — на схеме серый кусок в кирпичной
     стене ровно над жёлтым квадратом: укрытие на старте. */
  {
    const pc = playerSpawn % cols;
    const pr = (playerSpawn / cols) | 0;
    for (let x = pc; x <= pc + 1; x++) {
      const y = pr - 1;
      if (y < 0 || x >= cols) continue;
      if (kind[y * cols + x] === BRICK) set(y * cols + x, CONCRETE);
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
  for (let dy = -COLLAR; dy <= COLLAR + 1; dy++) {
    for (let dx = -COLLAR; dx <= COLLAR + 1; dx++) {
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
