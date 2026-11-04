/**
 * 自对弈 CLI：pnpm sim -- --games 200 --players 2,3,4 --seed 1 [--bot greedy]
 * 每局：playGame → 重放校验 → 统计；任何异常立即打印种子并退出 1。
 */
import { GreedyAgent } from '@brassline/bots';
import { applyAction, newGame, playGame, stableStringify } from '@brassline/engine';
import type { PlayerAgent } from '@brassline/engine';
import { aggregate, summarize, type GameSummary } from './stats.js';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
}

const games = Number(arg('games', '50'));
const counts = arg('players', '2,3,4').split(',').map(Number) as (2 | 3 | 4)[];
const seed0 = Number(arg('seed', '1'));
const bot = arg('bot', 'random');
function agents(pc: number, seed: number): PlayerAgent[] | undefined {
  if (bot !== 'greedy') return undefined;
  return Array.from({ length: pc }, (_, i) => new GreedyAgent(seed * 10 + i));
}

for (const pc of counts) {
  const summaries: GameSummary[] = [];
  const t0 = performance.now();
  for (let g = 0; g < games; g++) {
    const seed = seed0 + g;
    try {
      const { state, log } = playGame(pc, seed, agents(pc, seed));
      let replay = newGame(pc, seed);
      for (const a of log) replay = applyAction(replay, a, { assumeLegal: true });
      if (stableStringify(replay) !== stableStringify(state)) {
        throw new Error(`replay mismatch (players ${pc}, seed ${seed})`);
      }
      summaries.push(summarize(state, log));
    } catch (e) {
      console.error(`FAILED players=${pc} seed=${seed}:`, e);
      process.exit(1);
    }
  }
  const ms = performance.now() - t0;
  console.log(`players=${pc} games=${games} bot=${bot} ${(ms / games).toFixed(1)} ms/game`);
  console.table(aggregate(summaries));
}
