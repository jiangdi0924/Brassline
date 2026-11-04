import { describe, expect, it } from 'vitest';
import { applyBuild, enumerateBuilds } from '../src/actions/build.js';
import type { Card } from '../src/data/cards.js';
import { LINKS } from '../src/data/board.js';
import { tileDef } from '../src/data/tiles.js';
import { deliverResources, spendMoney } from '../src/deliver.js';
import { IllegalActionError } from '../src/errors.js';
import * as api from '../src/index.js';
import { consumeBeer, consumeCoal, consumeIron } from '../src/resources.js';
import { stableStringify } from '../src/serialize.js';
import { newGame, type GameState, type PlacedTile } from '../src/state.js';
import type { IndustryType, LocationId, PlayerIndex } from '../src/types.js';

// 数值锚点：起始 £17 / 收入格 10；煤市场 filled 13（1 空格 £1）；铁市场 filled 8（2 空格 £1）。
// coalbrookdale 槽位：[iron|brewery, iron, coal]；LINKS[20] = #21 coalbrookdale-shrewsbury。

const locCard = (location: LocationId): Card => ({ id: `loc-${location}-test`, kind: 'location', location });

function place(
  s: GameState,
  player: PlayerIndex,
  loc: LocationId,
  slot: number,
  industry: IndustryType,
  opts: { level?: number; resources?: number; deposit?: number; flipped?: boolean } = {},
): PlacedTile {
  const def = tileDef(industry, opts.level ?? 1)!;
  const t: PlacedTile = {
    tile: def,
    player,
    flipped: opts.flipped ?? false,
    resources: opts.resources ?? 0,
    ...(opts.deposit !== undefined ? { deposit: opts.deposit } : {}),
  };
  s.board.slots[loc]![slot] = t;
  return t;
}

function link(s: GameState, linkIndex: number, player: PlayerIndex = 1): void {
  s.board.links.push({ linkIndex, player, era: 'canal' });
}

function buildCoalAtDudley(s: GameState) {
  link(s, 3); // #4 birmingham-dudley
  link(s, 5); // #6 birmingham-oxford → dudley 连通商人位
  s.players[0]!.hand = [locCard('dudley')];
  return applyBuild(s, 0, { type: 'build', cardId: 'loc-dudley-test', industry: 'coal', location: 'dudley' });
}

describe('GameState.rules / newGame opts', () => {
  it('defaults to innerLayer false; explicit false is identical to default', () => {
    const a = newGame(4, 5);
    expect(a.rules).toEqual({ innerLayer: false });
    expect(stableStringify(newGame(4, 5, { innerLayer: false }))).toBe(stableStringify(a));
  });

  it('innerLayer true only changes the rules field (rng/deal unaffected) and survives serialization', () => {
    const on = newGame(3, 9, { innerLayer: true });
    const off = newGame(3, 9);
    expect(on.rules).toEqual({ innerLayer: true });
    expect({ ...on, rules: off.rules }).toEqual(off);
    const json = stableStringify(on);
    expect(json).toContain('"rules":{"innerLayer":true}');
    expect(stableStringify(JSON.parse(json))).toBe(json);
  });

  it('rules carry through applyAction', () => {
    const s = newGame(2, 3, { innerLayer: true });
    const p = s.turnOrder[0]!;
    const a = api.enumerateActions(s, p)[0]!;
    expect(api.applyAction(s, a).rules).toEqual({ innerLayer: true });
  });
});

