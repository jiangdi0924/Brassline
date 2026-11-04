import { LOCATIONS, type Action, type Card, type IndustryType } from '@brassline/engine';
import type { Interaction } from '../game/interactions';
import { cardLabel } from './Hand';
import { describe, linkName } from './Log';
import { IND_NAME } from './PlayerPanel';

const TYPES: { t: Action['type']; label: string }[] = [
  { t: 'build', label: '建造' }, { t: 'network', label: '铺路' }, { t: 'develop', label: '研发' },
  { t: 'sell', label: '卖货' }, { t: 'loan', label: '贷款' }, { t: 'scout', label: '侦察' }, { t: 'pass', label: '跳过' },
];
const TYPE_NAME = Object.fromEntries(TYPES.map(({ t, label }) => [t, label])) as Record<Action['type'], string>;

/** confirm 阶段同目标多个变体的区分标签。 */
function variantLabel(a: Action, hand: Card[]): string {
  const card = (id: string) => {
    const c = hand.find((h) => h.id === id);
    return c ? cardLabel(c) : id;
  };
  switch (a.type) {
    case 'build':
      return `${IND_NAME[a.industry]} @ ${LOCATIONS[a.location]!.name}${a.slotIndex !== undefined ? ` 槽${a.slotIndex + 1}` : ''}`
        + (a.coalSources ? ` · 煤源 ${a.coalSources.length}` : '') + (a.ironSources ? ` · 铁源 ${a.ironSources.length}` : '');
    case 'scout':
      return `另弃：${card(a.cardIds[1])} + ${card(a.cardIds[2])}`;
    case 'network':
      return a.links.map(linkName).join('，')
        + (a.beerSource ? ` · 啤酒取自 ${LOCATIONS[a.beerSource.location]?.name ?? a.beerSource.location}` : '')
        + (a.beerFromOpponentBrewery ? ` · 对手酒厂 ${LOCATIONS[a.beerFromOpponentBrewery]?.name ?? ''}` : '');
    case 'sell':
      return a.sales.map((s) => `${LOCATIONS[s.location]!.name}→${s.merchant}${s.useMerchantBeer ? '（用商人啤酒）' : ''}`).join('，')
        + (a.bonusDevelop ? ` · 奖励研发 ${IND_NAME[a.bonusDevelop]}` : '');
    default:
      return describe(a);
  }
}

export function ActionBar({ ui, hand, onType, onDevelop, onDone, onVariant, onConfirm, onCancel }: {
  ui: Interaction;
  hand: Card[];
  onType(t: Action['type']): void;
  onDevelop(ind: IndustryType): void;
  onDone(): void;
  onVariant(index: number): void;
  onConfirm(): void;
  onCancel(): void;
}) {
  const available = new Set(ui.legal.map((a) => a.type));
  const devInds = new Set<IndustryType>();
  if (ui.step === 'target' && ui.type === 'develop') {
    for (const a of ui.candidates) if (a.type === 'develop') a.removals.forEach((r) => devInds.add(r));
  }
  const canFinish = ui.step === 'target' && ui.picked.length > 0 && ui.chosen !== null;
  return (
    <div className="actionbar">
      {ui.step === 'type' && TYPES.map(({ t, label }) => (
        <button key={t} disabled={!available.has(t)} onClick={() => onType(t)}>{label}</button>
      ))}
      {ui.step === 'card' && <span>{TYPE_NAME[ui.type!]}：选一张要弃的卡{ui.type === 'scout' ? '（另两张在确认时可切换）' : ''}</span>}
      {ui.step === 'target' && ui.type === 'develop' && (
        <span>
          移除（{ui.picked.length}/2）：{[...devInds].map((ind) => (
            <button key={ind} onClick={() => onDevelop(ind)}>{IND_NAME[ind]}</button>
          ))}
        </span>
      )}
      {ui.step === 'target' && ui.type !== 'develop' && (
        <span>
          {TYPE_NAME[ui.type!]}：在棋盘上点绿色高亮的目标
          {ui.type === 'sell' ? (ui.picked.length % 2 === 0 ? '（先点自己的板块）' : '（再点商人）') : ''}
          {ui.type === 'network' && ui.picked.length > 0 ? `（已选 ${ui.picked.length} 条）` : ''}
        </span>
      )}
      {canFinish && <button onClick={onDone}>就这些</button>}
      {ui.step === 'confirm' && ui.candidates.length > 1 && (
        <select value={Math.max(0, ui.candidates.indexOf(ui.chosen!))} onChange={(e) => onVariant(Number(e.target.value))}>
          {ui.candidates.map((a, i) => <option key={i} value={i}>{variantLabel(a, hand)}</option>)}
        </select>
      )}
      {ui.step === 'confirm' && ui.chosen && (
        <button className="primary" onClick={onConfirm}>确认：{describe(ui.chosen)}</button>
      )}
      {ui.step !== 'type' && <button onClick={onCancel}>取消</button>}
    </div>
  );
}
