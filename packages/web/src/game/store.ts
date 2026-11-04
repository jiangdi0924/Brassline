import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  applyAction,
  enumerateActions,
  newGame as engineNewGame,
  type Action,
  type GameState,
  type PlayerIndex,
} from '@brassline/engine';
import { GreedyAgent } from '@brassline/bots';

export type Seat = 'human' | 'bot';

export interface Save {
  version: 1;
  playerCount: 2 | 3 | 4;
  seed: number;
  seats: Seat[];
  actions: Action[];
}

export interface GameStore {
  state: GameState | null;
  log: Action[];
  seed: number;
  seats: Seat[];
  newGame(opts: { playerCount: 2 | 3 | 4; seed: number; seats: Seat[] }): void;
  apply(action: Action): void;
  currentPlayer(): PlayerIndex | null;
  legal(): Action[];
  isBotTurn(): boolean;
  /** 连续执行机器人座位直到轮到人类或终局；每步同步执行。 */
  runBotsUntilHumanOrEnd(): void;
}

export function createGameStore(): StoreApi<GameStore> {
  const bots = new Map<PlayerIndex, GreedyAgent>();
  return createStore<GameStore>((set, get) => ({
    state: null,
    log: [],
    seed: 0,
    seats: [],
    newGame({ playerCount, seed, seats }) {
      bots.clear();
      seats.forEach((s, i) => {
        if (s === 'bot') bots.set(i, new GreedyAgent(seed * 10 + i));
      });
      set({ state: engineNewGame(playerCount, seed), log: [], seed, seats });
    },
    apply(action) {
      const { state, log } = get();
      if (!state) throw new Error('no game');
      set({ state: applyAction(state, action), log: [...log, action] });
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
  }));
}

export function serializeSave(s: GameStore): string {
  const save: Save = {
    version: 1,
    playerCount: s.state!.playerCount,
    seed: s.seed,
    seats: s.seats,
    actions: s.log,
  };
  return JSON.stringify(save);
}

export function loadSave(store: StoreApi<GameStore>, json: string): void {
  const save = JSON.parse(json) as Save;
  store.getState().newGame({ playerCount: save.playerCount, seed: save.seed, seats: save.seats });
  for (const a of save.actions) store.getState().apply(a);
}

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
