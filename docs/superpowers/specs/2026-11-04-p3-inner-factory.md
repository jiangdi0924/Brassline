# P3：资源板块的实时产线内层（2026-11-04）

目标：在 Brass 的回合制外壳里，让煤矿、铁厂、酿酒厂三种资源板块各自带一块可铺设的小厂区，资源方块不再在建造时一次放满，而是由厂区的产线逐步"交付"出来。用它回答一个问题：**外层经济 + 内层产线，玩起来是否比纯 Brass 更有工厂感**。本阶段不碰棉、制造、陶。

## 1. 外层规则改动（packages/engine）

全部改动由 `GameState.rules.innerLayer`（新增，默认 `false`）开关控制。开关关闭时引擎行为与现在逐字节一致，现有 405 个测试不变。

开关打开时：

1. **建造资源板块**：煤矿/铁厂放置时 `resources = 0`，新增字段 `deposit = resourcesPlaced`（煤 2/3/4/5，铁 4/4/5/6）；酿酒厂 `deposit = BREWERY_BARRELS[era]`（运河 1，铁路 2）。**不再在建造时向市场卖方块**。
2. **交付**：新增纯函数

   ```ts
   export function deliverResources(
     state: GameState, location: LocationId, slotIdx: number, n: number,
   ): { state: GameState; delivered: number; soldToMarket: number; revenue: number; flipped: FlipEvent[] }
   ```

   把 `min(n, deposit)` 从 `deposit` 移到 `resources`。随后若板块未翻面且（煤矿：该地点连通任一商人位；铁厂：无条件），把能卖的方块立即卖入对应市场（复用 `sellCoalToMarket` / `sellIronToMarket`，从最贵空格起，钱给板块主人），卖不掉的留在 `resources`。酿酒厂不卖市场。交付后若 `resources === 0 && deposit === 0` → `applyFlip`。板块已翻面或 `deposit === 0` 时交付 0。
3. **耗尽翻面条件**：`drain` 里由 `remaining === 0` 改为 `remaining === 0 && (placed.deposit ?? 0) === 0`。也就是库存空了但矿里还有，不翻面，等下一次交付。
4. **覆盖对手煤矿/铁厂的"全图无方块"判定**：把 `deposit` 也算进"板上方块"。
5. **煤/铁/啤酒来源枚举**不变：只有 `resources > 0` 的板块是来源。库存为 0 的矿不是来源，取煤会跳过它去找下一个最近的。

`PlacedTile` 新增可选字段 `deposit?: number`（开关关闭时不写入，序列化兼容）。`GameState` 新增 `rules: { innerLayer: boolean }`，`newGame(playerCount, seed, opts?: { innerLayer?: boolean })`。

## 2. 内层模拟（新包 packages/factory，纯 TS，零依赖，确定性）

每块资源板块对应一个厂区 `Plot`。网格 10 列 × 7 行，左侧是矿源，右侧中点 (9, 3) 是出货口。

```ts
export type PlotKind = 'coal' | 'iron' | 'brewery';
export type Dir = 0 | 1 | 2 | 3;              // 东 南 西 北
export type BuildingKind = 'drill' | 'belt' | 'furnace' | 'pump' | 'farm' | 'brewhouse';
export type ItemKind = 'coal' | 'ore' | 'iron' | 'water' | 'grain' | 'beer';

export interface Building { kind: BuildingKind; x: number; y: number; dir: Dir; progress: number; buf: Partial<Record<ItemKind, number>>; item: ItemKind | null }
export interface Plot { kind: PlotKind; w: 10; h: 7; sources: { x: number; y: number; item: ItemKind }[]; dock: { x: 9; y: 3 }; buildings: Building[]; time: number; delivered: number }

export const COSTS: Record<BuildingKind, number>;          // 英镑整数
export function newPlot(kind: PlotKind): Plot;             // 含默认产线（见下）
export function canPlace(plot: Plot, kind: BuildingKind, x: number, y: number): string; // '' 可放，否则原因
export function place(plot: Plot, kind: BuildingKind, x: number, y: number, dir: Dir): Plot;
export function remove(plot: Plot, x: number, y: number): Plot;
export function rotate(plot: Plot, x: number, y: number, dir: Dir): Plot;
export function step(plot: Plot, seconds: number): { plot: Plot; delivered: number };  // 固定步长 0.5 s 内部循环
export function throughputPerMinute(plot: Plot): number;   // 预估，供界面显示
```

矿源布局（固定，不随机，便于比较）：

| 厂区 | 源格 | 产线 |
| --- | --- | --- |
| coal | (0,2) (0,3) (0,4) (1,3) 四格煤层 | 钻机→传送带→出货口 |
| iron | (0,2) (0,3) (0,4) (1,3) 四格铁矿 | 钻机(出 ore)→带→熔炉(1 ore → 1 iron)→带→出货口 |
| brewery | 水 (0,1) (0,2)；麦田 (0,4) (0,5) | 水泵 + 农场→带→酿造屋(1 water + 1 grain → 1 beer)→带→出货口 |

建筑与数值（都是常量，放在 `constants.ts`，调平衡只改这里）：