describe('build with innerLayer', () => {
  it('flag off: coal mine pre-fills and sells to market exactly as before, no deposit field', () => {
    const r = buildCoalAtDudley(newGame(4, 5));
    const r2 = buildCoalAtDudley(newGame(4, 5, { innerLayer: false }));
    expect(stableStringify(r2)).toBe(stableStringify(r));
    const t = r.state.board.slots['dudley']![0]!;
    expect(t.resources).toBe(1);
    expect('deposit' in t).toBe(false);
    expect(r.state.coalMarket).toBe(14);
    expect(r.state.players[0]!.money).toBe(13);
  });

  it('flag on: coal mine placed with resources 0, deposit = resourcesPlaced, no sale, no money from sale', () => {
    const r = buildCoalAtDudley(newGame(4, 5, { innerLayer: true }));
    const t = r.state.board.slots['dudley']![0]!;
    expect(t.resources).toBe(0);
    expect(t.deposit).toBe(2);
    expect(t.flipped).toBe(false);
    expect(r.state.coalMarket).toBe(13);
    expect(r.state.players[0]!.money).toBe(12); // 17 - 5，无卖煤收入
    expect(r.events).toEqual([]);
  });

  it('flag on: iron works deposit 4, no market sale even though iron sells unconditionally', () => {
    const s = newGame(4, 5, { innerLayer: true });
    link(s, 20); // 连煤市场（铁厂需 1 煤）
    s.players[0]!.hand = [locCard('coalbrookdale')];
    const r = applyBuild(s, 0, { type: 'build', cardId: 'loc-coalbrookdale-test', industry: 'iron', location: 'coalbrookdale' });
    const t = r.state.board.slots['coalbrookdale']![1]!;
    expect(t.resources).toBe(0);
    expect(t.deposit).toBe(4);
    expect(r.state.ironMarket).toBe(8);
    expect(r.state.players[0]!.money).toBe(17 - 5 - 1);
  });

  it('flag on: brewery deposit = BREWERY_BARRELS[era], resources 0', () => {
    const s = newGame(4, 5, { innerLayer: true });
    s.players[0]!.hand = [locCard('burton-on-trent')];
    const r = applyBuild(s, 0, { type: 'build', cardId: 'loc-burton-on-trent-test', industry: 'brewery', location: 'burton-on-trent' });
    const t = r.state.board.slots['burton-on-trent']!.find((x) => x?.tile.industry === 'brewery')!;
    expect(t.resources).toBe(0);
    expect(t.deposit).toBe(1); // 运河时代

    const s2 = newGame(4, 5, { innerLayer: true });
    s2.era = 'rail';
    s2.players[0]!.tiles = s2.players[0]!.tiles.filter((x) => x.industry !== 'brewery' || x.level >= 2);
    s2.players[0]!.hand = [locCard('burton-on-trent')];
    const r2 = applyBuild(s2, 0, { type: 'build', cardId: 'loc-burton-on-trent-test', industry: 'brewery', location: 'burton-on-trent' });
    const t2 = r2.state.board.slots['burton-on-trent']!.find((x) => x?.tile.industry === 'brewery')!;
    expect(t2.deposit).toBe(2);
  });
});

