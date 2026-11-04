/**
 * 行动选择状态机（纯函数）：选行动类型 → 选卡 → 在棋盘点目标 → 确认。
 * candidates 永远是 enumerateActions 输出的子集（按引用保留），界面只能发出引擎认可的行动。
 */
import { LOCATIONS, applyBuild, type Action, type GameState } from '@brassline/engine';
import type { Highlights, PickTarget } from '../board/scene';

export type Step = 'type' | 'card' | 'target' | 'confirm';

export interface Interaction {
  legal: Action[];
  /**
   * 可选：生成 legal 的那个局面。提供时，省略 slotIndex 的 build 会通过引擎
   * applyBuild 解析出它实际落在哪个槽位，高亮与点击都精确到该槽；
   * 不提供时退化为"该地所有能放此产业的槽都算命中"。
   */
  state?: GameState | undefined;
  step: Step;
  type: Action['type'] | null;
  cardId: string | null;
  /** 当前筛选后仍可能的行动；进入 confirm 后是可互换的完整变体。 */
  candidates: Action[];
  /** Network 第一条已选的线、Sell 已选的板块等多步目标。 */
  picked: PickTarget[];
  chosen: Action | null;
}

export type UiEvent =
  | { kind: 'type'; type: Action['type'] }
  | { kind: 'card'; cardId: string }
  | { kind: 'pick'; target: PickTarget }
  | { kind: 'done' } // 多目标行动（Network 双轨、Sell 多块）提前结束选择
  /** confirm 阶段在同目标的多个合法变体间切换（如双图标槽选棉/制造、Scout 另两张卡）。 */
  | { kind: 'variant'; index: number }
  | { kind: 'cancel' };

export function start(legal: Action[], state?: GameState): Interaction {
  return { legal, state, step: 'type', type: null, cardId: null, candidates: legal, picked: [], chosen: null };
}

function cardOf(a: Action): string {
  return a.type === 'scout' ? a.cardIds[0] : a.cardId;
}

const NO_TARGET: ReadonlySet<Action['type']> = new Set(['loan', 'pass', 'scout']);
/** 目标顺序无关的行动（选哪条线/哪个产业先后不影响含义）。 */
const UNORDERED: ReadonlySet<Action['type']> = new Set(['network', 'develop']);

export function reduce(ui: Interaction, ev: UiEvent): Interaction {
  switch (ev.kind) {
    case 'cancel':
      return start(ui.legal, ui.state);
    case 'type': {
      const candidates = ui.legal.filter((a) => a.type === ev.type);
      if (candidates.length === 0) return ui;
      return soloAutoCard({ ...start(ui.legal, ui.state), step: 'card', type: ev.type, candidates });
    }
    case 'card': {
      if (ui.step !== 'card') return ui;
      const candidates = ui.candidates.filter((a) => cardOf(a) === ev.cardId);
      if (candidates.length === 0) return ui;
      if (NO_TARGET.has(ui.type!) || (candidates.length === 1 && ui.type === 'develop')) {
        return { ...ui, cardId: ev.cardId, candidates, step: 'confirm', chosen: candidates[0]! };
      }
      return { ...ui, cardId: ev.cardId, candidates, step: 'target', picked: [] };
    }
    case 'pick': {
      if (ui.step !== 'target') return ui;
      const picked = [...ui.picked, ev.target];
      const candidates = ui.candidates.filter((a) => matches(ui, a, picked));
      if (candidates.length === 0) return ui; // 点了不合法的位置，忽略
      const complete = candidates.filter((a) => targetCount(a) === picked.length);
      if (candidates.length === 1 || complete.length === candidates.length) {
        // 已无后续可点：进入确认。多个完整变体（同槽不同产业等）保留为 candidates 供 variant 切换。
        const pool = complete.length > 0 ? complete : candidates;
        return { ...ui, picked, candidates: pool, step: 'confirm', chosen: preferred(pool, ev.target) };
      }
      return { ...ui, picked, candidates, chosen: complete[0] ?? null };
    }
    case 'done': {
      if (ui.step !== 'target') return ui;
      const complete = ui.candidates.filter((a) => targetCount(a) === ui.picked.length);
      return complete.length > 0 ? { ...ui, candidates: complete, step: 'confirm', chosen: complete[0]! } : ui;
    }
    case 'variant': {
      if (ui.step !== 'confirm') return ui;
      const a = ui.candidates[ev.index];
      return a ? { ...ui, chosen: a } : ui;
    }
  }
}

/** card 步骤里可选的卡 id（去重，按 candidates 首次出现顺序）。 */
export function cardChoices(ui: Interaction): string[] {
  if (ui.step !== 'card') return [];
  return [...new Set(ui.candidates.map(cardOf))];
}

/**
 * Solo（spec 2026-11-05 §3）：选卡步骤自动跳过——只有一张合成卡（solo-industry）可用时直接用它。
 * 建造且有许可证时（solo-industry + solo-permit-0 两个选项）保持在 card 步骤，由界面给出两个按钮。
 * 非 solo 或不在 card 步骤原样返回。
 */
export function soloAutoCard(ui: Interaction): Interaction {
  if (ui.step !== 'card' || ui.state?.rules.solo !== true) return ui;
  const cards = cardChoices(ui);
  return cards.length === 1 ? reduce(ui, { kind: 'card', cardId: cards[0]! }) : ui;
}

/** 同一目标多个变体时，优先显式 slotIndex 与所点槽一致的 build。 */
function preferred(pool: Action[], last: PickTarget): Action {
  if (last.kind === 'slot') {
    const exact = pool.find((a) => a.type === 'build' && a.slotIndex === last.slotIndex);
    if (exact) return exact;
  }
  return pool[0]!;
}