| 建筑 | 费用 £ | 占地 | 行为 |
| --- | --- | --- | --- |
| drill 钻机 | 2 | 1×1，只能放在源格上 | 每 45 s 向正面输出 1 件（coal 或 ore） |
| pump 水泵 | 2 | 源格（水） | 每 30 s 输出 1 water |
| farm 农场 | 2 | 源格（麦） | 每 30 s 输出 1 grain |
| belt 传送带 | 0 | 1×1 有方向 | 每 2 s 把物品前移一格；不接收来自正前方的物品；满了阻塞 |
| furnace 熔炉 | 3 | 1×1 有方向 | 收 ore，20 s 出 1 iron，正面输出 |
| brewhouse 酿造屋 | 3 | 1×1 有方向 | 收 water + grain 各 1，30 s 出 1 beer，正面输出 |
| dock 出货口 | 固定 | (9,3) | 接收对应产物（coal/iron/beer），计入 `delivered`；其他物品拒收 |

默认产线（`newPlot` 自动放好，不收费）：一台钻机（或水泵+农场）放在源格，一条直带通到出货口，中途放熔炉/酿造屋。默认吞吐约 coal 1.3 件/分、iron 1.3 件/分、beer 2 件/分。玩家加第二台钻机并接带，吞吐翻倍。

时间推进：外层每执行一个行动，所有厂区推进 `FACTORY_SECONDS_PER_ACTION = 20` 秒。4 人局一轮 8 个行动 = 160 s，默认煤线一轮交付约 3.5 块，与一级煤矿 deposit 2、二级 3 相称：想在一轮内把四级矿（5 块）送到市场，就得投钱加钻机。

确定性：`step` 不用 Math.random 和时间；所有玩家的厂区按 (地点, 槽位) 字典序推进，交付结果一致。

## 3. 客户端（packages/web）

- 在 store 里加 `plots: Record<"${location}:${slotIndex}", Plot>`。开新局时 `innerLayer: true`（大厅加开关，默认开）。
- `apply(action)` 后：对每块未翻面且 `deposit > 0` 的资源板块，若没有厂区则 `newPlot`（机器人也走这条，等于默认产线）；`step(plot, 20)`；`delivered > 0` 时调 `deliverResources`，把结果写回 state，并把"Dudley 煤矿交付 2 煤，卖市场 £7"推到日志。
- 厂区被覆盖或时代末移除（1 级板块）时删掉对应 plot。
- 点击自己的煤矿/铁厂/酿酒厂板块（不在行动选择的 target 步骤时）打开"厂区"面板：2D canvas 画 10×7 网格、源格、建筑、带上物品、出货口；右侧工具栏：钻机/传送带/熔炉/水泵/农场/酿造屋（显示费用）、旋转 R、拆除；顶部显示 `deposit`/`resources`、预估吞吐；"关闭"。放置扣钱走新增的引擎纯函数 `spendMoney(state, player, n)`（钱不够返回错误）；不是 Action，不进行动日志。
- 面板打开期间，每次外层行动后的 20 s 推进用 10 个子步在 1 秒内动画播放，看得到带子在动。
- 存档格式升到 v2：`{version: 2, state: GameState(JSON), plots, log, seats, seed}`，读档直接恢复 state，不再重放（因为 spendMoney 和交付不在日志里）。
- 棋盘上资源板块旁加一个小计数 "库存/矿量"，如 `1/3`。

## 4. 验证

- engine：开关关闭 405 个测试不变；开关打开新增测试覆盖 §1 的 5 条。
- factory：默认产线 20 s × 8 推进的交付量符合表中吞吐；带子阻塞；熔炉/酿造屋配方；canPlace 拒绝非源格放钻机、拒绝重叠；`step` 确定性（同一输入两次结果 stableStringify 相等）。
- sim：新增 `--inner` 参数，机器人用默认产线跑 50 局不崩，打印平均交付量与翻面时机。
- 试玩判定（我和用户各 20 分钟）：是否出现"我想加一台钻机"的时刻；是否为了及时有啤酒卖货而去调产线；外层一局时长增加多少。三条里两条成立，P3 方向成立。

## 5. 不做

棉/制造/陶的内层；厂区之间的物流；电力；厂区随机地形；联机。

## 6. P3 第一版结果（2026-11-04）

实现已提交（commit d510533）：引擎开关、厂区模拟器、面板、交付通知、v2 存档、`pnpm sim -- --inner`。共 486 个测试通过。

浏览器试玩（Cannock 一级煤矿）：面板、放钻机扣 £2、吞吐 1.33→2.67、行动后动画、交付通知、库存/矿量标签全部正常。

机器人对比（贪心，30 局）：开内层后 2 人局胜者 VP 56→28、平均收入 0.45→−4.55、Pass 24%→34%；3/4 人局分别 56→51、58→50。原因：建矿后要等约 3 个行动才有第一块煤，且建造时不再卖市场，开局资金断档。

试玩判定：**没有出现"我想加一台钻机"的时刻**。一级矿只有 2 块、酿酒厂 1 桶，默认产线 3–5 个行动就挖空，加钻机最多省一个行动；真正决定交付收益的仍是外层（连没连商人、市场有没有空格）。内层目前只让资源来得更慢。

下一步（按优先级）：
1. 数值：每行动推进 20 s → 10 s，让二级以上矿需要一两轮才挖空；建造时预填 1 块并照常卖市场，修复开局断档。
2. 把内层挪到真正有时间压力的地方：棉/制造/陶的 Sell 需要厂区先产出货物，啤酒已经是这个逻辑。
3. 再做 20 分钟试玩，按 §4 三条判定。
