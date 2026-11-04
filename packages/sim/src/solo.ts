/**
 * Solo 变体模拟（spec 2026-11-05 §4）：playSolo 跑一局单人（可叠加 --inner 厂区内层），
 * 逐行动观察 NPC 消耗、许可证、资源板块翻面；summarizeSolo / aggregateSolo 出表。
 *
 * - 非 inner：引擎 playGame(1, ...)，再用 log 纯重放一遍做观察（同时是重放校验）。
 * - inner：playGameInner(1, ...) 的 onAction 钩子观察（交付翻面另记在 innerStats）。
 * 翻面归因：每个外层行动前后比对资源板块（同签名、未翻面 → 翻面）；在本行动
 * lastEvents 里有 npc-consume flipped 的槽位记为 NPC，其余记为自己。
 */
import {
  applyAction,
  isSoloPermitCard,
  newGame,
  NPC_DEMAND,
  playGame,
  SOLO_ROUNDS_PER_ERA,
  soloRank,
  stableStringify,
} from '@brassline/engine';
import type { Action, Era, GameState, NpcConsumeEvent, PlacedTile, PlayerAgent, SoloRank } from '@brassline/engine';
import { playGameInner, type InnerStats } from './inner.js';

type Res = 'coal' | 'iron' | 'beer';
type Triple = Record<Res, number>;
const RES: readonly Res[] = ['coal', 'iron', 'beer'];
const ERAS: readonly Era[] = ['canal', 'rail'];
const ACTION_TYPES = ['build', 'network', 'develop', 'sell', 'loan', 'scout', 'pass'] as const;
const RESOURCE_INDUSTRIES = ['coal', 'iron', 'brewery'];

const zero = (): Triple => ({ coal: 0, iron: 0, beer: 0 });
const resOf = (industry: NpcConsumeEvent['industry']): Res => (industry === 'brewery' ? 'beer' : industry);

/** 每时代 NPC 需求总量（8 轮合计）。 */
export const NPC_DEMAND_PER_ERA: Record<Era, Triple> = (() => {
  const out: Record<Era, Triple> = { canal: zero(), rail: zero() };
  for (const r of NPC_DEMAND) {
    const rounds = Math.min(r.toRound, SOLO_ROUNDS_PER_ERA) - r.fromRound + 1;
    for (const k of RES) out[r.era][k] += r[k] * rounds;
  }
  return out;
})();

export interface SoloSummary {
  seed: number;
  vp: number;
  rank: SoloRank;
  actions: number;
  actionMix: Record<Action['type'], number>;
  /** 卖货翻面获得的许可证总数。 */
  permitsEarned: number;
  /** 用许可证卡建造的次数。 */
  permitsUsed: number;
  /** 许可证卡被非建造行动弃掉（浪费）的次数。 */
  permitsDiscarded: number;
  permitsAtEnd: number;
  /** NPC 实际取走的方块/桶，按时代。 */
  npcConsumed: Record<Era, Triple>;
  /** NPC 需求未满足量（需求 − 实取），按时代。 */
  npcShortfall: Record<Era, Triple>;
  /** 资源板块（煤/铁/酒厂）翻面：NPC 拿空 / 自己行动消耗拿空 / 内层交付（仅 inner）。 */
  resourceFlipsByNpc: number;
  resourceFlipsBySelf: number;
  resourceFlipsByDelivery: number;
  /** 建造的资源板块数。 */
  resourceTilesBuilt: number;
  unflippedResourceTilesAtEnd: number;
  inner?: InnerStats;
}

function isResource(t: PlacedTile | null | undefined): t is PlacedTile {
  return !!t && RESOURCE_INDUSTRIES.includes(t.tile.industry);
}
const sig = (t: PlacedTile) => `${t.player}:${t.tile.industry}:${t.tile.level}`;

function unflippedResources(state: GameState): Map<string, string> {
  const m = new Map<string, string>();
  for (const [loc, slots] of Object.entries(state.board.slots)) {
    slots.forEach((t, i) => {
      if (isResource(t) && !t.flipped) m.set(`${loc}:${i}`, sig(t));
    });
  }
  return m;
}

