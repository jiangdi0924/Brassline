/**
 * 内层产线的外层接口（P3 spec §1.2 / §3）：交付与厂区花费。
 *
 * - deliverResources：把内层产线产出的 n 件从板块 deposit 移入 resources；未翻面时
 *   立即向市场卖出能卖的（煤：板块所在地连通任一商人位；铁：无条件；啤酒：从不），
 *   从最贵空格起填，收入给板块主人（不计入 spentThisRound）；卖不掉的留在 resources。
 *   交付后 resources === 0 && deposit === 0 → applyFlip。板块已翻面、deposit 为 0
 *   或 n <= 0 时交付 0，原样返回入参 state。
 * - spendMoney：厂区建筑扣钱。不是 Action，不进行动日志，也不计入 spentThisRound
 *   （顺位只由外层行动花费决定）。
 *
 * 纯函数：不改入参。
 */
import { IllegalActionError } from './errors.js';
import { sellCoalToMarket, sellIronToMarket } from './market.js';
import { canBuyCoalFromMarket } from './network.js';
import { applyFlip } from './resources.js';
import type { GameState, PlacedTile } from './state.js';
import type { FlipEvent, LocationId, PlayerIndex } from './types.js';

export interface DeliverResult {
  state: GameState;
  delivered: number;
  soldToMarket: number;
  revenue: number;
  flipped: FlipEvent[];
}

function withSlotTile(
  state: GameState,
  location: LocationId,
  slotIdx: number,
  tile: PlacedTile,
): GameState {
  const newSlots = state.board.slots[location]!.slice();
  newSlots[slotIdx] = tile;
  return {
    ...state,
    board: { ...state.board, slots: { ...state.board.slots, [location]: newSlots } },
  };
}

function addMoney(state: GameState, player: PlayerIndex, delta: number): GameState {
  const players = state.players.slice();
  const ps = players[player]!;
  players[player] = { ...ps, money: ps.money + delta };
  return { ...state, players };
}

export function deliverResources(
  state: GameState,
  location: LocationId,
  slotIdx: number,
  n: number,
): DeliverResult {
  const placed = state.board.slots[location]?.[slotIdx];
  if (!placed) {
    throw new IllegalActionError(
      'no-resource-tile',
      `no-resource-tile: no tile at ${location} slot ${slotIdx}`,
    );
  }
  const industry = placed.tile.industry;
  if (industry !== 'coal' && industry !== 'iron' && industry !== 'brewery') {
    throw new IllegalActionError(
      'no-resource-tile',
      `no-resource-tile: ${industry} at ${location} slot ${slotIdx} is not a resource tile`,
    );
  }

  const deposit = placed.deposit ?? 0;
  const delivered = placed.flipped ? 0 : Math.min(Math.max(0, Math.floor(n)), deposit);
  if (delivered === 0) {
    return { state, delivered: 0, soldToMarket: 0, revenue: 0, flipped: [] };
  }

  let tile: PlacedTile = {
    ...placed,
    resources: placed.resources + delivered,
    deposit: deposit - delivered,
  };
  let next = state;
  let soldToMarket = 0;
  let revenue = 0;

  const canSell =
    industry === 'iron' || (industry === 'coal' && canBuyCoalFromMarket(state, location));
  if (canSell) {
    const sale =
      industry === 'coal'
        ? sellCoalToMarket(next, tile.resources)
        : sellIronToMarket(next, tile.resources);
    if (sale.sold > 0) {
      soldToMarket = sale.sold;
      revenue = sale.revenue;
      next =
        industry === 'coal'
          ? { ...next, coalMarket: next.coalMarket + sale.sold }
          : { ...next, ironMarket: next.ironMarket + sale.sold };
      next = addMoney(next, placed.player, sale.revenue);
      tile = { ...tile, resources: tile.resources - sale.sold };
    }
  }

  next = withSlotTile(next, location, slotIdx, tile);
  const flipped: FlipEvent[] = [];
  if (tile.resources === 0 && tile.deposit === 0) {
    const f = applyFlip(next, location, slotIdx);
    next = f.state;
    flipped.push(f.event);
  }
  return { state: next, delivered, soldToMarket, revenue, flipped };
}

export function spendMoney(state: GameState, player: PlayerIndex, n: number): GameState {
  const ps = state.players[player];
  if (!ps) throw new RangeError(`unknown player: ${player}`);
  if (!Number.isFinite(n) || n < 0) {
    throw new IllegalActionError('invalid-amount', `invalid-amount: ${n}`);
  }
  if (ps.money < n) {
    throw new IllegalActionError(
      'insufficient-money',
      `insufficient-money: player ${player} has £${ps.money}, needs £${n}`,
    );
  }
  return addMoney(state, player, -n);
}
