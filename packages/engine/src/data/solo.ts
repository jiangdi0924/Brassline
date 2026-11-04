/**
 * Solo 变体常量（spec 2026-11-05-solo-variant §1.3 / §1.4）。调平衡只改这里。
 */
import type { Era } from '../types.js';

/** 每时代固定轮数（solo）。 */
export const SOLO_ROUNDS_PER_ERA = 8;

/** 合成 Wild Industry 卡 id；合成 Wild Location（许可证）卡 id 前缀（后接 k）。 */
export const SOLO_INDUSTRY_CARD_ID = 'solo-industry';
export const SOLO_PERMIT_CARD_PREFIX = 'solo-permit-';

export interface NpcDemand {
  coal: number;
  iron: number;
  beer: number;
}

export interface NpcDemandRow extends NpcDemand {
  era: Era;
  /** 本行适用的轮次区间（含两端，时代内轮次 1..SOLO_ROUNDS_PER_ERA）。 */
  fromRound: number;
  toRound: number;
}

/** NPC 每轮末需求表（§1.3）。 */
export const NPC_DEMAND: readonly NpcDemandRow[] = [
  { era: 'canal', fromRound: 1, toRound: 2, coal: 1, iron: 1, beer: 0 },
  { era: 'canal', fromRound: 3, toRound: 5, coal: 2, iron: 1, beer: 1 },
  { era: 'canal', fromRound: 6, toRound: 8, coal: 2, iron: 2, beer: 1 },
  { era: 'rail', fromRound: 1, toRound: 3, coal: 3, iron: 2, beer: 1 },
  { era: 'rail', fromRound: 4, toRound: 8, coal: 4, iron: 2, beer: 2 },
];

/** 某时代某轮（时代内 1 起）的 NPC 需求；表外轮次返回全 0。 */
export function npcDemandFor(era: Era, round: number): NpcDemand {
  const row = NPC_DEMAND.find((r) => r.era === era && round >= r.fromRound && round <= r.toRound);
  return row ? { coal: row.coal, iron: row.iron, beer: row.beer } : { coal: 0, iron: 0, beer: 0 };
}

/** Solo 评级阈值（§1.4；待 sim 校准）。 */
export const SOLO_TARGETS = { bronze: 50, silver: 80, gold: 110 } as const;

export type SoloRank = 'none' | 'bronze' | 'silver' | 'gold';

/** VP → 评级（达到阈值即得该档）。 */
export function soloRank(vp: number): SoloRank {
  if (vp >= SOLO_TARGETS.gold) return 'gold';
  if (vp >= SOLO_TARGETS.silver) return 'silver';
  if (vp >= SOLO_TARGETS.bronze) return 'bronze';
  return 'none';
}
