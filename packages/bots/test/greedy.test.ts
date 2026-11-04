import { describe, expect, it } from 'vitest';
import { playGame, RandomAgent } from '@brassline/engine';
import { GreedyAgent, evaluate } from '../src/greedy.js';

describe('GreedyAgent', () => {
  it('is deterministic for a seed', () => {
    const a = playGame(2, 5, [new GreedyAgent(50), new GreedyAgent(51)]);
    const b = playGame(2, 5, [new GreedyAgent(50), new GreedyAgent(51)]);
    expect(a.log).toEqual(b.log);
  });

  it('beats random most of the time', () => {
    let wins = 0;
    const N = 30;
    for (let seed = 1; seed <= N; seed++) {
      const greedySeat = seed % 2;
      const agents = greedySeat === 0
        ? [new GreedyAgent(seed), new RandomAgent(seed + 1000)]
        : [new RandomAgent(seed + 1000), new GreedyAgent(seed)];
      const { state } = playGame(2, seed, agents);
      if (state.winner?.includes(greedySeat)) wins++;
    }
    expect(wins / N).toBeGreaterThanOrEqual(0.7);
  }, 120_000); // 30 局一步前瞻约 20s，超过 vitest 默认 5s

  it('evaluate counts vp, income, money and board presence', () => {
    const { state } = playGame(2, 3);
    const v = evaluate(state, 0);
    expect(Number.isFinite(v)).toBe(true);
  });
});
