/* ═══ Поле боя строится из настоящего дашборда ═══
   «Здания» — это реальные блоки вёрстки (сайдбар, табы, баннеры, карточки,
   виджеты): на их крышах ставятся башни. «Улицы» — зазоры между блоками, по
   ним бегут враги. Маршруты считаются Дейкстрой от ядра (баланс в сайдбаре)
   к точкам входа у правого края, с надбавкой за клетки впритык к стене — иначе
   путь липнет к углам и спрайты въезжают в карточки. */

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number; // радиус скругления — для неоновой обводки
  /** крыша — на неё можно ставить башни, и только её обводим неоном */
  roof: boolean;
}

export interface Route {
  pts: Pt[];
  /** накопленная длина до каждой точки; последний элемент — вся длина */
  acc: number[];
  len: number;
}

export interface Field {
  cell: number;
  cols: number;
  rows: number;
  w: number;
  h: number;
  /** 1 — здание: враг не проходит */
  blocked: Uint8Array;
  /** места под башни — замощены ВНУТРИ каждой крыши, а не по сетке экрана */
  slots: Slot[];
  routes: Route[];
  core: Pt;
  rects: Rect[];
}

export const CELL = 20;

/* Блоки вёрстки, которые считаем зданиями. Берём именно ЛИСТОВЫЕ карточки, а
   не секции-обёртки: обёртки занимают всю ширину и не оставили бы улиц. */
const BUILDING_SEL = [
  ".sidebar",
  ".rail-pill",
  ".rail .rail-btn",
  ".tabs",
  ".hello",
  ".tasks-row .tasks-line",
  ".chips .chip",
  ".banners .banner",
  ".ob-card",
  ".sec-head",
  ".feed .filters",
  ".feed .table",
  ".widgets .widget",
  ".widgets2 .wg2",
  ".widgets3 .wg3",
  ".m2-stack",
  ".m2-card",
  ".sb2-promo",
].join(",");

/* Крыши под башни — ровно четыре чипсы и три рекламных баннера, ничего больше.
   Остальные блоки остаются зданиями: они формируют улицы, но строить на них
   нельзя. `.banners > .banner` — именно прямые дети: наклонённый красный лежит
   в `.banner-tilt` поверх своей бледной подложки и дал бы дубль слотов. */
const ROOF_SEL = ".banners > .banner, .chips .chip";

/** Ядро — плашка баланса в сайдбаре: до неё враги и рвутся. */
export const CORE_SEL = ".sidebar .sb-amt";

/** Сторона слота под башню, px. */
export const SLOT_PX = 40;

export interface Slot {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/* ── сбор прямоугольников зданий из DOM ── */
function collectRects(w: number, h: number): Rect[] {
  const out: Rect[] = [];
  document.querySelectorAll<HTMLElement>(BUILDING_SEL).forEach((el) => {
    // скрытые пейны (вкладки «Мои продукты» и др.) лежат в DOM поверх активной —
    // без проверки видимости они замуровали бы всё поле
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
    const r = el.getBoundingClientRect();
    if (r.width < 16 || r.height < 12) return;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= w || r.top >= h) return;
    const x = clamp(r.left, 0, w);
    const y = clamp(r.top, 0, h);
    out.push({
      x,
      y,
      w: clamp(r.right, 0, w) - x,
      h: clamp(r.bottom, 0, h) - y,
      r: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
      roof: el.matches(ROOF_SEL),
    });
  });
  return out;
}

/* ── три коридора задаём по вёрстке, а не «как получится» ──
   Дейкстра всегда берёт кратчайший путь, поэтому сама по себе уводит все
   дорожки в верх экрана: низ длиннее. Но играть интереснее, когда враги идут
   тремя разными улицами — над чипсами, между чипсами и баннерами и под
   баннерами. Поэтому высоты входов берём из реальных прямоугольников блоков,
   а не делим правый край поровну. */
