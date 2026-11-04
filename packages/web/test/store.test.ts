import { beforeEach, describe, expect, it } from 'vitest';
import { enumerateActions, tileDef, type Action, type GameState } from '@brassline/engine';
import { COSTS, throughputPerMinute } from '@brassline/factory';
import { createGameStore, serializeSave, loadSave } from '../src/game/store';

describe('game store', () => {
  let store: ReturnType<typeof createGameStore>;
  beforeEach(() => {
    store = createGameStore();
    store.getState().newGame({ playerCount: 2, seed: 11, seats: ['human', 'human'] });
  });

  it('starts a game and applies a legal action', () => {
    const s = store.getState();
    const player = s.state!.turnOrder[s.state!.currentPlayerIdx]!;
    const legal = enumerateActions(s.state!, player);
    s.apply(legal[0]!);
    expect(store.getState().log.length).toBe(1);
  });

  it('round-trips a save through replay', () => {
    const s = store.getState();
    const player = s.state!.turnOrder[s.state!.currentPlayerIdx]!;
    s.apply(enumerateActions(s.state!, player)[0]!);
    const json = serializeSave(store.getState());
    const other = createGameStore();
    loadSave(other, json);
    expect(other.getState().log).toEqual(store.getState().log);
    expect(JSON.stringify(other.getState().state)).toBe(JSON.stringify(store.getState().state));
  });

  it('runs bot seats automatically', () => {
    store.getState().newGame({ playerCount: 2, seed: 3, seats: ['bot', 'bot'] });
    store.getState().runBotsUntilHumanOrEnd();
    expect(store.getState().state!.phase).toBe('game-over');
  });
});


function passAction(s: GameState): Action {
  const p = s.turnOrder[s.currentPlayerIdx]!;
  const legal = enumerateActions(s, p);
  return legal.find((a) => a.type === 'pass') ?? legal.find((a) => a.type === 'loan') ?? legal[0]!;
}

/** 在 dudley 槽 0（煤）给 player 放一块内层煤矿：库存 0，矿量 deposit。 */
function injectCoal(store: ReturnType<typeof createGameStore>, player: number, deposit: number) {
  const st = structuredClone(store.getState().state!);
  st.board.slots['dudley']![0] = { tile: tileDef('coal', 1)!, player, flipped: false, resources: 0, deposit };
  store.setState({ state: st });
}