class SoloTracker {
  permitsEarned = 0;
  permitsUsed = 0;
  permitsDiscarded = 0;
  npcConsumed: Record<Era, Triple> = { canal: zero(), rail: zero() };
  flipsByNpc = 0;
  flipsBySelf = 0;
  resourceTilesBuilt = 0;

  observe = (before: GameState, action: Action, after: GameState): void => {
    // 引擎：每个卖出（翻面）板块 +1 许可证（apply.ts）
    if (action.type === 'sell') this.permitsEarned += action.sales.length;
    if ('cardId' in action && isSoloPermitCard(action.cardId)) {
      if (action.type === 'build') this.permitsUsed++;
      else this.permitsDiscarded++;
    }
    if (action.type === 'build') {
      if (RESOURCE_INDUSTRIES.includes(action.industry)) this.resourceTilesBuilt++;
    }
    const npcFlipped = new Set<string>();
    for (const e of after.lastEvents) {
      if (e.kind !== 'npc-consume') continue;
      // 轮末结算的是行动前那一轮所在时代
      this.npcConsumed[before.era][resOf(e.industry)] += e.count;
      if (e.flipped) {
        this.flipsByNpc++;
        npcFlipped.add(`${e.location}:${e.slotIndex}`);
      }
    }
    const pre = unflippedResources(before);
    for (const [loc, slots] of Object.entries(after.board.slots)) {
      slots.forEach((t, i) => {
        const key = `${loc}:${i}`;
        if (isResource(t) && t.flipped && pre.get(key) === sig(t) && !npcFlipped.has(key)) this.flipsBySelf++;
      });
    }
  };
}

export interface SoloRun {
  state: GameState;
  log: Action[];
  summary: SoloSummary;
}

/** 跑一局 solo；inner 时开厂区内层。确定性校验由调用方跑两次比对 state。 */
export function playSolo(seed: number, agents?: PlayerAgent[], opts?: { inner?: boolean }): SoloRun {
  const tracker = new SoloTracker();
  let state: GameState;
  let log: Action[];
  let inner: InnerStats | undefined;
  if (opts?.inner) {
    const r = playGameInner(1, seed, agents, { onAction: tracker.observe });
    ({ state, log } = r);
    inner = r.innerStats;
  } else {
    ({ state, log } = playGame(1, seed, agents));
    let replay = newGame(1, seed, { solo: true });
    for (const a of log) {
      const next = applyAction(replay, a, { assumeLegal: true });
      tracker.observe(replay, a, next);
      replay = next;
    }
    if (stableStringify(replay) !== stableStringify(state)) throw new Error(`solo replay mismatch (seed ${seed})`);
  }
  return { state, log, summary: summarizeSolo(seed, state, log, tracker, inner) };
}

