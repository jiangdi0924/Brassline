import { incomeLevelAt, type Action, type GameState } from '@brassline/engine';
import type { InnerStats } from './inner.js';

export interface GameSummary {
  playerCount: number;
  actions: number;
  vp: number[];
  income: number[];
  money: number[];
  winner: number[] | null;
  actionMix: Record<Action['type'], number>;
  /** 仅 --inner 模式。 */
  inner?: InnerStats;
}

export function summarize(state: GameState, log: Action[], inner?: InnerStats): GameSummary {
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
    ...(inner ? { inner } : {}),
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
  const inner = summaries.flatMap((s) => (s.inner ? [s.inner] : []));
  if (inner.length > 0) {
    const firsts = inner.flatMap((i) => (i.actionsToFirstDelivery === null ? [] : [i.actionsToFirstDelivery]));
    out['inner.deliveries'] = mean(inner.map((i) => i.deliveries));
    out['inner.cubesDelivered'] = mean(inner.map((i) => i.cubesDelivered));
    out['inner.soldToMarket'] = mean(inner.map((i) => i.soldToMarket));
    out['inner.revenue'] = mean(inner.map((i) => i.revenue));
    out['inner.flipsByDelivery'] = mean(inner.map((i) => i.flipsByDelivery));
    out['inner.flipsByConsumption'] = mean(inner.map((i) => i.flipsByConsumption));
    out['inner.meanActionsToFirstDelivery'] = firsts.length > 0 ? mean(firsts) : Number.NaN;
    out['inner.gamesWithoutDelivery'] = inner.length - firsts.length;
    for (const k of ['coal', 'iron', 'brewery'] as const) {
      out[`inner.built.${k}`] = mean(inner.map((i) => i.tilesBuiltByKind[k]));
    }
    out['inner.unflippedResourceTilesAtEnd'] = mean(inner.map((i) => i.unflippedResourceTilesAtEnd));
    out['inner.depositLeftAtEnd'] = mean(inner.map((i) => i.depositLeftAtEnd));
  }
  return out;
}
