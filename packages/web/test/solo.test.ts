/** Solo 变体客户端（spec 2026-11-05 §3）。 */
import { describe, expect, it } from 'vitest';
import { enumerateActions, newGame, soloHand, type Action, type GameState } from '@brassline/engine';
import { cardChoices, reduce, start } from '../src/game/interactions';
import { createGameStore, loadSave, npcNotices, serializeSave } from '../src/game/store';
import { soloGameOverText } from '../src/hud/Overlay';

const legalOf = (s: GameState) => enumerateActions(s, s.turnOrder[s.currentPlayerIdx]!);

describe('solo store', () => {
  it('newGame({ solo }) makes a 1-player game with the synthetic hand', () => {
    const store = createGameStore();
    store.getState().newGame({ solo: true, seed: 5, innerLayer: true });
    const s = store.getState();
    expect(s.seats).toEqual(['human']);
    expect(s.state!.playerCount).toBe(1);
    expect(s.state!.rules.solo).toBe(true);
    expect(s.state!.rules.innerLayer).toBe(true);
    expect(s.state!.players[0]!.permits).toBe(1);
    expect(s.state!.players[0]!.hand).toEqual([
      { id: 'solo-industry', kind: 'wild-industry' },
      { id: 'solo-permit-0', kind: 'wild-location' },
    ]);
    expect(s.isBotTurn()).toBe(false);
    expect(s.currentPlayer()).toBe(0);
  });

  it('save v2 round-trips a solo game (seats / playerCount 1)', () => {
    const store = createGameStore();
    store.getState().newGame({ solo: true, seed: 6, innerLayer: true });
    for (let i = 0; i < 6; i++) store.getState().apply(legalOf(store.getState().state!)[0]!);
    const other = createGameStore();
    loadSave(other, serializeSave(store.getState()));
    expect(other.getState().seats).toEqual(['human']);
    expect(other.getState().state!.playerCount).toBe(1);
    expect(JSON.stringify(other.getState().state)).toBe(JSON.stringify(store.getState().state));
    expect(other.getState().plots).toEqual(store.getState().plots);
  });

  for (const innerLayer of [false, true]) {
    it(`plays a full solo game with first legal actions (innerLayer=${innerLayer})`, () => {
      const store = createGameStore();
      store.getState().newGame({ solo: true, seed: 21, innerLayer });
      let sawRail = false;
      let guard = 0;
      while (store.getState().state!.phase !== 'game-over' && guard++ < 2000) {
        store.getState().apply(store.getState().legal()[0]!);
        if (store.getState().state!.era === 'rail') sawRail = true;
      }
      const st = store.getState().state!;
      expect(st.phase).toBe('game-over');
      expect(sawRail).toBe(true);
      expect(st.winner).toEqual([0]);
      expect(store.getState().legal()).toEqual([]);
    });
  }

  it('pushes one 区域消耗 notice per npc-consume event at round end', () => {
    const store = createGameStore();
    store.getState().newGame({ solo: true, seed: 8, innerLayer: false });
    // 偏好建铁厂/煤矿（铁不要求连通商人），否则第一个合法行动；有界循环直到出现通知。
    const pick = (legal: Action[]) =>
      legal.find((a) => a.type === 'build' && a.industry === 'iron')
      ?? legal.find((a) => a.type === 'build' && a.industry === 'coal')
      ?? legal[0]!;
    let events = 0;
    let guard = 0;
    while (!store.getState().notices.some((n) => n.text.startsWith('区域消耗')) && guard++ < 60) {
      const st = store.getState().state!;
      if (st.phase === 'game-over') break;
      store.getState().apply(pick(store.getState().legal()));
      const after = store.getState().state!;
      if (after.lastEvents !== st.lastEvents) events += after.lastEvents.filter((e) => e.kind === 'npc-consume').length;
    }
    const npc = store.getState().notices.filter((n) => n.text.startsWith('区域消耗'));
    expect(npc.length).toBeGreaterThan(0);
    expect(npc.length).toBe(events);
    expect(npc[0]!.text).toMatch(/^区域消耗 \S+ (煤矿|铁厂|酿酒厂) \d+ (煤|铁|啤酒)/);
  });

  it('npcNotices formats flips with the following flip event income', () => {
    expect(npcNotices([
      { kind: 'npc-consume', location: 'dudley', slotIndex: 0, industry: 'coal', count: 2, flipped: true },
      { kind: 'flip', player: 0, location: 'dudley', incomeAdvance: 4 },
      { kind: 'npc-consume', location: 'dudley', slotIndex: 1, industry: 'iron', count: 1, flipped: false },
    ])).toEqual(['区域消耗 Dudley 煤矿 2 煤，煤矿翻面，收入 +4', '区域消耗 Dudley 铁厂 1 铁']);
  });

  it('game-over text shows VP, rank and thresholds', () => {
    expect(soloGameOverText(85)).toContain('评级：银');
    expect(soloGameOverText(10)).toContain('评级：未达标');
    expect(soloGameOverText(10)).toMatch(/铜 \d+ · 银 \d+ · 金 \d+/);
  });
});

describe('solo interactions', () => {
  it('card step auto-resolves with solo-industry', () => {
    const state = newGame(1, 3, { solo: true });
    const legal = legalOf(state);
    const pass = reduce(start(legal, state), { kind: 'type', type: 'pass' });
    expect(pass.step).toBe('confirm');
    expect(pass.chosen).toMatchObject({ type: 'pass', cardId: 'solo-industry' });
    // 开局自带 1 张许可证，所以建造会停在选卡步让玩家二选一；去掉许可证后直接进目标步
    const build = reduce(start(legal, state), { kind: 'type', type: 'build' });
    expect(build.step).toBe('card');
    const noPermit: GameState = { ...state, players: [{ ...state.players[0]!, permits: 0, hand: soloHand(0) }] };
    const legal0 = legalOf(noPermit);
    const build0 = reduce(start(legal0, noPermit), { kind: 'type', type: 'build' });
    expect(build0.step).toBe('target');
    expect(build0.cardId).toBe('solo-industry');
    expect(legal.some((a) => a.type === 'scout')).toBe(false);
  });

  it('build with permits stays on the card step with two choices', () => {
    const base = newGame(1, 3, { solo: true });
    const state: GameState = {
      ...base,
      players: [{ ...base.players[0]!, permits: 2, hand: soloHand(2) }],
    };
    const legal = legalOf(state);
    const ui = reduce(start(legal, state), { kind: 'type', type: 'build' });
    expect(ui.step).toBe('card');
    expect(cardChoices(ui)).toEqual(['solo-industry', 'solo-permit-0']);
    const permit = reduce(ui, { kind: 'card', cardId: 'solo-permit-0' });
    expect(permit.step).toBe('target');
    // 非建造照样自动跳过
    expect(reduce(start(legal, state), { kind: 'type', type: 'loan' }).step).toBe('confirm');
  });

  it('non-solo games keep the manual card step', () => {
    const state = newGame(2, 9);
    const ui = reduce(start(legalOf(state), state), { kind: 'type', type: 'pass' });
    expect(ui.step).toBe('card');
  });
});