describe('deliverResources', () => {
  it('coal connected to a merchant: delivered cubes sell to market; leftovers stay; flips when both 0', () => {
    expect(LINKS[20]).toMatchObject({ a: 'coalbrookdale', b: 'shrewsbury' });
    const s = newGame(4, 5, { innerLayer: true });
    link(s, 20);
    place(s, 0, 'coalbrookdale', 2, 'coal', { level: 2, deposit: 3 });
    s.coalMarket = 12; // 2 空格 £1,£1

    const r1 = deliverResources(s, 'coalbrookdale', 2, 1);
    expect(r1).toMatchObject({ delivered: 1, soldToMarket: 1, revenue: 1, flipped: [] });
    expect(r1.state.coalMarket).toBe(13);
    expect(r1.state.players[0]!.money).toBe(18);
    expect(r1.state.board.slots['coalbrookdale']![2]).toMatchObject({ resources: 0, deposit: 2, flipped: false });
    // 纯函数
    expect(s.board.slots['coalbrookdale']![2]!.deposit).toBe(3);
    expect(s.players[0]!.money).toBe(17);

    // 交付 2：市场只剩 1 空格 → 卖 1 留 1；deposit 归 0 但 resources 1 → 不翻
    const r2 = deliverResources(r1.state, 'coalbrookdale', 2, 5);
    expect(r2).toMatchObject({ delivered: 2, soldToMarket: 1, revenue: 1, flipped: [] });
    expect(r2.state.coalMarket).toBe(14);
    expect(r2.state.board.slots['coalbrookdale']![2]).toMatchObject({ resources: 1, deposit: 0, flipped: false });
  });

  it('coal sale empties both → flip and income advance', () => {
    const s = newGame(4, 5, { innerLayer: true });
    link(s, 20);
    place(s, 0, 'coalbrookdale', 2, 'coal', { deposit: 2 });
    s.coalMarket = 12;
    const r = deliverResources(s, 'coalbrookdale', 2, 2);
    expect(r).toMatchObject({ delivered: 2, soldToMarket: 2, revenue: 2 });
    expect(r.flipped).toEqual([{ kind: 'flip', player: 0, location: 'coalbrookdale', incomeAdvance: 4 }]);
    expect(r.state.board.slots['coalbrookdale']![2]).toMatchObject({ resources: 0, deposit: 0, flipped: true });
    expect(r.state.players[0]!.incomeSpace).toBe(14);
    expect(r.state.players[0]!.money).toBe(19);
  });

  it('coal not connected to any merchant: nothing sold', () => {
    const s = newGame(4, 5, { innerLayer: true });
    place(s, 0, 'coalbrookdale', 2, 'coal', { deposit: 2 });
    s.coalMarket = 12;
    const r = deliverResources(s, 'coalbrookdale', 2, 2);
    expect(r).toMatchObject({ delivered: 2, soldToMarket: 0, revenue: 0, flipped: [] });
    expect(r.state.coalMarket).toBe(12);
    expect(r.state.players[0]!.money).toBe(17);
    expect(r.state.board.slots['coalbrookdale']![2]).toMatchObject({ resources: 2, deposit: 0, flipped: false });
  });

  it('iron sells unconditionally (no links) to the owner', () => {
    const s = newGame(4, 5, { innerLayer: true });
    place(s, 1, 'coalbrookdale', 1, 'iron', { deposit: 4 });
    const r = deliverResources(s, 'coalbrookdale', 1, 3);
    expect(r).toMatchObject({ delivered: 3, soldToMarket: 2, revenue: 2, flipped: [] });
    expect(r.state.ironMarket).toBe(10);
    expect(r.state.players[1]!.money).toBe(19);
    expect(r.state.players[0]!.money).toBe(17);
    expect(r.state.board.slots['coalbrookdale']![1]).toMatchObject({ resources: 1, deposit: 1 });
  });

  it('beer never sells; delivering last barrel does not flip while barrels remain', () => {
    const s = newGame(4, 5, { innerLayer: true });
    link(s, 20);
    place(s, 0, 'coalbrookdale', 0, 'brewery', { deposit: 2 });
    const r = deliverResources(s, 'coalbrookdale', 0, 2);
    expect(r).toMatchObject({ delivered: 2, soldToMarket: 0, revenue: 0, flipped: [] });
    expect(r.state.board.slots['coalbrookdale']![0]).toMatchObject({ resources: 2, deposit: 0, flipped: false });
    expect(r.state.players[0]!.money).toBe(17);
  });

  it('delivers 0 on flipped tiles, empty deposit, or n <= 0', () => {
    const s = newGame(4, 5, { innerLayer: true });
    place(s, 0, 'coalbrookdale', 2, 'coal', { deposit: 2, flipped: true });
    place(s, 0, 'coalbrookdale', 1, 'iron', { deposit: 0, resources: 1 });
    place(s, 0, 'coalbrookdale', 0, 'brewery', { deposit: 1 });
    for (const [slot, n] of [[2, 2], [1, 3], [0, 0]] as const) {
      const r = deliverResources(s, 'coalbrookdale', slot, n);
      expect(r).toEqual({ state: s, delivered: 0, soldToMarket: 0, revenue: 0, flipped: [] });
    }
  });

  it('throws on empty slot or non-resource tile', () => {
    const s = newGame(4, 5, { innerLayer: true });
    expect(() => deliverResources(s, 'coalbrookdale', 2, 1)).toThrowError(IllegalActionError);
    place(s, 0, 'birmingham', 0, 'cotton');
    expect(() => deliverResources(s, 'birmingham', 0, 1)).toThrowError(IllegalActionError);
  });

  it('is exported from the package entry', () => {
    expect(api.deliverResources).toBe(deliverResources);
    expect(api.spendMoney).toBe(spendMoney);
  });
});

