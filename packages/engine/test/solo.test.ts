/**
 * Solo 变体（spec 2026-11-05-solo-variant §1 / §2）。
 */
import { describe, expect, it } from 'vitest';
import { tileDef } from '../src/data/tiles.js';
import { advanceIncomeSpace, INCOME_START_SPACE } from '../src/data/income.js';
import { IllegalActionError } from '../src/errors.js';
import * as api from '../src/index.js';
import { playerNetwork } from '../src/network.js';
import { newGame, type GameState, type PlacedTile } from '../src/state.js';
import type { Action, IndustryType, LocationId } from '../src/types.js';

const {
  applyAction,
  enumerateActions,
  settleRoundEnd,
  NPC_DEMAND,
  npcDemandFor,
  SOLO_ROUNDS_PER_ERA,
  SOLO_TARGETS,
  soloRank,
  playGame,
} = api;

function solo(seed = 1, innerLayer?: boolean): GameState {
  return newGame(1, seed, { solo: true, ...(innerLayer !== undefined ? { innerLayer } : {}) });
}

function place(
  s: GameState,
  loc: LocationId,
  slot: number,
  industry: IndustryType,
  opts: { level?: number; resources?: number; flipped?: boolean; deposit?: number } = {},
): PlacedTile {
  const t: PlacedTile = {
    tile: tileDef(industry, opts.level ?? 1)!,
    player: 0,
    flipped: opts.flipped ?? false,
    resources: opts.resources ?? 0,
    ...(opts.deposit !== undefined ? { deposit: opts.deposit } : {}),
  };
  s.board.slots[loc]![slot] = t;
  return t;
}

function link(s: GameState, linkIndex: number): void {
  s.board.links.push({ linkIndex, player: 0, era: s.era });
}

const handIds = (s: GameState) => s.players[0]!.hand.map((c) => c.id);

describe('solo: setup', () => {
  it('newGame(1) without solo throws; solo with >1 players throws', () => {
    expect(() => newGame(1, 1)).toThrow();
    expect(() => newGame(1, 1, { solo: false })).toThrow();
    expect(() => newGame(2, 1, { solo: true })).toThrow();
  });

  it('solo state: synthetic hand, 0 permits, empty deck/discard, 2p merchants, £17', () => {
    const s = solo(7);
    expect(s.playerCount).toBe(1);
    expect(s.rules.solo).toBe(true);
    expect(s.rules.innerLayer).toBe(false);
    expect(s.players).toHaveLength(1);
    expect(s.players[0]!.hand).toEqual([{ id: 'solo-industry', kind: 'wild-industry' }]);
    expect(s.players[0]!.permits).toBe(0);
    expect(s.players[0]!.money).toBe(17);
    expect(s.deck).toEqual([]);
    expect(s.discard).toEqual([]);
    expect(s.turnOrder).toEqual([0]);
    expect(s.merchants.warrington.tiles).toEqual([]);
    expect(s.merchants.nottingham.tiles).toEqual([]);
    const tiles = [
      ...s.merchants.shrewsbury.tiles,
      ...s.merchants.gloucester.tiles,
      ...s.merchants.oxford.tiles,
    ].sort();
    expect(tiles).toEqual(['any', 'blank', 'blank', 'cotton', 'manufacturer']);
    expect(solo(7, true).rules.innerLayer).toBe(true);
  });

  it('non-solo games do not carry solo/permits fields', () => {
    const s = newGame(2, 3);
    expect(s.rules).toEqual({ innerLayer: false });
    expect(s.players[0]!.permits).toBeUndefined();
  });
});

