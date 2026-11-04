import { LINKS } from '@brassline/engine';

export interface Pos { x: number; z: number }

export const NODE_POS: Record<string, Pos> = {
  warrington: { x: 0, z: 0 },
  'stoke-on-trent': { x: 1.5, z: 1.2 },
  leek: { x: 3, z: 0.6 },
  belper: { x: 5.5, z: 0.8 },
  derby: { x: 6.5, z: 2 },
  nottingham: { x: 8.5, z: 1.5 },
  stone: { x: 1.8, z: 2.6 },
  uttoxeter: { x: 4, z: 2.6 },
  stafford: { x: 1.2, z: 4 },
  'burton-on-trent': { x: 5, z: 3.8 },
  shrewsbury: { x: -1, z: 5 },
  coalbrookdale: { x: 0.5, z: 6 },
  cannock: { x: 2.8, z: 5.2 },
  'farm-north': { x: 1.6, z: 5.9 },
  tamworth: { x: 5.2, z: 5.6 },
  wolverhampton: { x: 1.8, z: 6.8 },
  walsall: { x: 3.4, z: 6.6 },
  nuneaton: { x: 6.4, z: 6.8 },
  dudley: { x: 1.8, z: 8.2 },
  birmingham: { x: 4.2, z: 8.2 },
  coventry: { x: 6.4, z: 8.6 },
  kidderminster: { x: 0.8, z: 9.8 },
  'farm-south': { x: -0.4, z: 10.6 },
  worcester: { x: 1.4, z: 11.6 },
  redditch: { x: 3.6, z: 10.6 },
  gloucester: { x: 0.6, z: 13.2 },
  oxford: { x: 5.2, z: 12.6 },
};

export const MERCHANT_IDS = new Set(['warrington', 'nottingham', 'shrewsbury', 'gloucester', 'oxford']);

/** 场景缩放：坐标表单位 → three.js 世界单位。 */
export const SCALE = 3;

export function world(id: string): { x: number; z: number } {
  const p = NODE_POS[id];
  if (!p) throw new Error(`no layout position for ${id}`);
  return { x: p.x * SCALE, z: p.z * SCALE };
}

export function linkMidpoint(linkIndex: number): { x: number; z: number } {
  const l = LINKS[linkIndex]!;
  const a = world(l.a);
  const b = world(l.b);
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}
