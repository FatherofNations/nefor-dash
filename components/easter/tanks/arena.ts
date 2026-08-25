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
const TERRAIN: [string, number, number?, number?][] = [
  [".ob-card", WATER],
  [
    ".banners > .banner, .chips .chip, .sec-head, .rail-pill, .rail-app, .ai-card, .widget, .wg2, .wg3, .m2-card, .feed .filters, .feed .table",
    BRICK,
  ],
  // островки на воде: иконка мелкая, поэтому раздуваем её до трёх клеток
  [".ob-cell .ob-ico, .ob-cell .progress", BRICK, 12, 12],
  // трава должна закрывать подпись целиком, а не половину строки
  [".hello, .chip.luck", FOREST],
  [".ob-cell .ob-txt", FOREST, 10, 0],
  [".tabs", CONCRETE],
  // бетонная полоса задач укорочена с торцов на четыре клетки
  [".tasks-row", CONCRETE, -4 * CELL, 0],
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
  /** прорези в плитке по зазорам вёрстки — насквозь, до самого дашборда */
  seams: Seam[];
}

export interface Seam { x0: number; x1: number; y0: number; y1: number }

interface Box { x: number; y: number; w: number; h: number; kind: number }

function collect(w: number, h: number): Box[] {
  const out: Box[] = [];
  const visible = (el: HTMLElement) =>
    el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  for (const [sel, kind, gx, gy] of TERRAIN) {
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      // скрытые пейны лежат в DOM поверх активного — иначе замуруют пол-карты
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 8) return;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= w || r.top >= h) return;
      const ax = gx ?? 0;
      const ay = gy ?? gx ?? 0;
      out.push({ x: r.left - ax, y: r.top - ay, w: r.width + ax * 2, h: r.height + ay * 2, kind });
    });
  }

  /* Вода в баннере — окном РОВНО ПО ЦЕНТРУ. Раньше она бралась по подписи
     .b-sub, а та прижата влево, и окно съезжало к краю вместо того, чтобы
     стоять в кирпичной рамке. Кладём последней, чтобы легла поверх кирпича. */
  document.querySelectorAll<HTMLElement>(".banners > .banner").forEach((el, i) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 60 || r.height < 40) return;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= w || r.top >= h) return;
    const iw = Math.round(r.width * 0.52);
    const ih = Math.round(r.height * 0.4);
    // у первого баннера окно тянем левее: иначе подпись на карточке обрезается
    const left = i === 0 ? CELL : 0;
    out.push({
      x: r.left + (r.width - iw) / 2 - left, y: r.top + (r.height - ih) / 2,
      w: iw + left, h: ih, kind: WATER,
    });
  });
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

  /* Растеризация в два прохода.
     Первый: границы округляются до ближайшей клетки, поэтому блок покрывается
     целиком — раньше края обгрызались и в баннерах зияли проплешины.
     Второй: там, где в вёрстке между блоками есть зазор, между их клетками
     принудительно оставляем пустую полосу. Без этого соседние баннеры слились
     бы в одну плиту — зазор в 12 px меньше клетки в 24. */
  const gb = boxes.map((b) => {
    // округляем НАРУЖУ: блок должен закрываться целиком, без полоски по краю
    const c0 = Math.floor(b.x / cell);
    const c1 = Math.max(c0, Math.ceil((b.x + b.w) / cell) - 1);
    const r0 = Math.floor(b.y / cell);
    const r1 = Math.max(r0, Math.ceil((b.y + b.h) / cell) - 1);
    return { b, c0, c1, r0, r1 };
  });

  for (const g of gb) {
    for (let r = Math.max(0, g.r0); r <= Math.min(rows - 1, g.r1); r++) {
      for (let c = Math.max(0, g.c0); c <= Math.min(cols - 1, g.c1); c++) {
        const i = r * cols + c;
        kind[i] = g.b.kind;
        mask[i] = g.b.kind === BRICK ? FULL : 0;
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
  if (ct && w - ct.right > cell * 2) {
    column(ct.right + 4, w - 4, 0.02, 0.22);
    column(ct.right + 4, w - 4, 0.26, 0.36);
  }

  /* ── площадка базы ──
     На схеме под базой лёд, и он выходит из-под кирпичного квадрата по бокам.
     Кладём его ДО расчёта связности: центр карточки онбординга — вода, а по
     воде ставить нельзя, и база уехала бы на ближайшую сушу. */
  const obc = rectOf(".ob-card");
  const wishCol = obc ? Math.round((obc.left + obc.width / 2) / cell) : (cols / 2) | 0;
  const wishRow = obc ? Math.round((obc.top + obc.height / 2) / cell) : (rows / 2) | 0;

  /* Лёд держим строго в границах карточки, отступы слева и справа делаем
     одинаковыми до клетки: раньше он вылезал на кирпичную стену сверху, а вода
     по бокам выходила разной ширины. Ширина — треть карточки, как на схеме.
     Границы берём внутрь (ceil сверху, floor снизу), чтобы не задеть стену. */
  let iceC0 = wishCol - 6;
  let iceC1 = wishCol + 6;
  let iceR0 = wishRow - 4;
  let iceR1 = wishRow + 4;
  if (obc) {
    const cardC0 = Math.ceil(obc.left / cell);
    const cardC1 = Math.floor(obc.right / cell) - 1;
    const cardW = cardC1 - cardC0 + 1;
    const want = Math.max(COLLAR * 2 + 7, Math.round(cardW / 3));
    const pad = Math.max(0, Math.floor((cardW - want) / 2));
    iceC0 = cardC0 + pad;
    iceC1 = cardC1 - pad;
    /* По вертикали лёд идёт во всю высоту карточки — ровно так на схеме.
       Зажимать его внутрь нельзя: вокруг двора остаётся водяной ободок, двор
       отрезается от остальной карты, и ни база туда не сядет, ни танк оттуда
       не выедет. Сверху двор упирается в кирпичную стену, а её простреливают. */
    iceR0 = Math.floor(obc.top / cell);
    iceR1 = Math.ceil(obc.bottom / cell) - 1;
  }
  /* База по центру двора, но не выше, чем нужно: над её воротником должно
     остаться два ряда под пятачок игрока, иначе он оказывается замурован в
     собственной стене. Снизу воротник тоже держим внутри двора. */
  // делитель без поправки: двор нечётной ширины, и так база стоит ровнее
  const baseWishCol = (iceC0 + iceC1) >> 1;
  const baseWishRow = Math.min(
    Math.max(iceR1 - COLLAR - 1, iceR0),
    Math.max((iceR0 + iceR1 - 1) >> 1, iceR0 + COLLAR + 2)
  );
  for (let y = Math.max(1, iceR0); y <= Math.min(rows - 2, iceR1); y++) {
    for (let x = Math.max(1, iceC0); x <= Math.min(cols - 2, iceC1); x++) {
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
  const noBrick = (c: number, r: number) => {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) if (kind[(r + dy) * cols + c + dx] === BRICK) return false;
    }
    return true;
  };
  /* Сначала ищем место на чистой земле и только потом — где придётся. Иначе
     выезд врага мог попасть в середину баннера и выгрызть в нём дыру. */
  const spotNear = (
    col: number, row: number,
    skip?: (c: number, r: number) => boolean, clean = true
  ): number => {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (comp[i] !== field) continue;
      if (skip && skip(i % cols, (i / cols) | 0)) continue;
      if (clean && !noBrick(i % cols, (i / cols) | 0)) continue;
      const dc = (i % cols) - col;
      const dr = ((i / cols) | 0) - row;
      const d = dc * dc + dr * dr;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) return best;
    if (clean) return spotNear(col, row, skip, false);
    // вырожденный случай: свободных стоянок нет вовсе — расчищаем принудительно
    const c = Math.max(1, Math.min(cols - 3, col));
    const r = Math.max(1, Math.min(rows - 3, row));
    return r * cols + c;
  };

  /* ── база, игрок над ней, выезды по схеме ──
     База стоит в середине карточки онбординга — как нарисовано: по центру
     контента и в нижней трети. Если карточки нет (узкое окно, другой таб),
     падаем на центр экрана. */
  /* Двор гарантированно проезжий, поэтому базу ставим прямо в вычисленную
     точку. spotNear нужен только когда карточки онбординга нет вовсе. */
  const base = obc
    ? Math.max(0, Math.min(n - 1, baseWishRow * cols + baseWishCol))
    : spotNear(baseWishCol, baseWishRow);
  const baseCol = base % cols;
  const baseRow = (base / cols) | 0;

  /* Пятачок выезда не должен задевать воротник базы. Воротник кладётся заново
     при рестарте и от лопаты — и тогда он замуровал бы стоящего вплотную. */
  const inCollar = (c: number, r: number) =>
    c + 1 >= baseCol - COLLAR && c <= baseCol + COLLAR + 1 &&
    r + 1 >= baseRow - COLLAR && r <= baseRow + COLLAR + 1;

  // игрок встаёт на лёд внутри двора, а не в стене: стена должна быть сплошной
  const playerSpawn = Math.max(0, Math.min(n - 1,
    Math.max(iceR0, baseRow - COLLAR - 2) * cols + baseCol));
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

  // игрок стоит на льду, а не на голой земле
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const x = (playerSpawn % cols) + dx;
      const y = ((playerSpawn / cols) | 0) + dy;
      if (x < cols && y < rows) set(y * cols + x, ICE);
    }
  }

  /* Стена перед двором: над льдом её сносим, над водой оставляем. Иначе
     игрок заперт в собственном дворе и выезжать ему приходится прострелом. */
  for (let y = Math.max(0, iceR0 - 3); y < iceR0; y++) {
    for (let x = Math.max(0, iceC0); x <= Math.min(cols - 1, iceC1); x++) {
      if (kind[y * cols + x] === BRICK) set(y * cols + x, EMPTY);
    }
  }

  /* ── прорези ──
     Зазор между соседними блоками в вёрстке — 12 px, а клетка карты 24: пустой
     колонкой его не выразить. Поэтому блоки кроются целиком, а зазор режется
     прямо в плитке насквозь, по своей настоящей ширине.

     Длина прорези считается по СЕТКЕ, а не по прямоугольникам из вёрстки.
     Плитка выходит за края блока на пол-клетки, и прорезь по краям блоков
     оказывалась короче кирпича — сверху и снизу оставались перемычки, и
     баннеры всё равно висели сцепленными. */
  const seams: Seam[] = [];
  const dense = (k: number) => k === BRICK || k === FOREST;
  /** Прорезь посреди водяной плиты должна остаться водой, а не дыркой в карте. */
  const onWater = (px: number, py: number) =>
    boxes.some((b) => b.kind === WATER && px > b.x && px < b.x + b.w && py > b.y && py < b.y + b.h);
  /* На воде не режем пиксели, а заливаем КЛЕТКИ целиком. Прорезь шла по зазору
     из вёрстки, а плитка выходит за габарит блока на пол-клетки — по краям
     оставались кирпичные огрызки. Клетками выходит ровно, и танк сквозь такую
     воду не проедет, как и положено. */
  const floodWater = (px0: number, px1: number, py0: number, py1: number) => {
    const c0 = Math.floor(px0 / cell);
    const c1 = Math.ceil(px1 / cell) - 1;
    const r0 = Math.floor(py0 / cell);
    const r1 = Math.ceil(py1 / cell) - 1;
    for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) set(r * cols + c, WATER);
    }
  };
  const merges = (px: number, py: number, ka: number, kb: number) => {
    const c = Math.floor(px / cell);
    const r = Math.floor(py / cell);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
    const k = kind[r * cols + c];
    return k === ka || k === kb;
  };
  for (const A of gb) {
    if (!dense(A.b.kind)) continue;
    for (const B of gb) {
      if (A === B || !dense(B.b.kind)) continue;
      const gapX = B.b.x - (A.b.x + A.b.w);
      if (gapX > 0 && gapX <= cell && A.r1 >= B.r0 && B.r1 >= A.r0) {
        const y0 = Math.min(A.r0, B.r0) * cell;
        const y1 = (Math.max(A.r1, B.r1) + 1) * cell;
        const mx = A.b.x + A.b.w + gapX / 2;
        if (merges(mx, (y0 + y1) / 2, A.b.kind, B.b.kind)) {
          if (onWater(mx, (y0 + y1) / 2)) floodWater(A.b.x + A.b.w, B.b.x, y0, y1);
          else seams.push({ x0: A.b.x + A.b.w, x1: B.b.x, y0, y1 });
        }
      }
      const gapY = B.b.y - (A.b.y + A.b.h);
      if (gapY > 0 && gapY <= cell && A.c1 >= B.c0 && B.c1 >= A.c0) {
        const x0 = Math.min(A.c0, B.c0) * cell;
        const x1 = (Math.max(A.c1, B.c1) + 1) * cell;
        const my = A.b.y + A.b.h + gapY / 2;
        if (merges((x0 + x1) / 2, my, A.b.kind, B.b.kind)) {
          if (onWater((x0 + x1) / 2, my)) floodWater(x0, x1, A.b.y + A.b.h, B.b.y);
          else seams.push({ x0, x1, y0: A.b.y + A.b.h, y1: B.b.y });
        }
      }
    }
  }

  return {
    cell, cols, rows, w, h, kind, mask, seams,
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
