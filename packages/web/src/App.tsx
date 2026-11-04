import { useEffect, useState } from 'react';
import { gameStore } from './game/store';

export function App() {
  const [, force] = useState(0);
  useEffect(() => gameStore.subscribe(() => force((n) => n + 1)), []);
  const s = gameStore.getState();
  if (!s.state) {
    return (
      <button onClick={() => s.newGame({ playerCount: 2, seed: Date.now() % 100000, seats: ['human', 'bot'] })}>
        开始 2 人局（人 vs 机器人）
      </button>
    );
  }
  return <pre>{`era=${s.state.era} round=${s.state.round} player=${s.currentPlayer()} legal=${s.legal().length}`}</pre>;
}
