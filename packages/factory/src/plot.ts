import { DOCK, PLOT_H, PLOT_W, SOURCES } from './constants.js';
import type { Building, BuildingKind, Dir, Plot, PlotKind } from './types.js';

type Spec = [BuildingKind, number, number, Dir];

const E: Dir = 0;
const S: Dir = 1;
const N: Dir = 3;

const beltsEast = (from: number, to: number, y: number): Spec[] => {
  const out: Spec[] = [];
  for (let x = from; x <= to; x++) out.push(['belt', x, y, E]);
  return out;
};

/**
 * 默认产线。
 *
 * brewery 路径（两路输入从上下两侧进入酿造屋，互不争抢同一格）：
 *   水：pump(0,2)东 → belt(1,2)(2,2)(3,2)东 → belt(4,2)南 → brewhouse(4,3) 北侧进
 *   麦：farm(0,4)东 → belt(1,4)(2,4)(3,4)东 → belt(4,4)北 → brewhouse(4,3) 南侧进
 *   brewhouse(4,3)东 → belt(5,3)…(8,3)东 → dock(9,3)
 */
const DEFAULT_LINES: Record<PlotKind, Spec[]> = {
  coal: [['drill', 1, 3, E], ...beltsEast(2, 8, 3)],
  iron: [['drill', 1, 3, E], ...beltsEast(2, 3, 3), ['furnace', 4, 3, E], ...beltsEast(5, 8, 3)],
  brewery: [
    ['pump', 0, 2, E],
    ...beltsEast(1, 3, 2),
    ['belt', 4, 2, S],
    ['farm', 0, 4, E],
    ...beltsEast(1, 3, 4),
    ['belt', 4, 4, N],
    ['brewhouse', 4, 3, E],
    ...beltsEast(5, 8, 3),
  ],
};

export function sortBuildings(bs: Building[]): Building[] {
  return [...bs].sort((a, b) => a.y - b.y || a.x - b.x);
}

export function cloneBuilding(b: Building): Building {
  return { ...b, buf: { ...b.buf } };
}

export function clonePlot(p: Plot): Plot {
  return {
    kind: p.kind,
    w: p.w,
    h: p.h,
    sources: p.sources.map((s) => ({ ...s })),
    dock: { x: p.dock.x, y: p.dock.y },
    buildings: p.buildings.map(cloneBuilding),
    time: p.time,
    delivered: p.delivered,
  };
}

function makeBuilding(kind: BuildingKind, x: number, y: number, dir: Dir): Building {
  return { kind, x, y, dir, progress: 0, buf: {}, item: null };
}

export function buildingAt(plot: Plot, x: number, y: number): Building | undefined {
  return plot.buildings.find((b) => b.x === x && b.y === y);
}

export function newPlot(kind: PlotKind): Plot {
  let plot: Plot = {
    kind,
    w: PLOT_W,
    h: PLOT_H,
    sources: SOURCES[kind].map((s) => ({ ...s })),
    dock: { x: DOCK.x, y: DOCK.y },
    buildings: [],
    time: 0,
    delivered: 0,
  };
  for (const [k, x, y, d] of DEFAULT_LINES[kind]) plot = place(plot, k, x, y, d);
  return plot;
}

/** '' 表示可放置，否则返回原因。 */
export function canPlace(plot: Plot, kind: BuildingKind, x: number, y: number): string {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= plot.w || y >= plot.h) {
    return '超出厂区';
  }
  if (x === plot.dock.x && y === plot.dock.y) return '出货口不能放建筑';
  if (buildingAt(plot, x, y)) return '该格已有建筑';
  const src = plot.sources.find((s) => s.x === x && s.y === y);
  if (kind === 'drill' && !(src && (src.item === 'coal' || src.item === 'ore'))) return '钻机只能放在矿源格';
  if (kind === 'pump' && src?.item !== 'water') return '水泵只能放在水源格';
  if (kind === 'farm' && src?.item !== 'grain') return '农场只能放在麦田格';
  return '';
}

/** 放置建筑；不可放置时抛错（调用方应先用 canPlace 检查）。不收费，费用由外层处理。 */
export function place(plot: Plot, kind: BuildingKind, x: number, y: number, dir: Dir): Plot {
  const reason = canPlace(plot, kind, x, y);
  if (reason) throw new Error(`无法放置 ${kind} @(${x},${y})：${reason}`);
  const next = clonePlot(plot);
  next.buildings = sortBuildings([...next.buildings, makeBuilding(kind, x, y, dir)]);
  return next;
}

/** 拆除 (x,y) 上的建筑（连同其中物品）；空格则原样返回副本。 */
export function remove(plot: Plot, x: number, y: number): Plot {
  const next = clonePlot(plot);
  next.buildings = next.buildings.filter((b) => !(b.x === x && b.y === y));
  return next;
}

/** 设定 (x,y) 上建筑的朝向；空格则原样返回副本。 */
export function rotate(plot: Plot, x: number, y: number, dir: Dir): Plot {
  const next = clonePlot(plot);
  const b = buildingAt(next, x, y);
  if (b) b.dir = dir;
  return next;
}