describe('inner layer (P3 §3)', () => {
  let store: ReturnType<typeof createGameStore>;
  beforeEach(() => {
    store = createGameStore();
    store.getState().newGame({ playerCount: 2, seed: 11, seats: ['human', 'human'], innerLayer: true });
  });

  it('creates and steps a plot for every unflipped resource tile after apply', () => {
    expect(store.getState().state!.rules.innerLayer).toBe(true);
    injectCoal(store, 0, 2);
    store.getState().apply(passAction(store.getState().state!));
    const plot = store.getState().plots['dudley:0'];
    expect(plot).toBeDefined();
    expect(plot!.kind).toBe('coal');
    expect(plot!.time).toBe(20);
    expect(store.getState().plotsBefore['dudley:0']!.time).toBe(0);
    store.getState().apply(passAction(store.getState().state!));
    expect(store.getState().plots['dudley:0']!.time).toBe(40);
  });

  it('delivers into the engine once the default line reaches the dock', () => {
    injectCoal(store, 0, 2);
    for (let i = 0; i < 5; i++) store.getState().apply(passAction(store.getState().state!));
    const t = store.getState().state!.board.slots['dudley']![0]!;
    expect(t.deposit).toBe(1);
    // dudley 无连接 → 卖不出市场，留在板上
    expect(t.resources).toBe(1);
    const n = store.getState().notices;
    expect(n.length).toBe(1);
    expect(n[0]!.text).toContain('Dudley 煤矿交付 1 煤');
  });

  it('stops stepping once deposit is exhausted but the tile still holds stock', () => {
    injectCoal(store, 0, 1);
    for (let i = 0; i < 5; i++) store.getState().apply(passAction(store.getState().state!));
    const t = store.getState().state!.board.slots['dudley']![0]!;
    expect(t.deposit).toBe(0);
    expect(t.resources).toBe(1);
    // deposit 0 但未翻面：厂区保留但不再推进
    const time = store.getState().plots['dudley:0']!.time;
    store.getState().apply(passAction(store.getState().state!));
    expect(store.getState().plots['dudley:0']!.time).toBe(time);
  });

  it('drops plots when the tile disappears', () => {
    injectCoal(store, 0, 2);
    store.getState().apply(passAction(store.getState().state!));
    const st = structuredClone(store.getState().state!);
    st.board.slots['dudley']![0] = null;
    store.setState({ state: st });
    store.getState().apply(passAction(store.getState().state!));
    expect(store.getState().plots['dudley:0']).toBeUndefined();
  });

  it('placeInPlot charges the owner, doubles throughput, and refuses when broke or invalid', () => {
    injectCoal(store, 0, 2);
    store.getState().apply(passAction(store.getState().state!));
    // 两人热座：只能在主人自己的回合编辑
    const cur = store.getState().currentPlayer();
    if (cur !== 0) {
      expect(store.getState().placeInPlot('dudley:0', 'drill', 0, 2, 0)).toBe('只能在自己的回合编辑');
      store.getState().apply(passAction(store.getState().state!));
    }
    expect(store.getState().currentPlayer()).toBe(0);
    const money = store.getState().state!.players[0]!.money;
    const before = throughputPerMinute(store.getState().plots['dudley:0']!);
    expect(store.getState().placeInPlot('dudley:0', 'drill', 0, 2, 0)).toBe('');
    expect(store.getState().placeInPlot('dudley:0', 'belt', 1, 2, 0)).toBe('');
    expect(store.getState().placeInPlot('dudley:0', 'belt', 2, 2, 1)).toBe('');
    expect(store.getState().state!.players[0]!.money).toBe(money - COSTS.drill);
    expect(throughputPerMinute(store.getState().plots['dudley:0']!)).toBeCloseTo(before * 2);
    expect(store.getState().placeInPlot('dudley:0', 'drill', 5, 5, 0)).toBe('钻机只能放在矿源格');
    expect(store.getState().rotateInPlot('dudley:0', 1, 2, 1)).toBe('');
    expect(store.getState().removeFromPlot('dudley:0', 1, 2)).toBe('');
    expect(store.getState().removeFromPlot('dudley:0', 1, 2)).toBe('该格没有建筑');
    const st = structuredClone(store.getState().state!);
    st.players[0]!.money = 1;
    store.setState({ state: st });
    expect(store.getState().placeInPlot('dudley:0', 'drill', 0, 4, 0)).toMatch(/钱不够/);
    expect(store.getState().state!.players[0]!.money).toBe(1);
  });

  it('only human owners may edit', () => {
    store.getState().newGame({ playerCount: 2, seed: 11, seats: ['human', 'bot'], innerLayer: true });
    injectCoal(store, 1, 2);
    store.getState().apply(passAction(store.getState().state!));
    expect(store.getState().placeInPlot('dudley:0', 'drill', 0, 2, 0)).toBe('只有板块主人可以编辑');
  });

  it('round-trips a v2 save without replay', () => {
    injectCoal(store, 0, 2);
    for (let i = 0; i < 5; i++) store.getState().apply(passAction(store.getState().state!));
    const json = serializeSave(store.getState());
    expect(JSON.parse(json).version).toBe(2);
    const other = createGameStore();
    loadSave(other, json);
    const a = other.getState();
    const b = store.getState();
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.plots).toEqual(b.plots);
    expect(a.log).toEqual(b.log);
    expect(a.actors).toEqual(b.actors);
    expect(a.notices).toEqual(b.notices);
    // 继续推进结果一致
    a.apply(passAction(a.state!));
    b.apply(passAction(b.state!));
    expect(JSON.stringify(other.getState().state)).toBe(JSON.stringify(store.getState().state));
  });

  it('still loads v1 saves by replay', () => {
    const v1 = createGameStore();
    v1.getState().newGame({ playerCount: 2, seed: 4, seats: ['human', 'human'] });
    v1.getState().apply(passAction(v1.getState().state!));
    const json = JSON.stringify({ version: 1, playerCount: 2, seed: 4, seats: ['human', 'human'], actions: v1.getState().log });
    const other = createGameStore();
    loadSave(other, json);
    expect(JSON.stringify(other.getState().state)).toBe(JSON.stringify(v1.getState().state));
  });

  it('bots play a full inner-layer game without errors', () => {
    store.getState().newGame({ playerCount: 2, seed: 3, seats: ['bot', 'bot'], innerLayer: true });
    store.getState().runBotsUntilHumanOrEnd();
    expect(store.getState().state!.phase).toBe('game-over');
    expect(store.getState().notices.length).toBeGreaterThan(0);
  });
});
