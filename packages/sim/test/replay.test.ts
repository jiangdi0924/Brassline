import { describe, expect, it } from 'vitest';
import { applyAction, newGame, playGame, stableStringify } from '@brassline/engine';
import { summarize } from '../src/stats.js';

describe('self-play', () => {
  it('replays a logged game to a byte-identical final state', () => {
    const { state, log } = playGame(2, 42);
    let replay = newGame(2, 42);
    for (const a of log) replay = applyAction(replay, a, { assumeLegal: true });
    expect(stableStringify(replay)).toBe(stableStringify(state));
    expect(state.phase).toBe('game-over');
    expect(state.era).toBe('rail');
  });

  it('summarizes a game', () => {
    const { state, log } = playGame(3, 7);
    const s = summarize(state, log);
    expect(s.playerCount).toBe(3);
    expect(s.actions).toBe(log.length);
    expect(s.vp.length).toBe(3);
    expect(Object.values(s.actionMix).reduce((a, b) => a + b, 0)).toBe(log.length);
  });
});
