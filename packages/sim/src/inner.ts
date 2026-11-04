/**
 * 内层产线自对弈（P3 spec §4 sim）：newGame(..., { innerLayer: true }) + 默认厂区。
 *
 * 引擎的 playGame 只跑外层行动；这里自带循环：每个外层行动后，按 (地点, 槽位)
 * 字典序推进所有未翻面且 deposit > 0 的煤/铁/酒厂板块的厂区
 * FACTORY_SECONDS_PER_ACTION 秒，有产出就 deliverResources。厂区以
 * "玩家:行业:等级" 作签名绑定在槽位上：板块消失、翻面或被覆盖（签名变化）即删除。
 *
 * 交付不是 Action，所以 log 不足以重放；确定性校验要整局跑两次比 state。
 */
import { applyAction, deliverResources, enumerateActions, newGame, RandomAgent } from '@brassline/engine';
import type { Action, GameState, PlacedTile, PlayerAgent, PlayerIndex } from '@brassline/engine';
import { FACTORY_SECONDS_PER_ACTION, newPlot, step, type Plot, type PlotKind } from '@brassline/factory';

export interface InnerStats {
  /** deliverResources 返回 delivered > 0 的次数。 */
  deliveries: number;
  /** 交付到板块上的方块/桶总数。 */
  cubesDelivered: number;
  /** 交付时立即卖入煤/铁市场的方块数。 */
  soldToMarket: number;
  /** 交付卖市场的收入（£）。 */
  revenue: number;
  /** 由交付触发的翻面（板块 resources 与 deposit 同时归零）。 */
  flipsByDelivery: number;
  /** 外层行动中消耗资源导致的资源板块翻面。 */
  flipsByConsumption: number;
  /** 第一次交付发生在第几个外层行动之后（1 起）；整局无交付为 null。 */
  actionsToFirstDelivery: number | null;
  /** 建造行动按行业计数（仅资源板块）。 */
  tilesBuiltByKind: Record<PlotKind, number>;
  /** 终局时仍未翻面的资源板块数与其剩余 deposit 合计。 */
  unflippedResourceTilesAtEnd: number;
  depositLeftAtEnd: number;
}

const RESOURCE_KINDS: readonly PlotKind[] = ['coal', 'iron', 'brewery'];
const MAX_STEPS = 100_000;

function isResource(t: PlacedTile | null | undefined): t is PlacedTile {
  return !!t && (RESOURCE_KINDS as readonly string[]).includes(t.tile.industry);
}
function signature(t: PlacedTile): string {
  return `${t.player}:${t.tile.industry}:${t.tile.level}`;
}

/** 所有资源板块，按 (地点, 槽位) 字典序。 */
function resourceTiles(state: GameState): { key: string; location: string; slot: number; tile: PlacedTile }[] {
  const out: { key: string; location: string; slot: number; tile: PlacedTile }[] = [];
  for (const location of Object.keys(state.board.slots).sort()) {
    state.board.slots[location]!.forEach((tile, slot) => {
      if (isResource(tile)) out.push({ key: `${location}:${slot}`, location, slot, tile });
    });
  }
  return out;
}

/** 每个外层行动 applyAction 之后、推进厂区/交付之前调用（solo 统计用）。 */
export type ActionObserver = (before: GameState, action: Action, after: GameState) => void;

/** playerCount 1 = solo 变体（隐含 { solo: true }，与引擎 playGame 一致）。 */
export function playGameInner(
  playerCount: 1 | 2 | 3 | 4,
  seed: number,
  agents?: PlayerAgent[],
  opts?: { onAction?: ActionObserver },
): { state: GameState; log: Action[]; innerStats: InnerStats; plots: Record<string, Plot> } {
  const seats: PlayerAgent[] =
    agents ?? Array.from({ length: playerCount }, (_, i) => new RandomAgent(seed * 10 + i));
  if (seats.length !== playerCount) {
    throw new Error(`playGameInner: need ${playerCount} agents, got ${seats.length}`);
  }

  let state = newGame(playerCount, seed, { innerLayer: true, ...(playerCount === 1 ? { solo: true } : {}) });
  const log: Action[] = [];
  const plots = new Map<string, { sig: string; plot: Plot }>();
  const stats: InnerStats = {
    deliveries: 0,
    cubesDelivered: 0,
    soldToMarket: 0,
    revenue: 0,
    flipsByDelivery: 0,
    flipsByConsumption: 0,
    actionsToFirstDelivery: null,
    tilesBuiltByKind: { coal: 0, iron: 0, brewery: 0 },
    unflippedResourceTilesAtEnd: 0,
    depositLeftAtEnd: 0,
  };

  while (state.phase !== 'game-over') {
    const player: PlayerIndex = state.turnOrder[state.currentPlayerIdx]!;
    const legal = enumerateActions(state, player);
    if (legal.length === 0) {
      throw new Error(`playGameInner: no legal actions for player ${player} (seed ${seed}, step ${log.length})`);
    }
    const action = seats[player]!.chooseAction(state, legal);

    const before = new Map<string, string>();
    for (const r of resourceTiles(state)) if (!r.tile.flipped) before.set(r.key, signature(r.tile));
    const prev = state;
    state = applyAction(state, action);
    log.push(action);
    opts?.onAction?.(prev, action, state);
    if (action.type === 'build' && (RESOURCE_KINDS as readonly string[]).includes(action.industry)) {
      stats.tilesBuiltByKind[action.industry as PlotKind]++;
    }

    // 推进厂区
    const live = new Set<string>();
    for (const r of resourceTiles(state)) {
      const sig = signature(r.tile);
      if (r.tile.flipped && before.get(r.key) === sig) stats.flipsByConsumption++;
      if (r.tile.flipped || (r.tile.deposit ?? 0) <= 0) continue;
      live.add(r.key);
      let entry = plots.get(r.key);
      if (!entry || entry.sig !== sig) {
        entry = { sig, plot: newPlot(r.tile.tile.industry as PlotKind) };
        plots.set(r.key, entry);
      }
      const res = step(entry.plot, FACTORY_SECONDS_PER_ACTION);
      entry.plot = res.plot;
      if (res.delivered > 0) {
        const d = deliverResources(state, r.location, r.slot, res.delivered);
        state = d.state;
        if (d.delivered > 0) {
          stats.deliveries++;
          stats.cubesDelivered += d.delivered;
          stats.soldToMarket += d.soldToMarket;
          stats.revenue += d.revenue;
          stats.flipsByDelivery += d.flipped.length;
          stats.actionsToFirstDelivery ??= log.length;
        }
        if (d.flipped.length > 0) live.delete(r.key);
      }
    }
    for (const k of [...plots.keys()]) if (!live.has(k)) plots.delete(k);

    if (log.length > MAX_STEPS) {
      throw new Error(`playGameInner: exceeded ${MAX_STEPS} steps without game-over (seed ${seed})`);
    }
  }

  for (const r of resourceTiles(state)) {
    if (!r.tile.flipped) {
      stats.unflippedResourceTilesAtEnd++;
      stats.depositLeftAtEnd += r.tile.deposit ?? 0;
    }
  }
  const plotsOut: Record<string, Plot> = {};
  for (const k of [...plots.keys()].sort()) plotsOut[k] = plots.get(k)!.plot;
  return { state, log, innerStats: stats, plots: plotsOut };
}
