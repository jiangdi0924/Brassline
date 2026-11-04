import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  applyAction,
  deliverResources,
  enumerateActions,
  LOCATIONS,
  newGame as engineNewGame,
  spendMoney,
  type Action,
  type GameEvent,
  type GameState,
  type PlacedTile,
  type PlayerIndex,
} from '@brassline/engine';
import { GreedyAgent } from '@brassline/bots';
import {
  canPlace,
  COSTS,
  FACTORY_SECONDS_PER_ACTION,
  newPlot,
  place,
  remove,
  rotate,
  step,
  buildingAt,
  type BuildingKind,
  type Dir,
  type Plot,
  type PlotKind,
} from '@brassline/factory';

export type Seat = 'human' | 'bot';

/** 旧格式：行动日志，读档时重放。 */
export interface SaveV1 {
  version: 1;
  playerCount: 1 | 2 | 3 | 4;
  seed: number;
  seats: Seat[];
  actions: Action[];
}

/** P3 §3：厂区花费与交付不在行动日志里，所以直接存 state，读档不重放。 */
export interface SaveV2 {
  version: 2;
  state: GameState;
  plots: Record<string, Plot>;
  log: Action[];
  seats: Seat[];
  seed: number;
  actors: PlayerIndex[];
  notices?: Notice[];
}

export type Save = SaveV1 | SaveV2;

/** 界面日志里的非行动行；at = 推入时 log.length（显示在第 at 个行动之后）。 */
export interface Notice {
  at: number;
  text: string;
}

export const plotKey = (location: string, slotIndex: number): string => `${location}:${slotIndex}`;

const RESOURCE_KINDS = new Set<string>(['coal', 'iron', 'brewery']);
const KIND_NAME: Record<PlotKind, string> = { coal: '煤矿', iron: '铁厂', brewery: '酿酒厂' };
const ITEM_NAME: Record<PlotKind, string> = { coal: '煤', iron: '铁', brewery: '啤酒' };

export function plotTitle(location: string, kind: PlotKind): string {
  return `${LOCATIONS[location]?.name ?? location} ${KIND_NAME[kind]}`;
}

function sameTile(a: PlacedTile | null | undefined, b: PlacedTile): boolean {
  return !!a && a.player === b.player && a.tile.industry === b.tile.industry && a.tile.level === b.tile.level;
}

const NPC_INDUSTRY_NAME: Record<'coal' | 'iron' | 'brewery', string> = { coal: '煤矿', iron: '铁厂', brewery: '酿酒厂' };
const NPC_ITEM_NAME: Record<'coal' | 'iron' | 'brewery', string> = { coal: '煤', iron: '铁', brewery: '啤酒' };

/**
 * Solo 轮末 NPC 需求通知（spec 2026-11-05 §3）："区域消耗 Dudley 煤矿 2 煤，煤矿翻面，收入 +4"。
 * 翻面时引擎在 npc-consume 后紧跟一条 flip 事件，收入前进取自它。
 */
export function npcNotices(events: readonly GameEvent[]): string[] {
  const out: string[] = [];
  events.forEach((e, i) => {
    if (e.kind !== 'npc-consume') return;
    const kind = NPC_INDUSTRY_NAME[e.industry];
    let text = `区域消耗 ${LOCATIONS[e.location]?.name ?? e.location} ${kind} ${e.count} ${NPC_ITEM_NAME[e.industry]}`;
    if (e.flipped) {
      const f = events[i + 1];
      text += `，${kind}翻面`;
      if (f && f.kind === 'flip' && f.location === e.location) text += `，收入 +${f.incomeAdvance}`;
    }
    out.push(text);
  });
  return out;
}

export interface FactoryAdvance {
  state: GameState;
  plots: Record<string, Plot>;
  /** 推进前（含新建）的厂区，界面用它播放 20 s 的动画。 */
  before: Record<string, Plot>;
  notices: string[];
}

/**
 * 外层一个行动之后推进所有厂区（P3 §3）。纯函数。
 * prev：行动前的 state，用来识别同类板块被覆盖（换了主人/等级 → 新厂区）。
 */
