import {
  COAL_MARKET_PRICES,
  IRON_MARKET_PRICES,
  buyCoalCost,
  buyIronCost,
  type GameState,
} from '@brassline/engine';

/** filled 块占据价格数组末尾（最贵的 filled 格），见引擎 market.ts。 */
function Market({ name, prices, filled, next }: {
  name: string; prices: readonly number[]; filled: number; next: number;
}) {
  return (
    <div className="market">
      <b>{name}</b>
      <div className="market-row">
        {prices.map((p, i) => (
          <span key={i} className={i >= prices.length - filled ? 'cube on' : 'cube'} title={`£${p}`}>{p}</span>
        ))}
      </div>
      <small>余 {filled} 块 · 下一块买价 £{next}</small>
    </div>
  );
}

export function Markets({ state }: { state: GameState }) {
  return (
    <div className="markets">
      <Market name="煤" prices={COAL_MARKET_PRICES} filled={state.coalMarket} next={buyCoalCost(state, 1)} />
      <Market name="铁" prices={IRON_MARKET_PRICES} filled={state.ironMarket} next={buyIronCost(state, 1)} />
    </div>
  );
}
