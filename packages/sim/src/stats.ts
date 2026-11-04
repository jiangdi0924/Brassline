import { incomeLevelAt, type Action, type GameState } from '@brassline/engine';

export interface GameSummary {
  playerCount: number;
  actions: number;
  vp: number[];
  income: number[];
  money: number[];
  winner: number[] | null;
  actionMix: Record<Action['type'], number>;
}

export function summarize(state: GameState, log: Action[]): GameSummary {
  const actionMix: Record<Action['type'], number> = {
    build: 0, network: 0, develop: 0, sell: 0, loan: 0, scout: 0, pass: 0,
  };
  for (const a of log) actionMix[a.type]++;
  return {
    playerCount: state.playerCount,
    actions: log.length,
    vp: state.players.map((p) => p.vp),
    income: state.players.map((p) => incomeLevelAt(p.incomeSpace)),
    money: state.players.map((p) => p.money),
    winner: state.winner,
    actionMix,
  };
}

export function aggregate(summaries: GameSummary[]): Record<string, number> {
  const n = summaries.length;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const out: Record<string, number> = {
    games: n,
    meanActions: mean(summaries.map((s) => s.actions)),
    meanWinnerVp: mean(summaries.map((s) => Math.max(...s.vp))),
    meanLoserVp: mean(summaries.map((s) => Math.min(...s.vp))),
    meanIncome: mean(summaries.flatMap((s) => s.income)),
  };
  for (const t of ['build', 'network', 'develop', 'sell', 'loan', 'scout', 'pass'] as const) {
    out[`mix.${t}`] = mean(summaries.map((s) => s.actionMix[t] / s.actions));
  }
  return out;
}