describe('solo: synthetic hand and actions', () => {
  it('hand regenerated after every action; discard pile and wild supply untouched', () => {
    let s = solo(3);
    const supply = { ...s.wildSupply };
    for (let i = 0; i < 12; i++) {
      const legal = enumerateActions(s, 0);
      // 优先非 build 行动以覆盖各种弃牌路径
      const a = legal[(i * 7919) % legal.length]!;
      s = applyAction(s, a);
      const p = s.players[0]!;
      expect(p.hand).toHaveLength(1 + p.permits!);
      expect(p.hand[0]).toEqual({ id: 'solo-industry', kind: 'wild-industry' });
      p.hand.slice(1).forEach((c, k) => expect(c).toEqual({ id: `solo-permit-${k}`, kind: 'wild-location' }));
      expect(s.discard).toEqual([]);
      expect(s.deck).toEqual([]);
      expect(s.wildSupply).toEqual(supply);
    }
  });

  it('enumerateActions never returns scout; applyAction rejects scout', () => {
    let s = solo(5);
    for (let i = 0; i < 10; i++) {
      const legal = enumerateActions(s, 0);
      expect(legal.some((a) => a.type === 'scout')).toBe(false);
      s = applyAction(s, legal[legal.length - 1]!);
    }
    const scout: Action = { type: 'scout', cardIds: ['solo-industry', 'solo-industry', 'solo-industry'] };
    expect(() => applyAction(s, scout)).toThrow(IllegalActionError);
  });

  it('non-build actions only offered with the synthetic industry card', () => {
    const s = solo(2);
    s.players[0]!.permits = 2;
    s.players[0]!.hand = api.refillHand(s, 0).players[0]!.hand;
    expect(handIds(s)).toEqual(['solo-industry', 'solo-permit-0', 'solo-permit-1']);
    const legal = enumerateActions(s, 0);
    for (const a of legal) {
      if (a.type !== 'build' && a.type !== 'scout') expect(a.cardId).toBe('solo-industry');
    }
    expect(() => applyAction(s, { type: 'loan', cardId: 'solo-permit-0' })).toThrow(IllegalActionError);
  });

  it('synthetic industry builds anywhere on empty board, then only inside the network', () => {
    const s0 = solo(4);
    const first = enumerateActions(s0, 0).filter((a) => a.type === 'build');
    const firstLocs = new Set(first.map((a) => (a as { location: string }).location));
    expect(firstLocs.size).toBeGreaterThan(10);

    const s = solo(4);
    s.round = 2;
    place(s, 'worcester', 0, 'cotton', { flipped: true });
    link(s, 9); // birmingham-worcester
    const net = playerNetwork(s, 0);
    const builds = enumerateActions(s, 0).filter((a): a is Extract<Action, { type: 'build' }> => a.type === 'build');
    expect(builds.length).toBeGreaterThan(0);
    for (const b of builds) {
      expect(b.cardId).toBe('solo-industry');
      expect(net.has(b.location)).toBe(true);
    }
  });

  it('a sell flipping 1 tile grants 1 permit; next hand has 1 wild-location', () => {
    const s = solo(6);
    s.round = 2;
    place(s, 'worcester', 0, 'cotton');
    link(s, 9); // birmingham-worcester
    link(s, 5); // birmingham-oxford
    s.merchants.oxford = { tiles: ['any', 'any'], barrels: [true, true] };
    const sell = enumerateActions(s, 0).find(
      (a): a is Extract<Action, { type: 'sell' }> => a.type === 'sell' && a.sales.length === 1,
    )!;
    expect(sell).toBeDefined();
    const after = applyAction(s, sell);
    expect(after.board.slots['worcester']![0]!.flipped).toBe(true);
    expect(after.players[0]!.permits).toBe(1);
    expect(handIds(after)).toEqual(['solo-industry', 'solo-permit-0']);
    expect(after.players[0]!.hand[1]!.kind).toBe('wild-location');
    expect(after.discard).toEqual([]);
  });

  it('permit card builds outside the network and decrements permits', () => {
    const s = solo(8);
    s.round = 2;
    place(s, 'worcester', 0, 'cotton', { flipped: true });
    s.players[0]!.permits = 1;
    s.players[0]!.hand = api.refillHand(s, 0).players[0]!.hand;
    const legal = enumerateActions(s, 0);
    const outside = legal.find(
      (a) => a.type === 'build' && a.cardId === 'solo-permit-0' && a.location === 'dudley' && a.industry === 'coal',
    )!;
    expect(outside).toBeDefined();
    expect(
      legal.some((a) => a.type === 'build' && a.cardId === 'solo-industry' && a.location === 'dudley'),
    ).toBe(false);
    const after = applyAction(s, outside);
    expect(after.board.slots['dudley']![0]!.tile.industry).toBe('coal');
    expect(after.players[0]!.permits).toBe(0);
    expect(handIds(after)).toEqual(['solo-industry']);
    expect(after.wildSupply).toEqual(s.wildSupply);
  });

  it('round structure: canal round 1 has one action, later rounds two', () => {
    let s = solo(9);
    expect(api.actionsPerRound(s)).toBe(1);
    s = applyAction(s, { type: 'pass', cardId: 'solo-industry' });
    expect(s.round).toBe(2);
    expect(api.actionsPerRound(s)).toBe(2);
    s = applyAction(s, { type: 'pass', cardId: 'solo-industry' });
    expect(s.round).toBe(2);
    s = applyAction(s, { type: 'pass', cardId: 'solo-industry' });
    expect(s.round).toBe(3);
  });
});

/** 置于轮末待结算态，直接 settleRoundEnd。 */
function roundEnd(s: GameState, round: number): GameState {
  s.round = round;
  s.roundEndPending = true;
  s.lastEvents = [];
  return settleRoundEnd(s);
}

