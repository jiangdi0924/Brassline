import { LINKS, LOCATIONS, type Action, type IndustryType } from '@brassline/engine';
import { IND_NAME } from './PlayerPanel';

const ind = (i: IndustryType) => IND_NAME[i];

const placeName = (id: string): string => LOCATIONS[id]?.name ?? id.charAt(0).toUpperCase() + id.slice(1);

export function linkName(i: number): string {
  const l = LINKS[i];
  return l ? `${placeName(l.a)}–${placeName(l.b)}` : `#${i}`;
}

export function describe(a: Action): string {
  switch (a.type) {
    case 'build': return `建造 ${ind(a.industry)} @ ${LOCATIONS[a.location]!.name}`;
    case 'network': return `铺路 ${a.links.map(linkName).join('，')}`;
    case 'develop': return `研发 ${a.removals.map(ind).join('+')}`;
    case 'sell': return `卖货 ${a.sales.map((s) => `${LOCATIONS[s.location]!.name}→${placeName(s.merchant)}`).join('，')}`;
    case 'loan': return '贷款 £30';
    case 'scout': return '侦察';
    case 'pass': return '跳过';
  }
}

export interface LogEntry { player: number; action: Action }

export function Log({ log }: { log: LogEntry[] }) {
  const start = Math.max(0, log.length - 12);
  return (
    <div className="log">
      {log.slice(start).map((e, i) => <div key={start + i}>P{e.player + 1}：{describe(e.action)}</div>)}
    </div>
  );
}
