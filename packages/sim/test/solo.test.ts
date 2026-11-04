import { describe, expect, it } from 'vitest';
import { GreedyAgent } from '@brassline/bots';
import { stableStringify } from '@brassline/engine';
import { SOLO_ERA_PERMIT, SOLO_STARTING_PERMITS } from '@brassline/engine';
import { aggregateSolo, calibrateTargets, median, percentile, playSolo } from '../src/solo.js';

const greedy = (seed: number) => [new GreedyAgent(seed * 10)];

describe('playSolo', () => {
  it('a random solo game completes with winner [0]', () => {
    const { state, summary } = playSolo(1);
    expect(state.phase).toBe('game-over');
    expect(state.era).toBe('rail');
    expect(state.winner).toEqual([0]);
    expect(summary.vp).toBe(state.players[0]!.vp);
    expect(summary.actionMix.scout).toBe(0);
  });

  it('a greedy solo game completes with winner [0]', () => {
    const { state } = playSolo(2, greedy(2));
    expect(state.phase).toBe('game-over');
    expect(state.winner).toEqual([0]);
  });

  it('is deterministic: same seed twice gives identical state and summary', () => {
    const a = playSolo(7, greedy(7));
    const b = playSolo(7, greedy(7));
    expect(stableStringify(a.state)).toBe(stableStringify(b.state));
    expect(a.summary).toEqual(b.summary);
  });

  it('summary and aggregate have the expected shape', () => {
    const runs = [3, 4, 5].map((s) => playSolo(s, greedy(s)).summary);
    for (const s of runs) {
      expect(['none', 'bronze', 'silver', 'gold']).toContain(s.rank);
      expect(s.permitsEarned).toBeGreaterThanOrEqual(0);
      // 开局自带 SOLO_STARTING_PERMITS 张，进铁路时代再加 SOLO_ERA_PERMIT 张（引擎 data/solo.ts）
      const granted = s.permitsEarned + SOLO_STARTING_PERMITS + SOLO_ERA_PERMIT;
      expect(s.permitsUsed + s.permitsDiscarded).toBeLessThanOrEqual(granted);
      expect(s.permitsAtEnd).toBe(granted - s.permitsUsed - s.permitsDiscarded);
      for (const era of ['canal', 'rail'] as const) {
        for (const k of ['coal', 'iron', 'beer'] as const) {
          expect(s.npcConsumed[era][k]).toBeGreaterThanOrEqual(0);
          expect(s.npcShortfall[era][k]).toBeGreaterThanOrEqual(0);
        }
      }
      expect(s.resourceFlipsByNpc + s.resourceFlipsBySelf).toBeLessThanOrEqual(s.resourceTilesBuilt);
    }
    const agg = aggregateSolo(runs);
    expect(agg.vp.games).toBe(3);
    expect(agg.vp['vp.median']).toBe(median(runs.map((s) => s.vp)));
    expect(agg.vp['rank.none'] + agg.vp['rank.bronze'] + agg.vp['rank.silver'] + agg.vp['rank.gold']).toBeCloseTo(1, 1);
    expect(Object.keys(agg.npc)).toEqual(['canal', 'rail']);
    expect(agg.npc.canal!['coal demand/round']).toBeCloseTo((1 * 2 + 2 * 3 + 2 * 3) / 8);
    expect(agg.tiles).toHaveProperty('flips.byNpc');
    const t = calibrateTargets(runs);
    expect(t.gold).toBe(Math.round(t.silver * 1.35));
  });

  it('a solo + inner game completes and is deterministic', () => {
    const a = playSolo(5, greedy(5), { inner: true });
    const b = playSolo(5, greedy(5), { inner: true });
    expect(a.state.phase).toBe('game-over');
    expect(a.state.winner).toEqual([0]);
    expect(a.state.rules.innerLayer).toBe(true);
    expect(a.state.rules.solo).toBe(true);
    expect(a.summary.inner).toBeDefined();
    expect(stableStringify(a.state)).toBe(stableStringify(b.state));
  });
});

describe('percentile helpers', () => {
  it('median / nearest-rank p90', () => {
    expect(median([3, 1, 2, 4])).toBe(2.5);
    expect(percentile([...Array(10).keys()].map((i) => i + 1), 0.9)).toBe(9);
  });
});
