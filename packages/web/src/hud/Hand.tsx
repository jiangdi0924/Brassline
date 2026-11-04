import { LOCATIONS, type Card } from '@brassline/engine';
import { IND_NAME } from './PlayerPanel';

export function cardLabel(c: Card): string {
  switch (c.kind) {
    case 'location': return LOCATIONS[c.location]!.name;
    case 'industry': return '产业：' + c.industries.map((i) => IND_NAME[i]).join('/');
    case 'wild-location': return '万能地点';
    case 'wild-industry': return '万能产业';
  }
}

export function Hand({ cards, usable, hidden, onPick }: {
  cards: Card[]; usable: Set<string>; hidden: boolean; onPick(cardId: string): void;
}) {
  return (
    <div className="hand">
      {cards.map((c) => (
        <button key={c.id} className={usable.has(c.id) ? 'card ok' : 'card'} disabled={hidden || !usable.has(c.id)} onClick={() => onPick(c.id)}>
          {hidden ? '▮' : cardLabel(c)}
        </button>
      ))}
    </div>
  );
}