function laneRows(h: number): number[] {
  const box = (sel: string) => {
    const els = [...document.querySelectorAll<HTMLElement>(sel)].filter((e) =>
      e.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    );
    if (!els.length) return null;
    const rs = els.map((e) => e.getBoundingClientRect());
    return {
      top: Math.min(...rs.map((r) => r.top)),
      bottom: Math.max(...rs.map((r) => r.bottom)),
    };
  };
  const chips = box(".chips .chip");
  const banners = box(".banners > .banner");
  const out: number[] = [];
  if (chips) out.push(chips.top - 22); // над чипсами
  if (chips && banners) out.push((chips.bottom + banners.top) / 2); // между
  if (banners) out.push(banners.bottom + 32); // под баннерами
  return out.filter((y) => y > EDGE_MARGIN + 8 && y < h - EDGE_MARGIN - 8);
}

/* Слоты замощаются ВНУТРИ крыши от её собственного левого верхнего угла, а
   остаток ширины уходит в поля по краям. Ключевой момент: сетка привязана к
   карточке, а не к экрану — иначе на любой раскладке, где карточка стоит не по
   кратному 40 (а на широком окне контент центрируется и стоит именно так),
   квадраты постройки визуально «съезжают» с карточки. */
function tileRoof(r: Rect, from: number): Slot[] {
  const cols = Math.floor(r.w / SLOT_PX);
  const rows = Math.max(1, Math.floor(r.h / SLOT_PX));
  if (cols < 1) return [];
  const padX = (r.w - cols * SLOT_PX) / 2;
  const padY = (r.h - rows * SLOT_PX) / 2;
  const out: Slot[] = [];
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      out.push({
        id: from + out.length,
        x: r.x + padX + rx * SLOT_PX,
        y: r.y + padY + ry * SLOT_PX,
        w: SLOT_PX,
        h: SLOT_PX,
      });
    }
  }
  return out;
}

/* ── бинарная куча для Дейкстры (сетка маленькая, хватает с запасом) ── */
class Heap {
  private a: number[] = [];
  private k: number[] = [];
  push(cost: number, node: number) {
    this.a.push(cost);
    this.k.push(node);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p] <= this.a[i]) break;
      [this.a[p], this.a[i]] = [this.a[i], this.a[p]];
      [this.k[p], this.k[i]] = [this.k[i], this.k[p]];
      i = p;
    }
  }
  pop(): [number, number] | null {
    if (!this.a.length) return null;
    const cost = this.a[0];
    const node = this.k[0];
    const lc = this.a.pop()!;
    const lk = this.k.pop()!;
    if (this.a.length) {
      this.a[0] = lc;
      this.k[0] = lk;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.a.length && this.a[l] < this.a[m]) m = l;
        if (r < this.a.length && this.a[r] < this.a[m]) m = r;
        if (m === i) break;
        [this.a[m], this.a[i]] = [this.a[i], this.a[m]];
        [this.k[m], this.k[i]] = [this.k[i], this.k[m]];
        i = m;
      }
    }
    return [cost, node];
  }
  get size() {
    return this.a.length;
  }
}

/* ── «натягивание нити»: спрямление клеточного пути ──
   Дейкстра ходит по клеткам, поэтому вдоль прямого коридора она выдаёт
   лесенку из диагоналей и ортогоналей. Чайкин её скругляет, но не выпрямляет —
   дорожка выглядит виляющей. Поэтому сначала выбрасываем все промежуточные
   точки, между которыми есть прямая видимость: остаются только настоящие
   повороты, а Чайкин уже мягко их скругляет. */

