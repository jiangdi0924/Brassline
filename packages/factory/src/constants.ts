import type { BuildingKind, ItemKind, PlotKind } from './types.js';

/** 建筑费用（英镑整数）。 */
export const COSTS: Record<BuildingKind, number> = {
  drill: 2,
  belt: 0,
  furnace: 3,
  pump: 2,
  farm: 2,
  brewhouse: 3,
};

/** 外层每执行一个行动，所有厂区推进的秒数。 */
export const FACTORY_SECONDS_PER_ACTION = 20;

export const PLOT_W = 10 as const;
export const PLOT_H = 7 as const;
export const DOCK = { x: 9, y: 3 } as const;

/** 内部固定步长（秒）。 */
export const SUBSTEP_SECONDS = 0.5;

export const DRILL_SECONDS = 45;
export const PUMP_SECONDS = 30;
export const FARM_SECONDS = 30;
/** 传送带每格停留秒数（每 2 s 前移一格）。 */
export const BELT_SECONDS = 2;
export const FURNACE_SECONDS = 20;
export const BREWHOUSE_SECONDS = 30;
/** 熔炉/酿造屋每种输入的缓冲上限。 */
export const MACHINE_BUFFER = 2;
/** 单格传送带容量（件/分）= 60 / BELT_SECONDS。 */
export const BELT_CAPACITY_PER_MINUTE = 60 / BELT_SECONDS;

/** 出货口接收的产物。 */
export const PRODUCT: Record<PlotKind, ItemKind> = {
  coal: 'coal',
  iron: 'iron',
  brewery: 'beer',
};

/** 矿源布局（固定）。 */
export const SOURCES: Record<PlotKind, readonly { x: number; y: number; item: ItemKind }[]> = {
  coal: [
    { x: 0, y: 2, item: 'coal' },
    { x: 0, y: 3, item: 'coal' },
    { x: 0, y: 4, item: 'coal' },
    { x: 1, y: 3, item: 'coal' },
  ],
  iron: [
    { x: 0, y: 2, item: 'ore' },
    { x: 0, y: 3, item: 'ore' },
    { x: 0, y: 4, item: 'ore' },
    { x: 1, y: 3, item: 'ore' },
  ],
  brewery: [
    { x: 0, y: 1, item: 'water' },
    { x: 0, y: 2, item: 'water' },
    { x: 0, y: 4, item: 'grain' },
    { x: 0, y: 5, item: 'grain' },
  ],
};
