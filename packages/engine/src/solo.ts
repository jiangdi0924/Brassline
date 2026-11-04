/**
 * Solo 变体的 NPC 需求结算（spec 2026-11-05 §1.3）。
 *
 * 每轮末、收入前由 turn.ts settleRoundEnd 调用：按 npcDemandFor(era, round) 依次取
 * 煤 → 铁 → 啤酒，从未翻面且有存量的资源板块上拿走方块/桶（resources.ts drain，
 * 拿空即按原规则翻面、owner 收入前进）；不够就拿到没有为止，从不向市场买、
 * 不动商人啤酒。
 * - 煤 / 啤酒：只取连通任一商人位的板块（canBuyCoalFromMarket(state, 地点)），
 *   按到最近商人位的路程升序 → 地点 id → 槽位序。
 * - 铁：任意板块，按地点 id → 槽位序。
 * 事件：每个被取的来源一条 NpcConsumeEvent（拿空翻面时其后紧跟一条 FlipEvent），
 * 追加到 lastEvents。
 *
 * 纯函数：不改入参。
 */
import { npcDemandFor } from './data/solo.js';
import { canBuyCoalFromMarket, merchantDistances } from './network.js';
import { drain } from './resources.js';
import type { GameState } from './state.js';
import type { FlipEvent, GameEvent, LocationId } from './types.js';

type ResourceIndustry = 'coal' | 'iron' | 'brewery';

interface NpcSource {
  location: LocationId;
  slotIndex: number;
  available: number;
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function npcSources(state: GameState, industry: ResourceIndustry): NpcSource[] {
  const needsMerchant = industry !== 'iron';
  const dist = needsMerchant ? merchantDistances(state) : null;
  const out: NpcSource[] = [];
  for (const [location, slots] of Object.entries(state.board.slots)) {
    for (let i = 0; i < slots.length; i++) {
      const t = slots[i];
      if (!t || t.flipped || t.tile.industry !== industry || t.resources <= 0) continue;
      if (needsMerchant && !canBuyCoalFromMarket(state, location)) continue;
      out.push({ location, slotIndex: i, available: t.resources });
    }
  }
  out.sort(
    (a, b) =>
      (dist ? (dist.get(a.location) ?? Infinity) - (dist.get(b.location) ?? Infinity) : 0) ||
      byId(a.location, b.location) ||
      a.slotIndex - b.slotIndex,
  );
  return out;
}

function consumeNpc(
  state: GameState,
  industry: ResourceIndustry,
  demand: number,
  events: GameEvent[],
): GameState {
  let next = state;
  let remaining = demand;
  for (const src of npcSources(state, industry)) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, src.available);
    const flips: FlipEvent[] = [];
    next = drain(next, src.location, src.slotIndex, take, flips);
    remaining -= take;
    events.push({
      kind: 'npc-consume',
      location: src.location,
      slotIndex: src.slotIndex,
      industry,
      count: take,
      flipped: flips.length > 0,
    });
    events.push(...flips);
  }
  return next;
}

/** 结算本轮（state.era / state.round 为刚结束的那一轮）NPC 需求；非 solo 原样返回。 */
export function settleNpcDemand(state: GameState): GameState {
  if (state.rules?.solo !== true) return state;
  const demand = npcDemandFor(state.era, state.round);
  const events: GameEvent[] = [];
  let next = consumeNpc(state, 'coal', demand.coal, events);
  next = consumeNpc(next, 'iron', demand.iron, events);
  next = consumeNpc(next, 'brewery', demand.beer, events);
  if (events.length === 0) return next;
  return { ...next, lastEvents: [...next.lastEvents, ...events] };
}
