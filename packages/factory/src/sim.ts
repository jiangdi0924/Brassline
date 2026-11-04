import {
  BELT_SECONDS,
  BREWHOUSE_SECONDS,
  DRILL_SECONDS,
  FARM_SECONDS,
  FURNACE_SECONDS,
  MACHINE_BUFFER,
  PRODUCT,
  PUMP_SECONDS,
  SUBSTEP_SECONDS,
} from './constants.js';
import { clonePlot } from './plot.js';
import type { Building, Dir, ItemKind, Plot } from './types.js';

const DX: Record<Dir, number> = { 0: 1, 1: 0, 2: -1, 3: 0 };
const DY: Record<Dir, number> = { 0: 0, 1: 1, 2: 0, 3: -1 };

export function frontOf(b: { x: number; y: number; dir: Dir }): { x: number; y: number } {
  return { x: b.x + DX[b.dir], y: b.y + DY[b.dir] };
}

/** 源格产物（钻机所在格决定 coal / ore）。 */
function sourceItem(plot: Plot, x: number, y: number): ItemKind | null {
  return plot.sources.find((s) => s.x === x && s.y === y)?.item ?? null;
}

/** 机器配方：输入 → 产物、耗时。 */
export const RECIPES = {
  furnace: { inputs: ['ore'] as ItemKind[], output: 'iron' as ItemKind, seconds: FURNACE_SECONDS },
  brewhouse: { inputs: ['water', 'grain'] as ItemKind[], output: 'beer' as ItemKind, seconds: BREWHOUSE_SECONDS },
};

export function producerPeriod(kind: Building['kind']): number {
  return kind === 'drill' ? DRILL_SECONDS : kind === 'pump' ? PUMP_SECONDS : FARM_SECONDS;
}

export function producerItem(plot: Plot, b: Building): ItemKind | null {
  if (b.kind === 'pump') return 'water';
  if (b.kind === 'farm') return 'grain';
  return sourceItem(plot, b.x, b.y);
}

type Grid = (Building | undefined)[];

function indexGrid(plot: Plot): Grid {
  const g: Grid = new Array(plot.w * plot.h);
  for (const b of plot.buildings) g[b.y * plot.w + b.x] = b;
  return g;
}

/**
 * 目标格 (tx,ty) 是否接收来自 (fx,fy) 的 item。
 * 返回 'dock' / 目标建筑 / null（拒收）。
 */
function receiver(plot: Plot, grid: Grid, tx: number, ty: number, fx: number, fy: number, item: ItemKind): 'dock' | Building | null {
  if (tx === plot.dock.x && ty === plot.dock.y) return item === PRODUCT[plot.kind] ? 'dock' : null;
  if (tx < 0 || ty < 0 || tx >= plot.w || ty >= plot.h) return null;
  const t = grid[ty * plot.w + tx];
  if (!t) return null;
  const f = frontOf(t);
  if (f.x === fx && f.y === fy) return null; // 不接收来自正前方的物品
  if (t.kind === 'belt') return t.item === null ? t : null;
  if (t.kind === 'furnace' || t.kind === 'brewhouse') {
    if (!RECIPES[t.kind].inputs.includes(item)) return null;
    return (t.buf[item] ?? 0) < MACHINE_BUFFER ? t : null;
  }
  return null; // 钻机/水泵/农场不接收
}

function canCraft(b: Building): boolean {
  if (b.kind !== 'furnace' && b.kind !== 'brewhouse') return false;
  return RECIPES[b.kind].inputs.every((i) => (b.buf[i] ?? 0) >= 1);
}

/** 单个 0.5 s 子步，就地修改 plot（plot 已是副本）。返回本子步交付件数。 */
function substep(plot: Plot, dt: number): number {
  const bs = plot.buildings; // 已按 (y, x) 排序
  // 阶段 1：计时
  for (const b of bs) {
    switch (b.kind) {
      case 'drill':
      case 'pump':
      case 'farm': {
        if (b.item !== null) break; // 产物未推出 → 阻塞
        const item = producerItem(plot, b);
        if (item === null) break;
        b.progress += dt;
        if (b.progress >= producerPeriod(b.kind)) {
          b.progress = 0;
          b.item = item;
        }
        break;
      }
      case 'belt':
        if (b.item !== null) b.progress += dt;
        break;
      case 'furnace':
      case 'brewhouse': {
        if (b.item !== null || !canCraft(b)) break;
        const r = RECIPES[b.kind];
        b.progress += dt;
        if (b.progress >= r.seconds) {
          for (const i of r.inputs) b.buf[i] = (b.buf[i] ?? 0) - 1;
          b.progress = 0;
          b.item = r.output;
        }
        break;
      }
    }
  }
  // 阶段 2：移动。按 (y, x) 顺序反复扫描直到没有物品移动（不动点）。
  // 刚收到物品的带子 progress = 0，本子步不会再动，所以每件物品每子步至多移动一次；
  // 一条满带在同一子步里从出货口端起依次腾位，整条一起前进，无空隙。
  const grid = indexGrid(plot);
  let delivered = 0;
  let moved = true;
  while (moved) {
    moved = false;
    for (const b of bs) {
      if (b.item === null) continue;
      if (b.kind === 'belt' && b.progress < BELT_SECONDS) continue;
      const f = frontOf(b);
      const r = receiver(plot, grid, f.x, f.y, b.x, b.y, b.item);
      if (r === null) continue;
      if (r === 'dock') {
        delivered++;
      } else if (r.kind === 'belt') {
        r.item = b.item;
        r.progress = 0;
      } else {
        r.buf[b.item] = (r.buf[b.item] ?? 0) + 1;
      }
      b.item = null;
      b.progress = 0;
      moved = true;
    }
  }
  return delivered;
}

const ticks = (t: number): number => Math.floor(t / SUBSTEP_SECONDS + 1e-9);

/**
 * 推进 seconds 秒。内部以固定 0.5 s 子步循环；子步数 = 按累计时间对齐的整数子步，
 * 所以 step(p, 0.25) 两次与 step(p, 0.5) 一次结果相同。不修改输入。
 */
export function step(plot: Plot, seconds: number): { plot: Plot; delivered: number } {
  const next = clonePlot(plot);
  if (!(seconds > 0)) return { plot: next, delivered: 0 };
  const n = ticks(plot.time + seconds) - ticks(plot.time);
  let delivered = 0;
  for (let i = 0; i < n; i++) delivered += substep(next, SUBSTEP_SECONDS);
  next.time = plot.time + seconds;
  next.delivered = plot.delivered + delivered;
  return { plot: next, delivered };
}
