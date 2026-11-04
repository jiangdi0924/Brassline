import { describe, expect, it } from 'vitest';
import { applyAction, enumerateActions, newGame, type Action } from '@brassline/engine';
import { highlightsFor, reduce, start, type Interaction } from '../src/game/interactions';

function setup(seed = 9) {
  const state = newGame(2, seed);
  const player = state.turnOrder[state.currentPlayerIdx]!;
  return { state, legal: enumerateActions(state, player), player };
}

function slotTargets(keys: Set<string>) {
  return [...keys].map((k) => {
    const [id, idx] = k.split(':');
    return { kind: 'slot' as const, id: id!, slotIndex: Number(idx) };
  });
}

describe('interactions', () => {
  it('starts idle and narrows candidates by action type', () => {
    const { legal } = setup();
    let ui: Interaction = start(legal);
    expect(ui.step).toBe('type');
    ui = reduce(ui, { kind: 'type', type: 'build' });
    expect(ui.step).toBe('card');
    expect(ui.candidates.every((a) => a.type === 'build')).toBe(true);
  });

  it('build: picking a card then a slot yields a single confirmable action', () => {
    const { legal } = setup();
    let ui = reduce(start(legal), { kind: 'type', type: 'build' });
    const card = (ui.candidates[0] as Extract<Action, { type: 'build' }>).cardId;
    ui = reduce(ui, { kind: 'card', cardId: card });
    expect(ui.step).toBe('target');
    const hl = highlightsFor(ui);
    expect(hl.slots.size).toBeGreaterThan(0);
    const first = [...hl.slots][0]!;
    const [loc, idx] = first.split(':');
    ui = reduce(ui, { kind: 'pick', target: { kind: 'slot', id: loc!, slotIndex: Number(idx) } });
    expect(ui.step).toBe('confirm');
    expect(ui.chosen?.type).toBe('build');
  });

  // 对若干局面、每张卡、每个高亮槽：点击都得到恰好进入 confirm，且 chosen 来自 enumerateActions。
  for (const withState of [true, false]) {
    it(`build: every highlighted slot confirms to a legal action (state=${withState})`, () => {
      let { state } = setup();
      let checkedTurns = 0;
      for (let turn = 0; turn < 12; turn++) {
        const player = state.turnOrder[state.currentPlayerIdx]!;
        const legal = enumerateActions(state, player);
        const base = reduce(start(legal, withState ? state : undefined), { kind: 'type', type: 'build' });
        const cards = new Set(base.step === 'card' ? base.candidates.map((a) => (a as { cardId: string }).cardId) : []);
        checkedTurns += cards.size > 0 ? 1 : 0;
        for (const cardId of cards) {
          const ui = reduce(base, { kind: 'card', cardId });
          expect(ui.step).toBe('target');
          const targets = slotTargets(highlightsFor(ui).slots);
          expect(targets.length).toBeGreaterThan(0);
          for (const target of targets) {
            const after = reduce(ui, { kind: 'pick', target });
            expect(after.step, `${cardId} ${target.id}:${target.slotIndex}`).toBe('confirm');
            expect(legal).toContain(after.chosen);
            expect(after.candidates.every((a) => legal.includes(a))).toBe(true);
            if (withState) {
              // 精确模式：chosen 实际落在被点的槽位
              const next = applyAction(state, after.chosen!);
              expect(next.board.slots[target.id]![target.slotIndex], `${cardId} ${target.id}:${target.slotIndex}`).not.toBeNull();
              expect(next.board.slots[target.id]![target.slotIndex]).not.toBe(state.board.slots[target.id]![target.slotIndex]);
            }
            // 变体切换只能在候选内
            for (let v = 0; v < after.candidates.length; v++) {
              const sw = reduce(after, { kind: 'variant', index: v });
              expect(legal).toContain(sw.chosen);
            }
          }
        }
        const next = legal.find((a) => a.type === 'build') ?? legal.find((a) => a.type === 'network') ?? legal[0]!;
        state = applyAction(state, next);
      }
      expect(checkedTurns).toBeGreaterThan(5);
    });
  }

  it('clicking a non-highlighted slot is ignored', () => {
    const { legal, state } = setup();
    let ui = reduce(start(legal, state), { kind: 'type', type: 'build' });
    ui = reduce(ui, { kind: 'card', cardId: (ui.candidates[0] as { cardId: string }).cardId });
    const after = reduce(ui, { kind: 'pick', target: { kind: 'slot', id: 'nonexistent', slotIndex: 0 } });
    expect(after).toBe(ui);
  });

  it('network: one link then done confirms a legal action', () => {
    const { legal } = setup();
    let ui = reduce(start(legal), { kind: 'type', type: 'network' });
    ui = reduce(ui, { kind: 'card', cardId: (ui.candidates[0] as { cardId: string }).cardId });
    expect(ui.step).toBe('target');
    const link = [...highlightsFor(ui).links][0]!;
    ui = reduce(ui, { kind: 'pick', target: { kind: 'link', linkIndex: link } });
    if (ui.step !== 'confirm') ui = reduce(ui, { kind: 'done' });
    expect(ui.step).toBe('confirm');
    expect(legal).toContain(ui.chosen);
  });

  it('develop: picking an industry confirms a legal action', () => {
    const { legal } = setup();
    let ui = reduce(start(legal), { kind: 'type', type: 'develop' });
    ui = reduce(ui, { kind: 'card', cardId: (ui.candidates[0] as { cardId: string }).cardId });
    expect(ui.step).toBe('target');
    ui = reduce(ui, { kind: 'pick', target: { kind: 'location', id: 'industry:coal' } });
    if (ui.step !== 'confirm') ui = reduce(ui, { kind: 'done' });
    expect(ui.step).toBe('confirm');
    expect(legal).toContain(ui.chosen);
    expect((ui.chosen as Extract<Action, { type: 'develop' }>).removals).toEqual(['coal']);
  });

  it('loan goes straight to confirm after a card', () => {
    const { legal } = setup();
    let ui = reduce(start(legal), { kind: 'type', type: 'loan' });
    ui = reduce(ui, { kind: 'card', cardId: (ui.candidates[0] as { cardId: string }).cardId });
    expect(ui.step).toBe('confirm');
    expect(legal).toContain(ui.chosen);
  });

  it('scout: picking the first discard card reaches confirm with a legal scout', () => {
    const { legal } = setup();
    let ui = reduce(start(legal), { kind: 'type', type: 'scout' });
    expect(ui.step).toBe('card');
    const first = ui.candidates[0] as Extract<Action, { type: 'scout' }>;
    ui = reduce(ui, { kind: 'card', cardId: first.cardIds[0] });
    expect(ui.step).toBe('confirm');
    expect(ui.chosen?.type).toBe('scout');
    expect(legal).toContain(ui.chosen);
  });

  it('cancel returns to type selection', () => {
    const { legal } = setup();
    let ui = reduce(start(legal), { kind: 'type', type: 'network' });
    ui = reduce(ui, { kind: 'cancel' });
    expect(ui.step).toBe('type');
  });
});