/** Свободна ли прямая между точками с запасом `pad` по обе стороны. */
function clearLine(
  a: Pt,
  b: Pt,
  blocked: Uint8Array,
  cols: number,
  rows: number,
  cell: number,
  pad: number
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.max(1, Math.ceil(len / (cell * 0.4)));
  const nx = -dy / len;
  const ny = dx / len;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    // проверяем не только осевую линию, но и обочины — иначе враг срежет угол
    for (const o of [-pad, 0, pad]) {
      const gx = Math.floor((px + nx * o) / cell);
      const gy = Math.floor((py + ny * o) / cell);
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return false;
      if (blocked[gy * cols + gx]) return false;
    }
  }
  return true;
}

function stringPull(
  pts: Pt[],
  blocked: Uint8Array,
  cols: number,
  rows: number,
  cell: number
): Pt[] {
  if (pts.length < 3) return pts;
  const pad = cell * 0.45;
  const out: Pt[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    // тянемся к самой дальней точке, до которой ещё есть прямая видимость
    let j = pts.length - 1;
    for (; j > i + 1; j--) {
      if (clearLine(pts[i], pts[j], blocked, cols, rows, cell, pad)) break;
    }
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/* ── выравнивание по осям ──
   Спрямление оставляет мало точек, но отрезки всё равно идут с лёгким
   наклоном: клетки коридора чуть разной высоты, и «прямой прогон» получается
   на пару десятков пикселей косым. Здесь почти горизонтальные отрезки
   прижимаются к одной высоте, почти вертикальные — к одной абсциссе, и только
   если после сдвига прямая по-прежнему свободна (вместе с соседними). */
function axisSnap(
  pts: Pt[],
  blocked: Uint8Array,
  cols: number,
  rows: number,
  cell: number,
  /* Концы, которые двигать НЕЛЬЗЯ. Выравнивание тянет к общей координате оба
     конца отрезка, и на последнем отрезке это уводило в сторону саму точку
     ядра — дорожка переставала в него приходить. Закреплённый конец остаётся
     на месте, а к его координате подтягивается второй. */
  pinFirst = false,
  pinLast = false
): Pt[] {
  const pad = cell * 0.45;
  const out = pts.map((p) => ({ ...p }));
  const ok = (a: Pt, b: Pt) => clearLine(a, b, blocked, cols, rows, cell, pad);
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i];
    const b = out[i + 1];
    const aPinned = i === 0 && pinFirst;
    const bPinned = i + 1 === out.length - 1 && pinLast;
    if (aPinned && bPinned) continue;
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    const prev = out[i - 1];
    const next = out[i + 2];
    if (dx > dy * 2.5 && dy > 0.5) {
      const y = aPinned ? a.y : bPinned ? b.y : (a.y + b.y) / 2;
      const na = { x: a.x, y };
      const nb = { x: b.x, y };
      if (ok(na, nb) && (!prev || ok(prev, na)) && (!next || ok(nb, next))) {
        if (!aPinned) a.y = y;
        if (!bPinned) b.y = y;
      }
    } else if (dy > dx * 2.5 && dx > 0.5) {
      const x = aPinned ? a.x : bPinned ? b.x : (a.x + b.x) / 2;
      const na = { x, y: a.y };
      const nb = { x, y: b.y };
      if (ok(na, nb) && (!prev || ok(prev, na)) && (!next || ok(nb, next))) {
        if (!aPinned) a.x = x;
        if (!bPinned) b.x = x;
      }
    }
  }
  // после выравнивания соседние отрезки часто ложатся на одну прямую — сливаем
  const merged: Pt[] = [out[0]];
  for (let i = 1; i < out.length - 1; i++) {
    const p = merged[merged.length - 1];
    const v = out[i];
    const nx = out[i + 1];
    const a1 = Math.atan2(v.y - p.y, v.x - p.x);
    const a2 = Math.atan2(nx.y - v.y, nx.x - v.x);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > 0.05) merged.push(v);
  }
  merged.push(out[out.length - 1]);
  return merged;
}

