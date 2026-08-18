/* ═══ Пиксель-арт: крошечный растровый «язык» для спрайтов ТД ═══
   Спрайт описан не строкой-матрицей (её невозможно править, не пересчитывая
   символы), а списком примитивов в АРТ-ПИКСЕЛЯХ: прямоугольник, эллипс,
   линия, точка. Ops исполняются в буфер индексов палитры, потом одним проходом
   добавляется тёмная обводка по контуру (канон пиксель-арта) и всё это
   запекается в offscreen-канвас нужного масштаба. Рисуем запечённое через
   drawImage с imageSmoothingEnabled=false — клетки остаются острыми. */

// −1 в буфере = прозрачно; остальные значения — индексы палитры
const EMPTY = -1;

export type Op =
  | ["r", number, number, number, number, number] // rect fill: x y w h color
  | ["o", number, number, number, number, number] // rect outline
  | ["e", number, number, number, number, number] // ellipse fill: cx cy rx ry color
  | ["l", number, number, number, number, number] // line: x0 y0 x1 y1 color
  | ["p", number, number, number]; // pixel: x y color

export interface Art {
  w: number;
  h: number;
  pal: string[];
  ops: Op[];
  /** индекс цвета обводки в палитре; null — не обводить */
  outline?: number | null;
}

export interface Baked {
  c: HTMLCanvasElement;
  /** габарит в CSS-пикселях (уже с учётом поля под обводку) */
  w: number;
  h: number;
  /** поле вокруг арта под обводку, в CSS-пикселях */
  pad: number;
  scale: number;
}

/* ── буфер индексов: арт + 1 арт-пиксель поля со всех сторон под обводку ── */
class Buf {
  readonly w: number;
  readonly h: number;
  readonly px: Int8Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Int8Array(w * h).fill(EMPTY);
  }
  set(x: number, y: number, c: number) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }
  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return EMPTY;
    return this.px[y * this.w + x];
  }
}

function rect(b: Buf, x: number, y: number, w: number, h: number, c: number) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) b.set(x + i, y + j, c);
}

function outlineRect(b: Buf, x: number, y: number, w: number, h: number, c: number) {
  for (let i = 0; i < w; i++) {
    b.set(x + i, y, c);
    b.set(x + i, y + h - 1, c);
  }
  for (let j = 0; j < h; j++) {
    b.set(x, y + j, c);
    b.set(x + w - 1, y + j, c);
  }
}

/* Заливка эллипса по строкам: для каждой строки считаем полуширину — так
   контур получается симметричным, без «лесенки» от попиксельного теста. */
function ellipse(b: Buf, cx: number, cy: number, rx: number, ry: number, c: number) {
  for (let dy = -ry; dy <= ry; dy++) {
    const t = ry === 0 ? 0 : dy / ry;
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let dx = -half; dx <= half; dx++) b.set(cx + dx, cy + dy, c);
  }
}

// Брезенхэм — линии в пиксель-арте должны идти клетками, без сглаживания
function line(b: Buf, x0: number, y0: number, x1: number, y1: number, c: number) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 4096; guard++) {
    b.set(x, y, c);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function run(b: Buf, ops: Op[], ox: number, oy: number) {
  for (const op of ops) {
    switch (op[0]) {
      case "r":
        rect(b, op[1] + ox, op[2] + oy, op[3], op[4], op[5]);
        break;
      case "o":
        outlineRect(b, op[1] + ox, op[2] + oy, op[3], op[4], op[5]);
        break;
      case "e":
        ellipse(b, op[1] + ox, op[2] + oy, op[3], op[4], op[5]);
        break;
      case "l":
        line(b, op[1] + ox, op[2] + oy, op[3] + ox, op[4] + oy, op[5]);
        break;
      case "p":
        b.set(op[1] + ox, op[2] + oy, op[3]);
        break;
    }
  }
}

/* Обводка: каждый ПУСТОЙ пиксель, у которого есть непустой сосед по 4 сторонам,
   красится в цвет обводки. Считаем по снимку буфера, иначе обводка обводила бы
   саму себя и расползалась на два пикселя. */
function addOutline(b: Buf, c: number) {
  const src = Int8Array.from(b.px);
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= b.w || y >= b.h ? EMPTY : src[y * b.w + x];
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (at(x, y) !== EMPTY) continue;
      if (
        at(x - 1, y) !== EMPTY ||
        at(x + 1, y) !== EMPTY ||
        at(x, y - 1) !== EMPTY ||
        at(x, y + 1) !== EMPTY
      ) {
        b.set(x, y, c);
      }
    }
  }
}

