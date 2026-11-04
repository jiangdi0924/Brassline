/**
 * 贪心机器人：对每个合法行动做一步模拟，取评估值增量最大者；并列用种子随机打破。
 * 评估见 evaluate：VP + 2.5×收入等级 + 递减的现金价值 + 按 VP 估值的己方板块
 *        + 己方 Link 1.5 分 + 面板已清掉的板块 0.5 分（Develop 的长期价值）。
 */
import {
  applyAction,
  createRng,
  incomeLevelAt,
  TILES,
  type Action,
  type GameState,
  type PlayerAgent,
  type PlayerIndex,
  type Rng,
} from '@brassline/engine';

const TOTAL_TILES = TILES.reduce((n, t) => n + t.count, 0);

/**
 * 现金的边际价值递减：前 £20 每镑 0.5（穷的时候贷款划算），之后每镑 0.1。
 * 板块按它将来能得的 VP 估值：未翻面 = 0.6×VP + 2（鼓励建厂），翻面 = VP + 1。
 */
function moneyValue(money: number): number {
  return Math.min(money, 20) * 0.5 + Math.max(0, money - 20) * 0.1;
}

export function evaluate(state: GameState, player: PlayerIndex): number {
  const p = state.players[player]!;
  let v = p.vp + 2.5 * incomeLevelAt(p.incomeSpace) + moneyValue(p.money);
  for (const slots of Object.values(state.board.slots)) {
    for (const t of slots) {
      if (t && t.player === player) v += t.flipped ? t.tile.vp + 1 : 0.6 * t.tile.vp + 2;
    }
  }
  v += 1.5 * state.board.links.filter((l) => l.player === player).length;
  v += 0.5 * (TOTAL_TILES - p.tiles.length);
  return v;
}

export class GreedyAgent implements PlayerAgent {
  private readonly rng: Rng;
  constructor(seed: number) {
    this.rng = createRng(seed);
  }

  chooseAction(state: GameState, legal: Action[]): Action {
    const player = state.turnOrder[state.currentPlayerIdx]!;
    const base = evaluate(state, player);
    let best: Action[] = [];
    let bestGain = -Infinity;
    for (const a of legal) {
      const next = applyAction(state, a, { assumeLegal: true });
      const gain = evaluate(next, player) - base - (a.type === 'pass' ? 0.1 : 0);
      if (gain > bestGain + 1e-9) {
        bestGain = gain;
        best = [a];
      } else if (Math.abs(gain - bestGain) <= 1e-9) {
        best.push(a);
      }
    }
    return best[this.rng.nextInt(best.length)]!;
  }
}