/* ── скругление УГЛОВ (а не всего пути) ──
   Сглаживание Чайкиным тянет к кривой каждую точку и превращает дорожку в
   сплошную дугу. Нам нужны прямые прогоны по коридорам, поэтому трогаем
   только окрестность каждого поворота: отступаем от вершины на радиус в обе
   стороны и вставляем короткую квадратичную вставку. Прямые участки между
   поворотами остаются идеально прямыми. */
const CORNER_R = 15;

function roundCorners(pts: Pt[], r: number): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1];
    const v = pts[i];
    const n = pts[i + 1];
    const d1 = Math.hypot(v.x - p.x, v.y - p.y) || 1;
    const d2 = Math.hypot(n.x - v.x, n.y - v.y) || 1;
    // радиус не больше 45% каждого из смежных отрезков, иначе углы «съедят» их
    const rr = Math.min(r, d1 * 0.45, d2 * 0.45);
    if (rr < 2) {
      out.push(v);
      continue;
    }
    const a = { x: v.x + ((p.x - v.x) / d1) * rr, y: v.y + ((p.y - v.y) / d1) * rr };
    const b = { x: v.x + ((n.x - v.x) / d2) * rr, y: v.y + ((n.y - v.y) / d2) * rr };
    out.push(a);
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      const u = 1 - t;
      out.push({
        x: u * u * a.x + 2 * u * t * v.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * v.y + t * t * b.y,
      });
    }
    out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function measure(pts: Pt[]): Route {
  const acc = [0];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    acc.push(len);
  }
  return { pts, acc, len };
}

/** Точка на маршруте по пройденному расстоянию (с зажимом на концах). */
export function pointAt(route: Route, d: number): Pt {
  const { pts, acc } = route;
  if (d <= 0) return pts[0];
  if (d >= route.len) return pts[pts.length - 1];
  // линейный поиск сегмента: маршруты короткие, бинарный тут ничего не даст
  let i = 1;
  while (i < acc.length - 1 && acc[i] < d) i++;
  const t = (d - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
  return {
    x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
    y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
  };
}

/** Единичная нормаль к маршруту в точке — по ней разводим врагов по полосам. */
export function normalAt(route: Route, d: number): Pt {
  const a = pointAt(route, Math.max(0, d - 6));
  const b = pointAt(route, Math.min(route.len, d + 6));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: -dy / l, y: dx / l };
}

/** Поля сверху и снизу: враг у самой кромки экрана срезался бы наполовину. */
const EDGE_MARGIN = 16;

/**
 * @param reserved зоны интерфейса игры (HUD, колода башен). Они не здания —
 * обводку не получают, но и ходить, и строить там нельзя: иначе враги бегали
 * бы за панелями, а башни прятались под ними.
 */