const hexByte = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);

/** #rgb / #rrggbb / #rrggbbaa → [r,g,b,a] */
function parseColor(hex: string): [number, number, number, number] {
  let s = hex.replace("#", "");
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return [
    hexByte(s, 0),
    hexByte(s, 2),
    hexByte(s, 4),
    s.length >= 8 ? hexByte(s, 6) : 255,
  ];
}

/** Исполнить ops и запечь в канвас масштаба `scale` (1 арт-пиксель = scale CSS-px). */
export function bake(art: Art, scale: number): Baked {
  const pad = art.outline === null ? 0 : 1;
  const bw = art.w + pad * 2;
  const bh = art.h + pad * 2;
  const b = new Buf(bw, bh);
  run(b, art.ops, pad, pad);
  if (art.outline != null) addOutline(b, art.outline);

  // сначала рисуем 1:1 в маленький канвас, затем растягиваем без сглаживания:
  // putImageData игнорирует трансформации, поэтому масштаб — отдельным шагом
  const src = document.createElement("canvas");
  src.width = bw;
  src.height = bh;
  const sctx = src.getContext("2d")!;
  const img = sctx.createImageData(bw, bh);
  const rgba = art.pal.map(parseColor);
  for (let i = 0; i < bw * bh; i++) {
    const idx = b.px[i];
    if (idx === EMPTY) continue;
    const col = rgba[idx];
    if (!col) continue;
    img.data[i * 4] = col[0];
    img.data[i * 4 + 1] = col[1];
    img.data[i * 4 + 2] = col[2];
    img.data[i * 4 + 3] = col[3];
  }
  sctx.putImageData(img, 0, 0);

  const c = document.createElement("canvas");
  c.width = bw * scale;
  c.height = bh * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return { c, w: c.width, h: c.height, pad: pad * scale, scale };
}

/* ── примитивы, которые рисуются В КАДРЕ (стволы поворачиваются к цели,
      молнии и трассеры живут один тик) — тем же «крупным пикселем» ──
   Координаты приходят в CSS-пикселях, блоки прибиваются к сетке PX, поэтому
   повёрнутый ствол выглядит как настоящий пиксель-арт, а не как повёрнутый
   прямоугольник со сглаженными краями. */
export function pxLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thick: number,
  color: string,
  px: number
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / px));
  const nx = -dy / (len || 1);
  const ny = dx / (len || 1);
  ctx.fillStyle = color;
  const half = (thick - 1) / 2;
  const seen = new Set<number>();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const bx = x0 + dx * t;
    const by = y0 + dy * t;
    for (let k = 0; k < thick; k++) {
      const off = (k - half) * px;
      const gx = Math.round((bx + nx * off) / px) * px;
      const gy = Math.round((by + ny * off) / px) * px;
      // одна и та же клетка на соседних шагах — рисуем её один раз
      const key = gx * 8192 + gy;
      if (seen.has(key)) continue;
      seen.add(key);
      ctx.fillRect(gx, gy, px, px);
    }
  }
}

/** Точка «крупным пикселем» — искры, трассеры, частицы. */
export function pxDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  px: number
) {
  const gx = Math.round(x / px) * px;
  const gy = Math.round(y / px) * px;
  const s = Math.max(1, Math.round(size));
  ctx.fillStyle = color;
  ctx.fillRect(gx - ((s / 2) | 0) * px, gy - ((s / 2) | 0) * px, s * px, s * px);
}