describe('solo: NPC demand', () => {
  it('demand table matches the spec', () => {
    expect(NPC_DEMAND).toHaveLength(5);
    const expected: [string, number, [number, number, number]][] = [
      ['canal', 1, [1, 1, 0]], ['canal', 2, [1, 1, 0]],
      ['canal', 3, [2, 1, 1]], ['canal', 5, [2, 1, 1]],
      ['canal', 6, [2, 2, 1]], ['canal', 8, [2, 2, 1]],
      ['rail', 1, [3, 2, 1]], ['rail', 3, [3, 2, 1]],
      ['rail', 4, [4, 2, 2]], ['rail', 8, [4, 2, 2]],
    ];
    for (const [era, r, [coal, iron, beer]] of expected) {
      expect(npcDemandFor(era as 'canal' | 'rail', r)).toEqual({ coal, iron, beer });
    }
    expect(SOLO_ROUNDS_PER_ERA).toBe(8);
  });

  it('coal: only merchant-connected mines, nearest merchant first, flip with income advance + event', () => {
    const s = solo(10);
    place(s, 'coalbrookdale', 2, 'coal', { resources: 1 }); // 距 shrewsbury 1
    place(s, 'dudley', 0, 'coal', { level: 2, resources: 3 }); // 距 oxford 2
    place(s, 'cannock', 1, 'coal', { level: 2, resources: 3 }); // 不连通
    link(s, 20); // coalbrookdale-shrewsbury
    link(s, 3); // birmingham-dudley
    link(s, 5); // birmingham-oxford
    const coalMarket = s.coalMarket;
    const after = roundEnd(s, 3); // canal 3: coal 2, iron 1, beer 1
    expect(after.board.slots['coalbrookdale']![2]!.flipped).toBe(true);
    expect(after.board.slots['coalbrookdale']![2]!.resources).toBe(0);
    expect(after.board.slots['dudley']![0]!.resources).toBe(2);
    expect(after.board.slots['dudley']![0]!.flipped).toBe(false);
    expect(after.board.slots['cannock']![1]!.resources).toBe(3);
    expect(after.coalMarket).toBe(coalMarket);
    expect(after.players[0]!.incomeSpace).toBe(
      advanceIncomeSpace(INCOME_START_SPACE, tileDef('coal', 1)!.incomeAdvance),
    );
    const npc = after.lastEvents.filter((e) => e.kind === 'npc-consume');
    expect(npc).toEqual([
      { kind: 'npc-consume', location: 'coalbrookdale', slotIndex: 2, industry: 'coal', count: 1, flipped: true },
      { kind: 'npc-consume', location: 'dudley', slotIndex: 0, industry: 'coal', count: 1, flipped: false },
    ]);
    expect(after.lastEvents.some((e) => e.kind === 'flip' && e.location === 'coalbrookdale')).toBe(true);
  });

  it('coal: distance tie broken by location id', () => {
    const s = solo(11);
    place(s, 'redditch', 0, 'coal', { level: 2, resources: 3 }); // 距 gloucester 1
    place(s, 'coalbrookdale', 2, 'coal', { level: 2, resources: 3 }); // 距 shrewsbury 1
    link(s, 27); // gloucester-redditch
    link(s, 20); // coalbrookdale-shrewsbury
    const after = roundEnd(s, 1); // coal 1
    expect(after.board.slots['coalbrookdale']![2]!.resources).toBe(2);
    expect(after.board.slots['redditch']![0]!.resources).toBe(3);
  });

  it('iron: any unflipped iron works by location id, no connection needed; mixes sources', () => {
    const s = solo(12);
    place(s, 'redditch', 1, 'iron', { resources: 4 });
    place(s, 'coalbrookdale', 1, 'iron', { resources: 1 });
    const ironMarket = s.ironMarket;
    const after = roundEnd(s, 6); // canal 6: iron 2
    expect(after.board.slots['coalbrookdale']![1]!.flipped).toBe(true);
    expect(after.board.slots['redditch']![1]!.resources).toBe(3);
    expect(after.ironMarket).toBe(ironMarket);
    expect(after.lastEvents.filter((e) => e.kind === 'npc-consume')).toEqual([
      { kind: 'npc-consume', location: 'coalbrookdale', slotIndex: 1, industry: 'iron', count: 1, flipped: true },
      { kind: 'npc-consume', location: 'redditch', slotIndex: 1, industry: 'iron', count: 1, flipped: false },
    ]);
  });

  it('beer: only merchant-connected breweries; unconnected untouched; merchant barrels untouched', () => {
    const s = solo(13);
    place(s, 'walsall', 1, 'brewery', { resources: 1 }); // 不连通
    const merchantsBefore = JSON.stringify(s.merchants);
    let after = roundEnd(structuredClone(s), 3); // beer 1
    expect(after.board.slots['walsall']![1]!.resources).toBe(1);
    expect(after.lastEvents.filter((e) => e.kind === 'npc-consume')).toEqual([]);

    place(s, 'coalbrookdale', 0, 'brewery', { resources: 1 });
    link(s, 20);
    after = roundEnd(s, 3);
    expect(after.board.slots['coalbrookdale']![0]!.flipped).toBe(true);
    expect(after.board.slots['walsall']![1]!.resources).toBe(1);
    expect(JSON.stringify(after.merchants)).toBe(merchantsBefore);
    expect(after.lastEvents.filter((e) => e.kind === 'npc-consume')).toEqual([
      { kind: 'npc-consume', location: 'coalbrookdale', slotIndex: 0, industry: 'brewery', count: 1, flipped: true },
    ]);
  });

  it('flipped tiles are skipped; inner layer: empty stock with deposit is not flipped', () => {
    const s = solo(14, true);
    place(s, 'coalbrookdale', 1, 'iron', { resources: 0, flipped: true });
    place(s, 'redditch', 1, 'iron', { resources: 1, deposit: 3 });
    const after = roundEnd(s, 1); // iron 1
    expect(after.board.slots['redditch']![1]!.resources).toBe(0);
    expect(after.board.slots['redditch']![1]!.flipped).toBe(false);
  });

  it('demand settles before income (flip income advance is paid the same round)', () => {
    const s = solo(15);
    place(s, 'coalbrookdale', 2, 'coal', { resources: 1 });
    link(s, 20);
    const after = roundEnd(s, 1);
    const level = api.incomeLevelAt(after.players[0]!.incomeSpace);
    expect(level).toBeGreaterThan(0);
    expect(after.players[0]!.money).toBe(17 + level);
  });

  it('non-solo games never run NPC demand', () => {
    const s = newGame(2, 1);
    s.board.slots['coalbrookdale']![2] = { tile: tileDef('coal', 1)!, player: 0, flipped: false, resources: 1 };
    s.board.links.push({ linkIndex: 20, player: 0, era: 'canal' });
    s.round = 3;
    s.roundEndPending = true;
    const after = settleRoundEnd(s);
    expect(after.board.slots['coalbrookdale']![2]!.resources).toBe(1);
  });
});