describe('drain with deposit', () => {
  it('coal mine drained to 0 with deposit left does not flip', () => {
    const s = newGame(4, 5, { innerLayer: true });
    place(s, 1, 'dudley', 0, 'coal', { resources: 1, deposit: 2 });
    const r = consumeCoal(s, 0, 'dudley', 1);
    expect(r.flipped).toEqual([]);
    expect(r.state.board.slots['dudley']![0]).toMatchObject({ resources: 0, deposit: 2, flipped: false });
    // 库存 0 的矿不是来源：再取 1 块须走市场（dudley 不连通商人位 → 抛错）
    expect(() => consumeCoal(r.state, 0, 'dudley', 1)).toThrowError(/coal-not-connected/);
  });

  it('drained to 0 with deposit 0 flips as usual', () => {
    const s = newGame(4, 5, { innerLayer: true });
    place(s, 1, 'dudley', 0, 'coal', { resources: 1, deposit: 0 });
    const r = consumeCoal(s, 0, 'dudley', 1);
    expect(r.flipped).toHaveLength(1);
  });

  it('iron and beer drains respect deposit too', () => {
    const s = newGame(4, 5, { innerLayer: true });
    place(s, 1, 'coalbrookdale', 1, 'iron', { resources: 1, deposit: 1 });
    const ri = consumeIron(s, 0, 1);
    expect(ri.flipped).toEqual([]);
    place(s, 0, 'coalbrookdale', 0, 'brewery', { resources: 1, deposit: 1 });
    const rb = consumeBeer(s, 0, 1, { at: 'coalbrookdale', useMerchantBeer: false });
    expect(rb.flipped).toEqual([]);
    expect(rb.state.board.slots['coalbrookdale']![0]).toMatchObject({ resources: 0, flipped: false });
  });
});

describe('overbuild opponent with deposit', () => {
  it('opponent coal mine with deposit > 0 counts as cubes on the board', () => {
    const s = newGame(4, 5, { innerLayer: true });
    s.coalMarket = 0;
    place(s, 1, 'dudley', 0, 'coal', { resources: 0, deposit: 1 });
    s.players[0]!.tiles = s.players[0]!.tiles.filter((t) => t.industry !== 'coal' || t.level >= 2);
    s.players[0]!.hand = [locCard('dudley')];
    const coalAtDudley = () =>
      enumerateBuilds(s, 0).some((a) => a.type === 'build' && a.industry === 'coal' && a.location === 'dudley');
    expect(coalAtDudley()).toBe(false);
    s.board.slots['dudley']![0]!.deposit = 0;
    expect(coalAtDudley()).toBe(true);
  });

  it('opponent iron works with deposit > 0 blocks iron overbuild', () => {
    const s = newGame(4, 5, { innerLayer: true });
    s.ironMarket = 0;
    s.coalMarket = 14;
    link(s, 20);
    place(s, 1, 'coalbrookdale', 1, 'iron', { resources: 0, deposit: 2 });
    place(s, 1, 'coalbrookdale', 0, 'iron', { resources: 0, deposit: 0, flipped: true });
    s.players[0]!.tiles = s.players[0]!.tiles.filter((t) => t.industry !== 'iron' || t.level >= 2);
    s.players[0]!.hand = [locCard('coalbrookdale')];
    const ironHere = () =>
      enumerateBuilds(s, 0).some((a) => a.type === 'build' && a.industry === 'iron' && a.location === 'coalbrookdale');
    expect(ironHere()).toBe(false);
    s.board.slots['coalbrookdale']![1]!.deposit = 0;
    expect(ironHere()).toBe(true);
  });
});

describe('spendMoney', () => {
  it('deducts money purely', () => {
    const s = newGame(2, 1, { innerLayer: true });
    const n = spendMoney(s, 1, 5);
    expect(n.players[1]!.money).toBe(12);
    expect(n.players[1]!.spentThisRound).toBe(0);
    expect(s.players[1]!.money).toBe(17);
    expect(spendMoney(s, 0, 17).players[0]!.money).toBe(0);
  });

  it('throws insufficient-money when short', () => {
    const s = newGame(2, 1, { innerLayer: true });
    let err: unknown;
    try {
      spendMoney(s, 0, 18);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(IllegalActionError);
    expect((err as IllegalActionError).code).toBe('insufficient-money');
  });
});