export function advanceFactories(
  prev: GameState | null,
  state: GameState,
  plots: Record<string, Plot>,
): FactoryAdvance {
  if (!state.rules.innerLayer) return { state, plots: {}, before: {}, notices: [] };
  let st = state;
  const next: Record<string, Plot> = {};
  const before: Record<string, Plot> = {};
  const notices: string[] = [];
  for (const [loc, slots] of Object.entries(state.board.slots)) {
    slots.forEach((t, i) => {
      if (!t || t.flipped || !RESOURCE_KINDS.has(t.tile.industry) || t.deposit === undefined) return;
      const key = plotKey(loc, i);
      const kind = t.tile.industry as PlotKind;
      const old = plots[key];
      const reuse = old && old.kind === kind && (!prev || sameTile(prev.board.slots[loc]?.[i], t));
      let plot = reuse ? old : newPlot(kind);
      before[key] = plot;
      if (t.deposit > 0 && state.phase !== 'game-over') {
        const r = step(plot, FACTORY_SECONDS_PER_ACTION);
        plot = r.plot;
        if (r.delivered > 0) {
          const d = deliverResources(st, loc, i, r.delivered);
          st = d.state;
          if (d.delivered > 0) {
            let text = `P${t.player + 1} 的 ${plotTitle(loc, kind)}交付 ${d.delivered} ${ITEM_NAME[kind]}`;
            if (d.soldToMarket > 0) text += `，卖入市场 ${d.soldToMarket} 个 £${d.revenue}`;
            if (d.flipped.length > 0) text += '，板块翻面';
            notices.push(text);
          }
          if (st.board.slots[loc]?.[i]?.flipped) return; // 翻面 → 厂区关闭
        }
      }
      next[key] = plot;
    });
  }
  return { state: st, plots: next, before, notices };
}

export interface GameStore {
  state: GameState | null;
  log: Action[];
  /** 与 log 一一对应：执行该行动的玩家（仅用于界面日志）。 */
  actors: PlayerIndex[];
  seed: number;
  seats: Seat[];
  /** 内层厂区，键 `${location}:${slotIndex}`。 */
  plots: Record<string, Plot>;
  /** 最近一次外层行动推进前的厂区（动画起点）。 */
  plotsBefore: Record<string, Plot>;
  /** 每次外层行动推进厂区后 +1（编辑厂区不变）。 */
  plotVersion: number;
  notices: Notice[];
  /** solo: true → 单人对抗区域需求（playerCount 1、座位 ['human']，忽略传入的 playerCount/seats）。 */
  newGame(opts: { playerCount?: 1 | 2 | 3 | 4; seed: number; seats?: Seat[]; innerLayer?: boolean; solo?: boolean }): void;
  apply(action: Action): void;
  currentPlayer(): PlayerIndex | null;
  legal(): Action[];
  isBotTurn(): boolean;
  /** 连续执行机器人座位直到轮到人类或终局；每步同步执行。 */
  runBotsUntilHumanOrEnd(): void;
  /** 若轮到机器人，执行它的一个行动并返回 true（界面用它逐步播放机器人回合）。 */
  stepBot(): boolean;
  /** 厂区编辑：返回 '' 表示成功，否则为拒绝原因。只有板块主人（人类座位）可编辑。 */
  placeInPlot(key: string, kind: BuildingKind, x: number, y: number, dir: Dir): string;
  removeFromPlot(key: string, x: number, y: number): string;
  rotateInPlot(key: string, x: number, y: number, dir: Dir): string;
  /** 内部：读档 v2 后直接写入。 */
  restore(save: SaveV2): void;
}

