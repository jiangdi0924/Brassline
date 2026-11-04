import { BELT_CAPACITY_PER_MINUTE, PRODUCT } from './constants.js';
import { frontOf, producerItem, producerPeriod, RECIPES } from './sim.js';
import type { Building, ItemKind, Plot } from './types.js';

type Rates = Partial<Record<ItemKind, number>>;

/**
 * 静态预估出货口吞吐（件/分），不跑模拟。
 *
 * 公式：沿物品流向自下而上计算每个建筑的输出速率 out(b)（按物品分）：
 *   - 钻机/水泵/农场：out = 60 / 周期（钻机 45 s → 1.33，水泵/农场 30 s → 2）
 *   - 传送带：in = Σ 指向它且被接收的上游 out；out = in，总量超过带容量
 *     60 / BELT_SECONDS = 30 件/分时按比例缩放
 *   - 熔炉/酿造屋：out(产物) = min(60 / 配方秒数, min over 每种配方输入的 in)
 *   - 出货口：吞吐 = Σ 指向出货口、物品为本厂产物的上游 out
 * 单链时即 min(生产者速率, 机器速率, 带容量)；汇流处相加。
 * 被拒收的物品（错的配方/错的产物/从正前方进入/指向生产者）贡献 0。环路贡献 0。
 */
export function throughputPerMinute(plot: Plot): number {
  const upstream = new Map<string, Building[]>();
  for (const b of plot.buildings) {
    const f = frontOf(b);
    const k = `${f.x},${f.y}`;
    const list = upstream.get(k) ?? [];
    list.push(b);
    upstream.set(k, list);
  }
  const memo = new Map<Building, Rates>();
  const visiting = new Set<Building>();

  const inputs = (x: number, y: number, target: Building | null): Rates => {
    const sum: Rates = {};
    for (const u of upstream.get(`${x},${y}`) ?? []) {
      if (target) {
        const tf = frontOf(target);
        if (tf.x === u.x && tf.y === u.y) continue; // 不接收来自正前方
      }
      for (const [item, r] of Object.entries(out(u)) as [ItemKind, number][]) {
        sum[item] = (sum[item] ?? 0) + r;
      }
    }
    return sum;
  };

  function out(b: Building): Rates {
    const m = memo.get(b);
    if (m) return m;
    if (visiting.has(b)) return {};
    visiting.add(b);
    let res: Rates = {};
    if (b.kind === 'drill' || b.kind === 'pump' || b.kind === 'farm') {
      const item = producerItem(plot, b);
      if (item) res = { [item]: 60 / producerPeriod(b.kind) };
    } else if (b.kind === 'belt') {
      const inp = inputs(b.x, b.y, b);
      const total = Object.values(inp).reduce((a, v) => a + v, 0);
      const scale = total > BELT_CAPACITY_PER_MINUTE ? BELT_CAPACITY_PER_MINUTE / total : 1;
      for (const [item, r] of Object.entries(inp) as [ItemKind, number][]) res[item] = r * scale;
    } else {
      const recipe = RECIPES[b.kind];
      const inp = inputs(b.x, b.y, b);
      let rate = 60 / recipe.seconds;
      for (const i of recipe.inputs) rate = Math.min(rate, inp[i] ?? 0);
      if (rate > 0) res = { [recipe.output]: rate };
    }
    visiting.delete(b);
    memo.set(b, res);
    return res;
  }

  const atDock = inputs(plot.dock.x, plot.dock.y, null);
  return atDock[PRODUCT[plot.kind]] ?? 0;
}