function summarizeSolo(
  seed: number,
  state: GameState,
  log: Action[],
  t: SoloTracker,
  inner?: InnerStats,
): SoloSummary {
  const actionMix = Object.fromEntries(ACTION_TYPES.map((k) => [k, 0])) as Record<Action['type'], number>;
  for (const a of log) actionMix[a.type]++;
  const npcShortfall: Record<Era, Triple> = { canal: zero(), rail: zero() };
  for (const era of ERAS) for (const k of RES) npcShortfall[era][k] = NPC_DEMAND_PER_ERA[era][k] - t.npcConsumed[era][k];
  const vp = state.players[0]!.vp;
  return {
    seed,
    vp,
    rank: soloRank(vp),
    actions: log.length,
    actionMix,
    permitsEarned: t.permitsEarned,
    permitsUsed: t.permitsUsed,
    permitsDiscarded: t.permitsDiscarded,
    permitsAtEnd: state.players[0]!.permits ?? 0,
    npcConsumed: t.npcConsumed,
    npcShortfall,
    resourceFlipsByNpc: t.flipsByNpc,
    resourceFlipsBySelf: t.flipsBySelf,
    resourceFlipsByDelivery: inner?.flipsByDelivery ?? 0,
    resourceTilesBuilt: t.resourceTilesBuilt,
    unflippedResourceTilesAtEnd: unflippedResources(state).size,
    ...(inner ? { inner } : {}),
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return Number.NaN;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}
/** 最近秩分位数：排序后第 ceil(q·n) 个。 */
export function percentile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** 三张表：VP/评级/许可证、NPC 每轮消耗、翻面与行动组成。 */
export function aggregateSolo(ss: SoloSummary[]) {
  const vps = ss.map((s) => s.vp);
  const share = (r: SoloRank) => r2(ss.filter((s) => s.rank === r).length / Math.max(1, ss.length));
  const vp = {
    games: ss.length,
    'vp.mean': r2(mean(vps)),
    'vp.median': median(vps),
    'vp.p90': percentile(vps, 0.9),
    'vp.min': Math.min(...vps),
    'vp.max': Math.max(...vps),
    'rank.none': share('none'),
    'rank.bronze': share('bronze'),
    'rank.silver': share('silver'),
    'rank.gold': share('gold'),
    'permits.earned': r2(mean(ss.map((s) => s.permitsEarned))),
    'permits.used': r2(mean(ss.map((s) => s.permitsUsed))),
    'permits.discarded': r2(mean(ss.map((s) => s.permitsDiscarded))),
    'permits.atEnd': r2(mean(ss.map((s) => s.permitsAtEnd))),
    gamesWithPermit: ss.filter((s) => s.permitsEarned > 0).length,
    meanActions: r2(mean(ss.map((s) => s.actions))),
  };
  const npc: Record<string, Record<string, number>> = {};
  for (const era of ERAS) {
    const row: Record<string, number> = {};
    for (const k of RES) {
      row[`${k}/round`] = r2(mean(ss.map((s) => s.npcConsumed[era][k])) / SOLO_ROUNDS_PER_ERA);
      row[`${k} demand/round`] = r2(NPC_DEMAND_PER_ERA[era][k] / SOLO_ROUNDS_PER_ERA);
    }
    row['total/round'] = r2(mean(ss.map((s) => RES.reduce((a, k) => a + s.npcConsumed[era][k], 0))) / SOLO_ROUNDS_PER_ERA);
    row['fill rate'] = r2(
      mean(ss.map((s) => RES.reduce((a, k) => a + s.npcConsumed[era][k], 0))) /
        RES.reduce((a, k) => a + NPC_DEMAND_PER_ERA[era][k], 0),
    );
    row['games with any NPC take'] = ss.filter((s) => RES.some((k) => s.npcConsumed[era][k] > 0)).length;
    npc[era] = row;
  }
  const tiles: Record<string, number> = {
    'resourceTilesBuilt': r2(mean(ss.map((s) => s.resourceTilesBuilt))),
    'flips.byNpc': r2(mean(ss.map((s) => s.resourceFlipsByNpc))),
    'flips.bySelf': r2(mean(ss.map((s) => s.resourceFlipsBySelf))),
    'flips.byDelivery': r2(mean(ss.map((s) => s.resourceFlipsByDelivery))),
    'unflippedAtEnd': r2(mean(ss.map((s) => s.unflippedResourceTilesAtEnd))),
  };
  for (const t of ACTION_TYPES) tiles[`mix.${t}`] = r2(mean(ss.map((s) => s.actionMix[t] / s.actions)));
  const inner = ss.flatMap((s) => (s.inner ? [s.inner] : []));
  if (inner.length > 0) {
    tiles['inner.cubesDelivered'] = r2(mean(inner.map((i) => i.cubesDelivered)));
    tiles['inner.soldToMarket'] = r2(mean(inner.map((i) => i.soldToMarket)));
    tiles['inner.gamesWithoutDelivery'] = inner.filter((i) => i.actionsToFirstDelivery === null).length;
  }
  return { vp, npc, tiles };
}

/** §1.4 校准：bronze ≈ 中位数，silver ≈ p90，gold = round(silver × 1.35)。 */
export function calibrateTargets(ss: SoloSummary[]): { bronze: number; silver: number; gold: number } {
  const vps = ss.map((s) => s.vp);
  const silver = percentile(vps, 0.9);
  return { bronze: Math.round(median(vps)), silver, gold: Math.round(silver * 1.35) };
}