export function buildField(w: number, h: number, reserved: Rect[] = []): Field {
  const cell = CELL;
  const cols = Math.floor(w / cell);
  const rows = Math.floor(h / cell);
  const n = cols * rows;
  const blocked = new Uint8Array(n);
  const rects = collectRects(w, h);

  const slots: Slot[] = [];
  for (const r of rects) {
    if (!r.roof) continue;
    for (const s of tileRoof(r, slots.length)) slots.push(s);
  }

  /* Клетка «занята», если её центр попал в здание, расширенное на 3px —
     карточки с тенями визуально чуть больше своего rect. */
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const cx = rx * cell + cell / 2;
      const cy = ry * cell + cell / 2;
      const i = ry * cols + rx;
      if (cy < EDGE_MARGIN || cy > h - EDGE_MARGIN) {
        blocked[i] = 1;
        continue;
      }
      let inUi = false;
      for (const r of reserved) {
        if (cx > r.x - 2 && cx < r.x + r.w + 2 && cy > r.y - 2 && cy < r.y + r.h + 2) {
          inUi = true;
          break;
        }
      }
      if (inUi) {
        blocked[i] = 1;
        continue;
      }
      for (const r of rects) {
        if (cx > r.x - 3 && cx < r.x + r.w + 3 && cy > r.y - 3 && cy < r.y + r.h + 3) {
          blocked[i] = 1;
          break;
        }
      }
    }
  }

  /* ── ядро: ближайшая свободная клетка к плашке баланса ── */
  const coreEl = document.querySelector<HTMLElement>(CORE_SEL);
  const cr = coreEl?.getBoundingClientRect();
  const wantX = cr ? cr.right + 26 : 340;
  const wantY = cr ? cr.top + cr.height / 2 : 130;
  let coreIdx = -1;
  let coreBest = Infinity;
  for (let i = 0; i < n; i++) {
    if (blocked[i]) continue;
    const cx = (i % cols) * cell + cell / 2;
    const cy = ((i / cols) | 0) * cell + cell / 2;
    const d = Math.hypot(cx - wantX, cy - wantY);
    if (d < coreBest) {
      coreBest = d;
      coreIdx = i;
    }
  }
  // поле без единой свободной клетки — вырожденный случай, отдаём пустое
  if (coreIdx < 0) {
    return { cell, cols, rows, w, h, blocked, slots, routes: [], core: { x: wantX, y: wantY }, rects };
  }
  const core: Pt = {
    x: (coreIdx % cols) * cell + cell / 2,
    y: ((coreIdx / cols) | 0) * cell + cell / 2,
  };

  /* ── Дейкстра от ядра. Стоимость клетки: 10 обычно, +14 если она касается
        здания — путь сам отходит от стен к середине улицы. Диагональ — 14,
        и только когда свободны оба ортогональных соседа (без срезки углов). */
  const near = new Uint8Array(n);
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const i = ry * cols + rx;
      if (blocked[i]) continue;
      for (let dy = -1; dy <= 1 && !near[i]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = rx + dx;
          const ny = ry + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
            near[i] = 1;
            break;
          }
          if (blocked[ny * cols + nx]) {
            near[i] = 1;
            break;
          }
        }
      }
    }
  }

  const DIRS: [number, number, number][] = [
    [1, 0, 10],
    [-1, 0, 10],
    [0, 1, 10],
    [0, -1, 10],
    [1, 1, 14],
    [1, -1, 14],
    [-1, 1, 14],
    [-1, -1, 14],
  ];

  /* Дейкстра от ядра. Стоимость клетки: 10 обычно, +14 если она касается
     здания (путь сам отходит от стен к середине улицы) и +`used` за клетки,
     уже занятые прежними маршрутами — так следующая дорожка ищет СВОЙ
     коридор, а не повторяет предыдущий. Диагональ — 14, и только когда
     свободны оба ортогональных соседа (без срезки углов). */
  const used = new Int32Array(n);
  const runDijkstra = (from: number) => {
    const dist = new Int32Array(n).fill(-1);
    const heap = new Heap();
    dist[from] = 0;
    heap.push(0, from);
    while (heap.size) {
      const [cost, node] = heap.pop()!;
      if (cost > dist[node]) continue;
      const rx = node % cols;
      const ry = (node / cols) | 0;
      for (const [dx, dy, step] of DIRS) {
        const nx = rx + dx;
        const ny = ry + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (blocked[ni]) continue;
        if (dx && dy && (blocked[ry * cols + nx] || blocked[ny * cols + rx])) continue;
        const nc = cost + step + (near[ni] ? 14 : 0) + used[ni];
        if (dist[ni] < 0 || nc < dist[ni]) {
          dist[ni] = nc;
          heap.push(nc, ni);
        }
      }
    }
    return dist;
  };
  const dist = runDijkstra(coreIdx);

  /** Ближайшая к точке свободная и достижимая клетка. */
  const freeNear = (x: number, y: number, reach: Int32Array) => {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (blocked[i] || reach[i] < 0) continue;
      const cx = (i % cols) * cell + cell / 2;
      const cy = ((i / cols) | 0) * cell + cell / 2;
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  /* ── три дорожки, по одной на коридор ──
     Просто «войти на нужной высоте» мало: справа от контента вся колонка
     свободна, и Дейкстра от нижнего входа сразу уводит путь наверх — там
     короче. Поэтому маршрут собирается из двух отрезков через ПУТЕВУЮ ТОЧКУ
     в середине своего коридора: вход → точка → ядро. Это и держит дорожку в
     её улице. */
  const WANT = 3;
  // путевую точку держим как можно левее — тогда горизонтальный прогон длинный,
  // а к ядру остаётся один короткий подъём, как и должно выглядеть
  const viaX = Math.max(w * 0.27, core.x + 70);
  const plans = laneRows(h)
    .map((y) => ({ entry: freeNear(w, y, dist), via: freeNear(viaX, y, dist) }))
    .filter((p) => p.entry >= 0 && p.via >= 0);

  /* ── маршруты: спуск по градиенту расстояния до ядра ──
     После каждого найденного пути его клетки (с окрестностью) дорожают, и
     Дейкстра пересчитывается — следующий вход прокладывает отдельную дорожку
     там, где есть место. Если места нет, пути сливаются, и это нормально. */
  const routes: Route[] = [];

  /** Спуск по градиенту поля от клетки `from` до его нуля. */
  const descend = (from: number, field: Int32Array): number[] => {
    const path = [from];
    let cur = from;
    for (let guard = 0; guard < n && field[cur] > 0; guard++) {
      const rx = cur % cols;
      const ry = (cur / cols) | 0;
      let best = -1;
      let bestD = field[cur];
      for (const [dx, dy] of DIRS) {
        const nx = rx + dx;
        const ny = ry + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (blocked[ni] || field[ni] < 0) continue;
        if (dx && dy && (blocked[ry * cols + nx] || blocked[ny * cols + rx])) continue;
        if (field[ni] < bestD) {
          bestD = field[ni];
          best = ni;
        }
      }
      if (best < 0) break; // локальный минимум — дальше не спуститься
      cur = best;
      path.push(cur);
    }
    return path;
  };

  for (const plan of plans) {
    if (routes.length >= WANT) break;
    // отрезок «вход → путевая точка» считаем полем от самой точки
    const legA = descend(plan.entry, runDijkstra(plan.via));
    const legB = descend(plan.via, dist);
    if (legA.length + legB.length < 4) continue;
    /* Спрямляем КАЖДЫЙ отрезок отдельно. Если натянуть нить сразу по всему
       пути, она стягивает прогон и подъём к ядру в одну наклонную линию через
       весь экран — поворота не остаётся. Отдельная обработка сохраняет
       путевую точку как настоящий угол: длинный горизонтальный прогон, затем
       подъём. */
    const toPts = (cells: number[]): Pt[] =>
      cells.map((i) => ({
        x: (i % cols) * cell + cell / 2,
        y: ((i / cols) | 0) * cell + cell / 2,
      }));
    const clean = (cells: number[], pinFirst: boolean, pinLast: boolean) =>
      axisSnap(
        stringPull(toPts(cells), blocked, cols, rows, cell),
        blocked,
        cols,
        rows,
        cell,
        pinFirst,
        pinLast
      );
    /* Путевая точка закреплена с обеих сторон стыка — иначе отрезки разъедутся
       на пару пикселей; конец второго отрезка закреплён на ядре. */
    const a = clean(legA, false, true);
    const b = clean(legB, true, true);
    const pts = a.concat(b.slice(1));
    // вход — за краем экрана: враги выходят «из сети», а не возникают в кадре
    pts.unshift({ x: w + 30, y: pts[0].y });
    routes.push(measure(roundCorners(pts, CORNER_R)));
  }

  return { cell, cols, rows, w, h, blocked, slots, routes, core, rects };
}

/** Слот под точкой экрана (или null, если там не крыша). */
export function slotAt(f: Field, x: number, y: number): Slot | null {
  for (const s of f.slots) {
    if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return s;
  }
  return null;
}