export function createGameStore(): StoreApi<GameStore> {
  const bots = new Map<PlayerIndex, GreedyAgent>();
  const resetBots = (seed: number, seats: Seat[]) => {
    bots.clear();
    seats.forEach((s, i) => {
      if (s === 'bot') bots.set(i, new GreedyAgent(seed * 10 + i));
    });
  };

  return createStore<GameStore>((set, get) => {
    /** 编辑前的公共检查；返回 [错误, 板块主人]。 */
    const editable = (key: string): [string, PlayerIndex] => {
      const { state, seats, plots } = get();
      if (!state || state.phase === 'game-over') return ['对局未进行', 0];
      if (!plots[key]) return ['厂区不存在', 0];
      const [loc, idx] = key.split(':');
      const tile = state.board.slots[loc!]?.[Number(idx)];
      if (!tile) return ['板块不存在', 0];
      const owner = tile.player;
      if (seats[owner] !== 'human') return ['只有板块主人可以编辑', owner];
      const humans = seats.filter((s) => s === 'human').length;
      if (humans > 1 && get().currentPlayer() !== owner) return ['只能在自己的回合编辑', owner];
      return ['', owner];
    };

    return {
      state: null,
      log: [],
      actors: [],
      seed: 0,
      seats: [],
      plots: {},
      plotsBefore: {},
      plotVersion: 0,
      notices: [],
      newGame({ playerCount = 2, seed, seats = ['human', 'human'], innerLayer = false, solo = false }) {
        if (solo) {
          playerCount = 1;
          seats = ['human'];
        }
        resetBots(seed, seats);
        set({
          state: solo
            ? engineNewGame(1, seed, { solo: true, innerLayer })
            : engineNewGame(playerCount, seed, { innerLayer }),
          log: [],
          actors: [],
          seed,
          seats,
          plots: {},
          plotsBefore: {},
          plotVersion: 0,
          notices: [],
        });
      },
      apply(action) {
        const { state, log, actors, plots, notices, plotVersion } = get();
        if (!state) throw new Error('no game');
        const actor = state.turnOrder[state.currentPlayerIdx]!;
        const after = applyAction(state, action);
        const adv = advanceFactories(state, after, plots);
        const at = log.length + 1;
        // 引擎每个行动都重写 lastEvents；同一引用说明没有新事件（防重复）。
        const npc = after.rules.solo && after.lastEvents !== state.lastEvents ? npcNotices(after.lastEvents) : [];
        const added = [...npc, ...adv.notices];
        set({
          state: adv.state,
          log: [...log, action],
          actors: [...actors, actor],
          plots: adv.plots,
          plotsBefore: adv.before,
          plotVersion: plotVersion + 1,
          notices: added.length ? [...notices, ...added.map((text) => ({ at, text }))] : notices,
        });
      },
      currentPlayer() {
        const { state } = get();
        if (!state || state.phase === 'game-over') return null;
        return state.turnOrder[state.currentPlayerIdx]!;
      },
      legal() {
        const { state } = get();
        const p = get().currentPlayer();
        return state && p !== null ? enumerateActions(state, p) : [];
      },
      isBotTurn() {
        const p = get().currentPlayer();
        return p !== null && bots.has(p);
      },
      runBotsUntilHumanOrEnd() {
        let guard = 0;
        while (get().isBotTurn() && guard++ < 10_000) {
          const p = get().currentPlayer()!;
          const legal = get().legal();
          get().apply(bots.get(p)!.chooseAction(get().state!, legal));
        }
      },
      stepBot() {
        if (!get().isBotTurn()) return false;
        const p = get().currentPlayer()!;
        get().apply(bots.get(p)!.chooseAction(get().state!, get().legal()));
        return true;
      },
      placeInPlot(key, kind, x, y, dir) {
        const [err, owner] = editable(key);
        if (err) return err;
        const plot = get().plots[key]!;
        const reason = canPlace(plot, kind, x, y);
        if (reason) return reason;
        let state: GameState;
        try {
          state = spendMoney(get().state!, owner, COSTS[kind]);
        } catch {
          return `钱不够（需要 £${COSTS[kind]}）`;
        }
        set({ state, plots: { ...get().plots, [key]: place(plot, kind, x, y, dir) } });
        return '';
      },
      removeFromPlot(key, x, y) {
        const [err] = editable(key);
        if (err) return err;
        const plot = get().plots[key]!;
        if (!buildingAt(plot, x, y)) return '该格没有建筑';
        set({ plots: { ...get().plots, [key]: remove(plot, x, y) } });
        return '';
      },
      rotateInPlot(key, x, y, dir) {
        const [err] = editable(key);
        if (err) return err;
        const plot = get().plots[key]!;
        if (!buildingAt(plot, x, y)) return '该格没有建筑';
        set({ plots: { ...get().plots, [key]: rotate(plot, x, y, dir) } });
        return '';
      },
      restore(save) {
        resetBots(save.seed, save.seats);
        set({
          state: save.state,
          log: save.log,
          actors: save.actors,
          seed: save.seed,
          seats: save.seats,
          plots: save.plots,
          plotsBefore: save.plots,
          plotVersion: 0,
          notices: save.notices ?? [],
        });
      },
    };
  });
}

export function serializeSave(s: GameStore): string {
  const save: SaveV2 = {
    version: 2,
    state: s.state!,
    plots: s.plots,
    log: s.log,
    seats: s.seats,
    seed: s.seed,
    actors: s.actors,
    notices: s.notices,
  };
  return JSON.stringify(save);
}

export function loadSave(store: StoreApi<GameStore>, json: string): void {
  const save = JSON.parse(json) as Save;
  if (save.version === 2) {
    store.getState().restore(save);
    return;
  }
  // v1：行动日志重放（那时还没有内层）。
  store.getState().newGame({ playerCount: save.playerCount, seed: save.seed, seats: save.seats });
  for (const a of save.actions) store.getState().apply(a);
}

/** 键名沿用 v1，读档按 version 分派。 */
export const SAVE_KEY = 'brassline.save.v1';

export function saveToLocalStorage(store: StoreApi<GameStore>): void {
  try {
    localStorage.setItem(SAVE_KEY, serializeSave(store.getState()));
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}

export function loadFromLocalStorage(store: StoreApi<GameStore>): boolean {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return false;
    loadSave(store, json);
    return true;
  } catch {
    return false;
  }
}

export const gameStore = createGameStore();
