import { incomeLevelAt, type GameState, type IndustryType } from '@brassline/engine';
import type { Seat } from '../game/store';
import { playerColor } from './colors';

const IND: IndustryType[] = ['cotton', 'manufacturer', 'pottery', 'coal', 'iron', 'brewery'];
export const IND_NAME: Record<IndustryType, string> = {
  cotton: '棉', manufacturer: '制造', pottery: '陶', coal: '煤', iron: '铁', brewery: '酿',
};

export function PlayerPanel({ state, seats }: { state: GameState; seats: Seat[] }) {
  const cur = state.phase === 'game-over' ? -1 : state.turnOrder[state.currentPlayerIdx]!;
  return (
    <div className="players">
      {state.players.map((p, i) => (
        <div key={i} className={i === cur ? 'player active' : 'player'} style={{ borderColor: playerColor(i) }}>
          <b>P{i + 1}{seats[i] === 'bot' ? '（机器人）' : ''}</b> £{p.money} · 收入 {incomeLevelAt(p.incomeSpace)} · VP {p.vp} · 手牌 {p.hand.length}
          <div className="stacks">
            {IND.map((ind) => {
              const next = p.tiles.find((t) => t.industry === ind);
              return <span key={ind}>{IND_NAME[ind]}{next ? next.level : '—'}</span>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
