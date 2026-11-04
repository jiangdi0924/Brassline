import { describe, expect, it } from 'vitest';
import { GreedyAgent } from '@brassline/bots';
import { applyAction, enumerateActions, newGame, stableStringify } from '@brassline/engine';
import type { PlayerAgent } from '@brassline/engine';
import { playGameInner } from '../src/inner.js';
import { aggregate, summarize } from '../src/stats.js';

const greedy = (pc: number, seed: number): PlayerAgent[] =>
  Array.from({ length: pc }, (_, i) => new GreedyAgent(seed * 10 + i));

describe('playGameInner', () => {
  it.each([2, 4] as const)('completes a %i-player inner game to game-over', (pc) => {
    const { state, log, innerStats } = playGameInner(pc, 3);
    expect(state.phase).toBe('game-over');
    expect(state.era).toBe('rail');
    expect(log.length).toBeGreaterThan(0);
    expect(innerStats.cubesDelivered).toBeGreaterThanOrEqual(innerStats.soldToMarket);
  });

  it('is deterministic: two runs of the same seed give identical state', () => {
    const a = playGameInner(3, 11, greedy(3, 11));
    const b = playGameInner(3, 11, greedy(3, 11));
    expect(stableStringify(a.state)).toBe(stableStringify(b.state));
    expect(a.innerStats).toEqual(b.innerStats);
    expect(stableStringify(a.plots)).toBe(stableStringify(b.plots));
  });

  it('a freshly built coal mine has resources 0 and deposit > 0', () => {
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const seats = greedy(2, seed);
      let state = newGame(2, seed, { innerLayer: true });
      for (let i = 0; i < 400 && state.phase !== 'game-over'; i++) {
        const player = state.turnOrder[state.currentPlayerIdx]!;
        const action = seats[player]!.chooseAction(state, enumerateActions(state, player));
        state = applyAction(state, action);
        if (action.type === 'build' && action.industry === 'coal') {
          const slots = state.board.slots[action.location]!;
          const tile = slots.find((t) => t && t.tile.industry === 'coal' && t.player === player && !t.flipped && (t.deposit ?? 0) > 0);
          expect(tile).toBeDefined();
          expect(tile!.resources).toBe(0);
          expect(tile!.deposit).toBe(tile!.tile.resourcesPlaced);
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('greedy bots get at least one delivery over a full game', () => {
    const { innerStats, state, log } = playGameInner(2, 5, greedy(2, 5));
    expect(innerStats.deliveries).toBeGreaterThan(0);
    expect(innerStats.cubesDelivered).toBeGreaterThan(0);
    expect(innerStats.actionsToFirstDelivery).not.toBeNull();
    const agg = aggregate([summarize(state, log, innerStats)]);
    expect(agg['inner.cubesDelivered']).toBe(innerStats.cubesDelivered);
  });
});