/** 行动的目标序列长度（用于判断"已经点够了"）。 */
function targetCount(a: Action): number {
  switch (a.type) {
    case 'build': return 1;
    case 'network': return a.links.length;
    case 'sell': return a.sales.length * 2;
    case 'develop': return a.removals.length;
    default: return 0;
  }
}

/**
 * 内部目标：build 的 slotIndex 为 -1 表示"未解析"——该地任一能放 industry 的槽都算命中
 * （引擎省略 slotIndex 时按规范化规则自选槽位）。
 */
type Target = PickTarget | { kind: 'slot'; id: string; slotIndex: -1; industry: string };

/** picked 是否与行动的目标序列一致（有序行动比前缀，无序行动比子集）。 */
function matches(ui: Interaction, a: Action, picked: PickTarget[]): boolean {
  const seq = targetsOf(ui, a);
  if (picked.length > seq.length) return false;
  if (UNORDERED.has(a.type)) {
    const used = new Set<number>();
    return picked.every((p) => {
      const i = seq.findIndex((q, j) => !used.has(j) && sameTarget(p, q));
      if (i < 0) return false;
      used.add(i);
      return true;
    });
  }
  return picked.every((p, i) => sameTarget(p, seq[i]!));
}

const resolvedSlots = new WeakMap<GameState, WeakMap<Action, number>>();

/** 用引擎实际执行一次 build，找出省略 slotIndex 时它落在的槽位；失败返回 -1。 */
function resolveBuildSlot(state: GameState, a: Extract<Action, { type: 'build' }>): number {
  let cache = resolvedSlots.get(state);
  if (!cache) resolvedSlots.set(state, (cache = new WeakMap()));
  const hit = cache.get(a);
  if (hit !== undefined) return hit;
  let idx = -1;
  try {
    const player = state.turnOrder[state.currentPlayerIdx]!;
    const next = applyBuild(state, player, a, { assumeLegal: true }).state;
    const before = state.board.slots[a.location] ?? [];
    const after = next.board.slots[a.location] ?? [];
    idx = after.findIndex((t, i) => t !== before[i]);
  } catch {
    idx = -1;
  }
  cache.set(a, idx);
  return idx;
}

function targetsOf(ui: Interaction, a: Action): Target[] {
  switch (a.type) {
    case 'build': {
      if (a.slotIndex !== undefined) return [{ kind: 'slot', id: a.location, slotIndex: a.slotIndex }];
      const idx = ui.state ? resolveBuildSlot(ui.state, a) : -1;
      return idx >= 0
        ? [{ kind: 'slot', id: a.location, slotIndex: idx }]
        : [{ kind: 'slot', id: a.location, slotIndex: -1, industry: a.industry }];
    }
    case 'network':
      return a.links.map((linkIndex) => ({ kind: 'link', linkIndex }));
    case 'sell':
      return a.sales.flatMap((s): Target[] => [
        { kind: 'slot', id: s.location, slotIndex: s.slotIndex },
        { kind: 'merchant', id: s.merchant },
      ]);
    case 'develop':
      // Develop 用产业名做"目标"，界面上是按钮不是棋盘；借用 location 字段放产业名。
      return a.removals.map((ind): Target => ({ kind: 'location', id: `industry:${ind}` }));
    default:
      return [];
  }
}

function slotAccepts(id: string, slotIndex: number, industry: string): boolean {
  const def = LOCATIONS[id]?.slots[slotIndex];
  return !!def && (def.industries as string[]).includes(industry);
}

function sameTarget(p: PickTarget, q: Target): boolean {
  if (p.kind !== q.kind) return false;
  switch (q.kind) {
    case 'slot': {
      const pp = p as Extract<PickTarget, { kind: 'slot' }>;
      if (pp.id !== q.id) return false;
      return q.slotIndex === -1 ? slotAccepts(pp.id, pp.slotIndex, (q as { industry: string }).industry) : pp.slotIndex === q.slotIndex;
    }
    case 'link': return (p as Extract<PickTarget, { kind: 'link' }>).linkIndex === q.linkIndex;
    case 'location':
    case 'merchant': return (p as { id: string }).id === q.id;
  }
}

/** 当前这一步可以点的东西。 */
export function highlightsFor(ui: Interaction): Highlights {
  const hl: Highlights = { slots: new Set(), links: new Set(), merchants: new Set() };
  if (ui.step !== 'target') return hl;
  const depth = ui.picked.length;
  for (const a of ui.candidates) {
    const seq = targetsOf(ui, a);
    let next: Target[];
    if (UNORDERED.has(a.type)) {
      // 剩余未点的目标都可以作为下一步
      const rest = [...seq];
      for (const p of ui.picked) {
        const i = rest.findIndex((q) => sameTarget(p, q));
        if (i >= 0) rest.splice(i, 1);
      }
      next = rest;
    } else {
      next = seq[depth] ? [seq[depth]!] : [];
    }
    for (const t of next) {
      if (t.kind === 'slot') {
        if (t.slotIndex === -1) {
          const ind = (t as { industry: string }).industry;
          const n = LOCATIONS[t.id]?.slots.length ?? 0;
          for (let i = 0; i < n; i++) if (slotAccepts(t.id, i, ind)) hl.slots.add(`${t.id}:${i}`);
        } else hl.slots.add(`${t.id}:${t.slotIndex}`);
      } else if (t.kind === 'link') hl.links.add(t.linkIndex);
      else if (t.kind === 'merchant') hl.merchants.add(t.id);
    }
  }
  return hl;
}
