# Solo 变体：没有手牌、没有对手的单人模式（2026-11-05）

目标：验证"去掉多人桌游的壳（手牌、顺位、对手）之后，Brass 的经济骨架 + 厂区内层在单人下是否成立"。做法是在现有引擎上加一个规则变体，不另起炉灶。

## 1. 规则（引擎，`rules.solo = true`）

### 1.1 开局

- `newGame(1, seed, { solo: true, innerLayer?: boolean })`。`playerCount` 允许为 1，仅在 solo 下。
- 版图按 2 人设置：商人位只放 Shrewsbury、Gloucester、Oxford（Warrington、Nottingham 不放），商人板块用 2 人池（万能、棉、制造、空白×2）洗混。市场设置不变。起始 £17，收入 0。
- 牌堆为空。玩家"手牌"由引擎每次行动前自动补成：**1 张合成的 Wild Industry 卡**（id `solo-industry`）加 **N 张合成的 Wild Location 卡**（id `solo-permit-k`，N = 当前许可证数）。弃掉时不进弃牌堆、不回 Wild 供应堆，直接消失；下一次行动前重新生成。
- 每时代固定 **8 轮**，每轮 **2 个行动**（运河时代第 1 轮仍为 1 个）。侦察行动不存在。

### 1.2 行动

六个行动照旧：建造、铺路、研发、卖货、贷款、跳过。卡牌约束由合成卡自然实现：

- 用 Wild Industry 建造 = 在自己网络内建任意产业；场上无板块时可建在任意地点（原规则）。
- 用 Wild Location（许可证）建造 = 在任意地点建任意产业（农场酿酒厂除外，原规则）。
- **许可证的获得**：每次卖货行动翻面的每块板块给 1 张许可证（`permits += 1`）。许可证不上限，用一张少一张。

### 1.3 NPC 需求（每轮末、收入前结算）

区域里看不见的其他实业家每轮消耗资源，让你的资源板块翻面。按下表从你的未翻面板块上拿走方块，拿到最后一块就按原规则翻面（主人进收入）。

| 时代 | 轮 | 煤 | 铁 | 啤酒 |
| --- | --- | --- | --- | --- |
| 运河 | 1–2 | 1 | 1 | 0 |
| 运河 | 3–5 | 2 | 1 | 1 |
| 运河 | 6–8 | 2 | 2 | 1 |
| 铁路 | 1–3 | 3 | 2 | 1 |
| 铁路 | 4–8 | 4 | 2 | 2 |

取用顺序：

- 煤：只从**连通到任一商人位**的未翻面煤矿拿（NPC 通过商人位把煤运走）；多座时按到最近商人位的路程升序，再按地点 id。
- 铁：任意未翻面铁厂，按地点 id。
- 啤酒：只从**连通到任一商人位**的未翻面酿酒厂拿，顺序同煤。

不够就拿到没有为止，不从市场买。常量放 `src/data/solo.ts` 的 `NPC_DEMAND`，调平衡只改这里。

### 1.4 时代与终局

- 第 8 轮末触发时代结束，流程同原规则（路计分、板块计分、运河末移除 1 级板块与运河、补商人啤酒），不洗牌不发牌。
- 铁路时代第 8 轮末终局。`state.winner = [0]`。评级：`soloRank(vp)` 返回 `'none' | 'bronze' | 'silver' | 'gold'`，阈值 `SOLO_TARGETS = { bronze: 50, silver: 80, gold: 110 }`（先按这个，`pnpm sim -- --solo` 跑出贪心机器人的分布后再校准到：bronze ≈ 贪心中位数，silver ≈ 贪心 90 分位，gold = silver × 1.35）。
- 顺位、花费计数保留但无意义。

### 1.5 不变的部分

资源来源与连通规则、市场、翻面、研发、贷款、覆盖、时代末清场、Link 计分（商人位两端固定 2）、内层开关与交付，全部不变。

## 2. 引擎接口

```ts
newGame(1, seed, { solo: true, innerLayer?: boolean })   // playerCount 1 仅 solo 允许
state.rules.solo: boolean
state.players[0].permits: number                           // 仅 solo 写入
enumerateActions(state, 0)                                 // 合成卡已在状态里，直接可用
applyAction(state, action)                                 // 照旧；轮末自动结算 NPC 需求，事件进 lastEvents
type NpcConsumeEvent = { kind: 'npc-consume'; location; slotIndex; industry; count; flipped: boolean }
SOLO_ROUNDS_PER_ERA = 8
NPC_DEMAND, npcDemandFor(era, round) → { coal, iron, beer }
SOLO_TARGETS, soloRank(vp)
```

实现建议：合成卡在 `refillHand` 的 solo 分支里生成；时代结束条件在 `turn.ts` 加 solo 分支（`round >= SOLO_ROUNDS_PER_ERA` 时置 `eraEndPending`）；NPC 需求在 `settleRoundEnd` 的 solo 分支里、收入之前执行，复用 `resources.ts` 的 `drain`。

## 3. 客户端

- 大厅加"单人：对抗区域需求"（默认开厂区内层）。
- solo 下：手牌区换成"许可证 ×N"徽章和一句提示"建造：网络内任意产业；有许可证可建任意地点"；行动栏去掉侦察；选卡步骤自动跳过（只有一张合成卡时直接用它；建造时若有许可证则弹两个选项：网络内 / 用许可证）。
- 顶栏显示"第 r/8 轮"和本轮 NPC 需求"煤 2 · 铁 1 · 啤酒 1"。
- 轮末通知："区域消耗 Dudley 煤矿 2 煤，煤矿翻面，收入 +4"。
- 终局弹窗显示 VP、评级和三档阈值。
- 存档 v2 直接兼容（state 整体保存）。

## 4. 模拟器

`pnpm sim -- --solo --games 100 --bot greedy`：跑贪心机器人的 solo 分布，打印 VP 的均值、中位数、90 分位、各评级占比、每轮 NPC 实际消耗量、资源板块翻面数、终局未翻面资源板块数。用这组数校准 §1.4 的阈值。

## 5. 验收

- 引擎：原 427 个测试不变；solo 新测试覆盖 §1.1–1.4 每条（合成卡每次行动前重生、许可证增减、NPC 取用顺序与连通条件、8 轮时代结束、终局评级）。
- 客户端：浏览器里单人打完两个时代，没有 IllegalActionError。
- 试玩判定（20 分钟）：是否有"这轮 NPC 要 2 煤，我的矿够不够"的盘算；是否为了许可证去卖货；厂区内层是否因为没人抢而被真正打开调过。三条里两条成立，solo 方向成立。

## 6. 不做

NPC 建厂、NPC 修路、难度选择、成就。
