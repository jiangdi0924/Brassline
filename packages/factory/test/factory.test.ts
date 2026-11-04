import { describe, expect, it } from 'vitest';
import {
  COSTS,
  FACTORY_SECONDS_PER_ACTION,
  buildingAt,
  canPlace,
  newPlot,
  place,
  remove,
  rotate,
  step,
  throughputPerMinute,
  type Building,
  type Plot,
} from '../src/index.js';

const ROUND = FACTORY_SECONDS_PER_ACTION * 8; // 160 s

/** 按外层节奏推进：n 次 × 20 s。 */
function run(plot: Plot, actions = 8): Plot {
  let p = plot;
  for (let i = 0; i < actions; i++) p = step(p, FACTORY_SECONDS_PER_ACTION).plot;
  return p;
}

function bare(kind: Plot['kind']): Plot {
  return { ...newPlot(kind), buildings: [] };
}

function get(p: Plot, x: number, y: number): Building {
  const b = buildingAt(p, x, y);
  if (!b) throw new Error(`no building at ${x},${y}`);
  return b;
}

describe('constants', () => {
  it('matches spec', () => {
    expect(COSTS).toEqual({ drill: 2, belt: 0, furnace: 3, pump: 2, farm: 2, brewhouse: 3 });
    expect(FACTORY_SECONDS_PER_ACTION).toBe(20);
  });
});

describe('newPlot', () => {
  it('has fixed geometry and sources', () => {
    const p = newPlot('coal');
    expect(p.w).toBe(10);
    expect(p.h).toBe(7);
    expect(p.dock).toEqual({ x: 9, y: 3 });
    expect(p.sources).toHaveLength(4);
    expect(p.time).toBe(0);
    expect(p.delivered).toBe(0);
    expect(newPlot('brewery').sources.filter((s) => s.item === 'water')).toHaveLength(2);
  });

  it('buildings are sorted by (y, x)', () => {
    for (const k of ['coal', 'iron', 'brewery'] as const) {
      const bs = newPlot(k).buildings;
      const sorted = [...bs].sort((a, b) => a.y - b.y || a.x - b.x);
      expect(bs).toEqual(sorted);
    }
  });
});

describe('default lines', () => {
  it('coal delivers 3–4 in 8 × 20 s', () => {
    const p = run(newPlot('coal'));
    expect(p.time).toBe(ROUND);
    expect(p.delivered).toBeGreaterThanOrEqual(3);
    expect(p.delivered).toBeLessThanOrEqual(4);
  });

  it('iron delivers > 0 in 160 s', () => {
    expect(run(newPlot('iron')).delivered).toBeGreaterThan(0);
  });

  it('brewery delivers > 0 in 160 s, both inputs reach the brewhouse', () => {
    const p = run(newPlot('brewery'));
    expect(p.delivered).toBeGreaterThan(0);
    expect(p.delivered).toBeLessThanOrEqual(6);
  });

  it('steady state approaches spec throughput over 10 minutes', () => {
    const tenMin = (k: Plot['kind']) => step(newPlot(k), 600).plot.delivered;
    expect(tenMin('coal')).toBeGreaterThanOrEqual(12); // 1.33/min
    expect(tenMin('iron')).toBeGreaterThanOrEqual(11);
    expect(tenMin('brewery')).toBeGreaterThanOrEqual(17); // 2/min
  });

  it('second drill feeding the same belt roughly doubles coal', () => {
    let p = newPlot('coal');
    // drill (0,2) 东 → belt (1,2) 东 → belt (2,2) 南 → 汇入 (2,3)（从侧面进入）
    p = place(p, 'drill', 0, 2, 0);
    p = place(p, 'belt', 1, 2, 0);
    p = place(p, 'belt', 2, 2, 1);
    const one = run(newPlot('coal')).delivered;
    const two = run(p).delivered;
    expect(two).toBeGreaterThanOrEqual(one * 2 - 1);
    expect(two).toBeGreaterThanOrEqual(5);
    expect(throughputPerMinute(p)).toBeCloseTo(throughputPerMinute(newPlot('coal')) * 2, 5);
  });
});

describe('throughputPerMinute', () => {
  it('estimates default lines', () => {
    expect(throughputPerMinute(newPlot('coal'))).toBeCloseTo(60 / 45, 5);
    expect(throughputPerMinute(newPlot('iron'))).toBeCloseTo(60 / 45, 5);
    expect(throughputPerMinute(newPlot('brewery'))).toBeCloseTo(2, 5);
  });

  it('is 0 for a broken chain', () => {
    expect(throughputPerMinute(remove(newPlot('coal'), 5, 3))).toBe(0);
  });

  it('is capped by belt capacity', () => {
    // 4 台钻机全部汇到一条带：4 × 1.33 = 5.33 < 30，不封顶
    let p = newPlot('coal');
    p = place(p, 'drill', 0, 2, 0);
    p = place(p, 'belt', 1, 2, 0);
    p = place(p, 'belt', 2, 2, 1);
    expect(throughputPerMinute(p)).toBeLessThanOrEqual(30);
  });
});

