import type { GameState } from '@brassline/engine';
import { playerColor } from './colors';

export function TopBar({ state, onQuit }: { state: GameState; onQuit(): void }) {
  const cur = state.turnOrder[state.currentPlayerIdx]!;
  return (
    <div className="topbar">
      <span>{state.era === 'canal' ? '运河时代' : '铁路时代'} · 第 {state.round} 轮 · 牌堆 {state.deck.length}</span>
      <span>顺位：{state.turnOrder.map((p) => (
        <b key={p} style={{ color: playerColor(p) }}>P{p + 1} </b>
      ))}</span>
      {state.phase !== 'game-over' && (
        <span>当前：<b style={{ color: playerColor(cur) }}>P{cur + 1}</b>（本回合第 {state.actionsThisTurn + 1} 个行动）</span>
      )}
      <span style={{ flex: 1 }} />
      <button className="topbar-btn" onClick={onQuit}>回大厅</button>
    </div>
  );
}
