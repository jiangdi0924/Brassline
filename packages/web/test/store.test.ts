import { beforeEach, describe, expect, it } from 'vitest';
import { enumerateActions } from '@brassline/engine';
import { createGameStore, serializeSave, loadSave } from '../src/game/store';

describe('game store', () => {
  let store: ReturnType<typeof createGameStore>;
  beforeEach(() => {
    store = createGameStore();
    store.getState().newGame({ playerCount: 2, seed: 11, seats: ['human', 'human'] });
  });

  it('starts a game and applies a legal action', () => {
    const s = store.getState();
    const player = s.state!.turnOrder[s.state!.currentPlayerIdx]!;
    const legal = enumerateActions(s.state!, player);
    s.apply(legal[0]!);
    expect(store.getState().log.length).toBe(1);
  });

  it('round-trips a save through replay', () => {
    const s = store.getState();
    const player = s.state!.turnOrder[s.state!.currentPlayerIdx]!;
    s.apply(enumerateActions(s.state!, player)[0]!);
    const json = serializeSave(store.getState());
    const other = createGameStore();
    loadSave(other, json);
    expect(other.getState().log).toEqual(store.getState().log);
    expect(JSON.stringify(other.getState().state)).toBe(JSON.stringify(store.getState().state));
  });

  it('runs bot seats automatically', () => {
    store.getState().newGame({ playerCount: 2, seed: 3, seats: ['bot', 'bot'] });
    store.getState().runBotsUntilHumanOrEnd();
    expect(store.getState().state!.phase).toBe('game-over');
  });
});
