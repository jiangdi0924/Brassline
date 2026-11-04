import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '@brassline/engine';
import { BoardCanvas } from './board/BoardCanvas';
import type { Highlights, PickTarget } from './board/scene';
import { SAVE_KEY, gameStore, loadFromLocalStorage, saveToLocalStorage, type Seat } from './game/store';
import { highlightsFor, reduce, start, type Interaction, type UiEvent } from './game/interactions';
import { TopBar } from './hud/TopBar';
import { Markets } from './hud/Markets';
import { PlayerPanel } from './hud/PlayerPanel';
import { Hand } from './hud/Hand';
import { ActionBar } from './hud/ActionBar';
import { Log } from './hud/Log';
import { Overlay } from './hud/Overlay';

const EMPTY_HL: Highlights = { slots: new Set(), links: new Set(), merchants: new Set() };

function useStore() {
  const [, force] = useState(0);
  useEffect(() => gameStore.subscribe(() => force((n) => n + 1)), []);
  return gameStore.getState();
}

/** 热座交接用：同一玩家的同一回合内不重复要求亮牌。 */
function turnKey(st: GameState): string {
  return `${st.era}-${st.round}-${st.currentPlayerIdx}`;
}

export function App() {
  // 首次渲染前从 localStorage 恢复，避免大厅闪一下。
  useState(() => {
    if (!gameStore.getState().state) loadFromLocalStorage(gameStore);
    return 0;
  });
  const s = useStore();
  const [ui, setUi] = useState<Interaction | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [eraNotice, setEraNotice] = useState<string | null>(null);
  const prev = useRef<GameState | null>(null);

  // 每次状态变化：重置选择、存档、检测时代切换。
  useEffect(() => {
    const st = s.state;
    const before = prev.current;
    prev.current = st;
    if (!st) { setUi(null); return; }
    saveToLocalStorage(gameStore);
    if (before && before.era === 'canal' && st.era === 'rail') {
      setEraNotice('运河时代结束：已计分，所有 1 级板块和运河被移除，重新发牌。\n铁路时代开始。');
    }
    const humanTurn = st.phase !== 'game-over' && !gameStore.getState().isBotTurn();
    setUi(humanTurn ? start(gameStore.getState().legal(), st) : null);
  }, [s.state]);

  // 机器人逐步走棋（时代提示弹出时暂停，便于观察）。
  const humans = s.seats.filter((x) => x === 'human').length;
  useEffect(() => {
    const st = s.state;
    if (!st || st.phase === 'game-over' || eraNotice || !gameStore.getState().isBotTurn()) return;
    const t = setTimeout(() => gameStore.getState().stepBot(), humans === 0 ? 60 : 350);
    return () => clearTimeout(t);
  }, [s.state, eraNotice, humans]);

  const highlights = useMemo(() => (ui ? highlightsFor(ui) : EMPTY_HL), [ui]);

  const quit = () => {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    gameStore.setState({ state: null, log: [], actors: [], seats: [] });
    setEraNotice(null);
    setRevealedKey(null);
  };

  if (!s.state) {
    const startGame = (playerCount: 2 | 3 | 4, seats: Seat[]) =>
      s.newGame({ playerCount, seed: Date.now() % 1_000_000, seats });
    return (
      <div className="lobby">
        <h1>Brassline</h1>
        <button onClick={() => startGame(2, ['human', 'bot'])}>2 人：我 vs 机器人</button>
        <button onClick={() => startGame(2, ['human', 'human'])}>2 人热座</button>
        <button onClick={() => startGame(3, ['human', 'bot', 'bot'])}>3 人：我 vs 两个机器人</button>
        <button onClick={() => startGame(4, ['human', 'human', 'human', 'human'])}>4 人热座</button>
        <button onClick={() => startGame(2, ['bot', 'bot'])}>两机器人对战（观战）</button>
      </div>
    );
  }

  const state = s.state;
  const cur = s.currentPlayer();
  const me = cur !== null ? state.players[cur]! : null;
  const usable = new Set(ui?.step === 'card' ? ui.candidates.map((a) => (a.type === 'scout' ? a.cardIds[0] : a.cardId)) : []);
  const send = (ev: UiEvent) => ui && setUi(reduce(ui, ev));
  const onPick = (t: PickTarget) => send({ kind: 'pick', target: t });
  const confirm = () => {
    // chosen 永远是 enumerateActions 返回的对象之一；引擎 applyAction 仍会再校验一次。
    if (ui?.step === 'confirm' && ui.chosen) s.apply(ui.chosen);
  };
  const gated = humans > 1 && revealedKey !== turnKey(state);
  const log = s.log.map((action, i) => ({ player: s.actors[i] ?? 0, action }));

  return (
    <div className="app">
      <BoardCanvas state={state} highlights={highlights} onPick={onPick} />
      <TopBar state={state} onQuit={quit} />
      <Markets state={state} />
      <PlayerPanel state={state} seats={s.seats} />
      {log.length > 0 && <Log log={log} />}
      {state.phase !== 'game-over' && cur !== null && s.seats[cur] === 'bot' && (
        <div className="bottom"><span className="status">P{cur + 1}（机器人）思考中…</span></div>
      )}
      {ui && me && (
        <div className="bottom">
          {gated ? (
            <button className="primary" onClick={() => setRevealedKey(turnKey(state))}>P{cur! + 1} 请接手，点我亮牌</button>
          ) : (
            <>
              <ActionBar
                ui={ui}
                hand={me.hand}
                onType={(t) => send({ kind: 'type', type: t })}
                onDevelop={(ind) => send({ kind: 'pick', target: { kind: 'location', id: `industry:${ind}` } })}
                onDone={() => send({ kind: 'done' })}
                onVariant={(index) => send({ kind: 'variant', index })}
                onConfirm={confirm}
                onCancel={() => send({ kind: 'cancel' })}
              />
              <Hand cards={me.hand} usable={usable} hidden={false} onPick={(id) => send({ kind: 'card', cardId: id })} />
            </>
          )}
        </div>
      )}
      {eraNotice && <Overlay title="时代切换" body={eraNotice} button="继续" onClick={() => setEraNotice(null)} />}
      {state.phase === 'game-over' && !eraNotice && (
        <Overlay
          title="终局"
          body={state.players.map((p, i) => `P${i + 1}: ${p.vp} VP`).join('\n') + `\n胜者：${state.winner?.map((w) => `P${w + 1}`).join('、') ?? '—'}`}
          button="再来一局"
          onClick={quit}
        />
      )}
    </div>
  );
}