describe('belts', () => {
  it('straight belt of 8 cells carries a full line without gaps or collisions', () => {
    // 手工把 8 格带子 (1..8,3) 每格塞满煤，出货口在 (9,3)。
    let p = bare('coal');
    for (let x = 1; x <= 8; x++) p = place(p, 'belt', x, 3, 0);
    p = { ...p, buildings: p.buildings.map((b) => ({ ...b, item: 'coal' as const })) };
    // 每 2 s 整条带前进一格：出货口每 2 s 收 1 件，带上始终连续无空隙。
    for (let i = 1; i <= 8; i++) {
      const r = step(p, 2);
      p = r.plot;
      expect(r.delivered).toBe(1);
      expect(p.delivered).toBe(i);
      const filled = p.buildings.filter((b) => b.item !== null).map((b) => b.x);
      const expected = [];
      for (let x = 1 + i; x <= 8; x++) expected.push(x);
      expect(filled).toEqual(expected);
    }
    expect(step(p, 10).delivered).toBe(0);
  });

  it('moves one cell per 2 s', () => {
    let p = bare('coal');
    p = place(p, 'belt', 3, 3, 0);
    p = place(p, 'belt', 4, 3, 0);
    p = { ...p, buildings: p.buildings.map((b) => (b.x === 3 ? { ...b, item: 'coal' as const } : b)) };
    p = step(p, 1.5).plot;
    expect(get(p, 3, 3).item).toBe('coal');
    p = step(p, 0.5).plot;
    expect(get(p, 3, 3).item).toBeNull();
    expect(get(p, 4, 3).item).toBe('coal');
  });

  it('does not accept from the cell directly in front', () => {
    // (4,3) 东向带子的物品推向 (5,3)；(5,3) 是西向带子，其正前方就是 (4,3) → 拒收。
    let p = bare('coal');
    p = place(p, 'belt', 4, 3, 0);
    p = place(p, 'belt', 5, 3, 2);
    p = { ...p, buildings: p.buildings.map((b) => (b.x === 4 ? { ...b, item: 'coal' as const } : b)) };
    p = step(p, 10).plot;
    expect(get(p, 4, 3).item).toBe('coal');
    expect(get(p, 5, 3).item).toBeNull();
  });

  it('blocks when the dock refuses the item (wrong kind)', () => {
    // 铁厂里不放熔炉：ore 直接送到出货口 → 拒收，带子堵满，不崩。
    let p = remove(newPlot('iron'), 4, 3);
    p = place(p, 'belt', 4, 3, 0);
    p = run(p, 30);
    expect(p.delivered).toBe(0);
    const full = p.buildings.filter((b) => b.kind === 'belt' && b.item === 'ore');
    expect(full).toHaveLength(7);
    expect(get(p, 1, 3).item).toBe('ore'); // 钻机自己也憋着一件
    expect(throughputPerMinute(p)).toBe(0);
  });

  it('blocks when the chain is broken', () => {
    const p = run(remove(newPlot('coal'), 6, 3), 30);
    expect(p.delivered).toBe(0);
    expect(get(p, 5, 3).item).toBe('coal');
  });
});

describe('machines', () => {
  it('furnace turns 1 ore into 1 iron in 20 s', () => {
    let p = bare('iron');
    p = place(p, 'furnace', 5, 3, 0);
    p = place(p, 'belt', 6, 3, 0);
    p = { ...p, buildings: p.buildings.map((b) => (b.kind === 'furnace' ? { ...b, buf: { ore: 2 } } : b)) };
    p = step(p, 19.5).plot;
    expect(get(p, 5, 3).buf.ore).toBe(2);
    expect(get(p, 6, 3).item).toBeNull();
    p = step(p, 0.5).plot;
    expect(get(p, 5, 3).buf.ore).toBe(1);
    expect(get(p, 6, 3).item).toBe('iron');
    p = step(p, 20).plot;
    expect(get(p, 5, 3).buf.ore).toBe(0);
    p = step(p, 60).plot;
    expect(get(p, 5, 3).buf.ore).toBe(0);
  });

  it('furnace refuses non-ore and caps buffer at 2', () => {
    let p = bare('iron');
    for (let x = 0; x <= 3; x++) p = place(p, 'belt', x, 3, 0);
    p = place(p, 'furnace', 4, 3, 0); // 正面 (5,3) 是空格 → 产物推不出，阻塞
    p = { ...p, buildings: p.buildings.map((b) => (b.kind === 'belt' ? { ...b, item: 'ore' as const } : b)) };
    p = step(p, 200).plot;
    const f = get(p, 4, 3);
    expect(f.item).toBe('iron');
    // 4 件 ore：1 件炼成 iron 卡在熔炉（正面无去处），缓冲回到上限 2，第 4 件留在带上
    expect(f.buf.ore).toBe(2);
    expect(get(p, 3, 3).item).toBe('ore');
    expect(p.buildings.filter((b) => b.item === 'ore')).toHaveLength(1);
    // coal 送进熔炉被拒收
    let q = bare('iron');
    q = place(q, 'belt', 3, 3, 0);
    q = place(q, 'furnace', 4, 3, 0);
    q = { ...q, buildings: q.buildings.map((b) => (b.kind === 'belt' ? { ...b, item: 'coal' as const } : b)) };
    q = step(q, 10).plot;
    expect(get(q, 3, 3).item).toBe('coal');
    expect(get(q, 4, 3).buf).toEqual({});
  });

  it('brewhouse needs water + grain, 30 s per beer', () => {
    let p = bare('brewery');
    p = place(p, 'brewhouse', 4, 3, 0);
    p = place(p, 'belt', 5, 3, 0);
    const withBuf = (buf: Building['buf']) => ({
      ...p,
      buildings: p.buildings.map((b) => (b.kind === 'brewhouse' ? { ...b, buf } : b)),
    });
    const onlyWater = step(withBuf({ water: 2 }), 100).plot;
    expect(get(onlyWater, 5, 3).item).toBeNull();
    expect(get(onlyWater, 4, 3).buf.water).toBe(2);

    let both = step(withBuf({ water: 1, grain: 2 }), 29.5).plot;
    expect(get(both, 5, 3).item).toBeNull();
    both = step(both, 0.5).plot;
    expect(get(both, 5, 3).item).toBe('beer');
    expect(get(both, 4, 3).buf).toEqual({ water: 0, grain: 1 });
  });
});

