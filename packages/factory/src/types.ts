export type PlotKind = 'coal' | 'iron' | 'brewery';
/** 0 东 1 南 2 西 3 北 */
export type Dir = 0 | 1 | 2 | 3;
export type BuildingKind = 'drill' | 'belt' | 'furnace' | 'pump' | 'farm' | 'brewhouse';
export type ItemKind = 'coal' | 'ore' | 'iron' | 'water' | 'grain' | 'beer';

/**
 * - drill/pump/farm: progress = 产出计时（秒）；item = 已产出、等待推出的物品。
 * - belt: item = 带上物品；progress = 该物品在本格停留的秒数。
 * - furnace/brewhouse: buf = 输入缓冲（每种 ≤ 2，含正在加工的那份，完成时扣除）；
 *   progress = 加工计时；item = 已完成、等待推出的产物。
 */
export interface Building {
  kind: BuildingKind;
  x: number;
  y: number;
  dir: Dir;
  progress: number;
  buf: Partial<Record<ItemKind, number>>;
  item: ItemKind | null;
}

export interface Plot {
  kind: PlotKind;
  w: 10;
  h: 7;
  sources: { x: number; y: number; item: ItemKind }[];
  dock: { x: 9; y: 3 };
  buildings: Building[];
  /** 累计模拟秒数 */
  time: number;
  /** 累计交付件数 */
  delivered: number;
}