describe('solo: era end and game end', () => {
  it('canal ends after 8 rounds, rail after 8 rounds, winner [0]', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let s = solo(seed, seed % 2 === 0);
      const agent = new api.RandomAgent(seed * 31);
      let canalRounds = 0;
      let steps = 0;
      while (s.phase !== 'game-over') {
        const prev = s;
        const legal = enumerateActions(s, 0);
        expect(legal.length).toBeGreaterThan(0);
        s = applyAction(s, agent.chooseAction(s, legal));
        steps++;
        expect(s.players[0]!.hand).toHaveLength(1 + s.players[0]!.permits!);
        expect(s.discard).toEqual([]);
        if (prev.era === 'canal' && s.era === 'rail') {
          canalRounds = prev.round;
          expect(s.round).toBe(1);
        }
        expect(steps).toBeLessThan(100);
      }
      expect(canalRounds).toBe(SOLO_ROUNDS_PER_ERA);
      // 运河 1 + 7×2 = 15，铁路 8×2 = 16
      expect(steps).toBe(31);
      expect(s.winner).toEqual([0]);
      expect(s.era).toBe('rail');
    }
  });

  it('playGame supports solo (playerCount 1)', () => {
    const { state, log } = playGame(1, 42);
    expect(state.phase).toBe('game-over');
    expect(state.rules.solo).toBe(true);
    expect(state.winner).toEqual([0]);
    expect(log).toHaveLength(31);
    // 纯重放
    let r = newGame(1, 42, { solo: true });
    for (const a of log) r = applyAction(r, a);
    expect(api.stableStringify(r)).toBe(api.stableStringify(state));
  });
});

describe('solo: rank', () => {
  it('thresholds', () => {
    expect(SOLO_TARGETS).toEqual({ bronze: 50, silver: 80, gold: 110 });
    expect(soloRank(0)).toBe('none');
    expect(soloRank(49)).toBe('none');
    expect(soloRank(50)).toBe('bronze');
    expect(soloRank(79)).toBe('bronze');
    expect(soloRank(80)).toBe('silver');
    expect(soloRank(109)).toBe('silver');
    expect(soloRank(110)).toBe('gold');
    expect(soloRank(200)).toBe('gold');
  });
});
