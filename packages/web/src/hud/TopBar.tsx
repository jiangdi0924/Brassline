import { npcDemandFor, SOLO_ROUNDS_PER_ERA, type GameState } from '@brassline/engine';
import { playerColor } from './colors';

export function TopBar({ state, onQuit }: { state: GameState; onQuit(): void }) {
  const cur = state.turnOrder[state.currentPlayerIdx]!;
  const era = state.era === 'canal' ? '运河时代' : '铁路时代';
  if (state.rules.solo) {
    const d = npcDemandFor(state.era, state.round);
    return (
      <div className="topbar">
        <span>{era} · 第 {Math.min(state.round, SOLO_ROUNDS_PER_ERA)}/{SOLO_ROUNDS_PER_ERA} 轮</span>
        {state.phase !== 'game-over' && (
          <>
            <span>本轮区域需求：煤 {d.coal} · 铁 {d.iron} · 啤酒 {d.beer}</span>
            <span>本回合第 {state.actionsThisTurn + 1} 个行动</span>
          </>
        )}
        <span style={{ flex: 1 }} />
        <button className="topbar-btn" onClick={onQuit}>回大厅</button>
      </div>
    );
  }
  return (
    <div className="topbar">
      <span>{era} · 第 {state.round} 轮 · 牌堆 {state.deck.length}</span>
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
