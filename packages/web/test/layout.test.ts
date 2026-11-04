import { describe, expect, it } from 'vitest';
import { LINKS, LOCATIONS, MERCHANTS } from '@brassline/engine';
import { NODE_POS, linkMidpoint } from '../src/board/layout';

describe('board layout', () => {
  it('has a position for every location and merchant', () => {
    for (const id of Object.keys(LOCATIONS)) expect(NODE_POS[id], id).toBeDefined();
    for (const id of Object.keys(MERCHANTS)) expect(NODE_POS[id], id).toBeDefined();
  });
  it('every link has both endpoints positioned', () => {
    LINKS.forEach((l, i) => {
      const m = linkMidpoint(i);
      expect(Number.isFinite(m.x) && Number.isFinite(m.z), `link ${i} ${l.a}-${l.b}`).toBe(true);
    });
  });
});