describe('placement', () => {
  it('canPlace refuses drill off-source, overlap, out of bounds, dock', () => {
    const p = newPlot('coal');
    expect(canPlace(p, 'drill', 0, 2)).toBe('');
    expect(canPlace(p, 'drill', 5, 5)).not.toBe('');
    expect(canPlace(p, 'drill', 1, 3)).not.toBe(''); // 已有钻机
    expect(canPlace(p, 'belt', 2, 3)).not.toBe(''); // 已有带子
    expect(canPlace(p, 'belt', -1, 0)).not.toBe('');
    expect(canPlace(p, 'belt', 10, 0)).not.toBe('');
    expect(canPlace(p, 'belt', 0, 7)).not.toBe('');
    expect(canPlace(p, 'belt', 9, 3)).not.toBe('');
    expect(canPlace(p, 'furnace', 9, 3)).not.toBe('');
    expect(canPlace(p, 'belt', 5, 5)).toBe('');
    expect(canPlace(p, 'pump', 0, 2)).not.toBe(''); // 煤层不是水源
    const b = newPlot('brewery');
    expect(canPlace(b, 'pump', 0, 1)).toBe('');
    expect(canPlace(b, 'farm', 0, 1)).not.toBe('');
    expect(canPlace(b, 'farm', 0, 5)).toBe('');
    expect(canPlace(b, 'drill', 0, 5)).not.toBe('');
    expect(() => place(p, 'drill', 5, 5, 0)).toThrow();
  });

  it('place / remove / rotate are pure', () => {
    const p = newPlot('coal');
    const snap = JSON.stringify(p);
    const placed = place(p, 'belt', 5, 5, 1);
    expect(buildingAt(placed, 5, 5)?.dir).toBe(1);
    const removed = remove(p, 4, 3);
    expect(buildingAt(removed, 4, 3)).toBeUndefined();
    expect(canPlace(removed, 'belt', 4, 3)).toBe('');
    const rotated = rotate(p, 4, 3, 3);
    expect(buildingAt(rotated, 4, 3)?.dir).toBe(3);
    step(p, 100);
    expect(JSON.stringify(p)).toBe(snap);
  });
});

describe('step', () => {
  it('is deterministic', () => {
    for (const k of ['coal', 'iron', 'brewery'] as const) {
      const a = step(newPlot(k), 333);
      const b = step(newPlot(k), 333);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('step(plot, 0) is a no-op', () => {
    const p = step(newPlot('iron'), 77).plot;
    const r = step(p, 0);
    expect(r.delivered).toBe(0);
    expect(JSON.stringify(r.plot)).toBe(JSON.stringify(p));
  });

  it('time accumulates and splitting steps gives the same result', () => {
    const one = step(newPlot('brewery'), 160).plot;
    let many = newPlot('brewery');
    for (let i = 0; i < 64; i++) many = step(many, 2.5).plot;
    expect(many.time).toBe(160);
    expect(JSON.stringify(many)).toBe(JSON.stringify(one));
    let frac = newPlot('coal');
    for (let i = 0; i < 4; i++) frac = step(frac, 0.25).plot;
    expect(frac.time).toBe(1);
    expect(JSON.stringify(frac)).toBe(JSON.stringify(step(newPlot('coal'), 1).plot));
  });

  it('step result delivered equals delta of plot.delivered', () => {
    const a = step(newPlot('coal'), 100).plot;
    const r = step(a, 100);
    expect(r.plot.delivered - a.delivered).toBe(r.delivered);
  });
});
