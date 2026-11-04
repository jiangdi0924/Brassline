# Brassline P0 + P1 实施计划：规则引擎跑通 + Web 可玩版

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/Users/Norton/MyProject/Brassline` 建一个 pnpm monorepo：引入 MIT 规则引擎并用无界面模拟器证明整局流程能跑通（P0），再做一个 three.js + React 的浏览器客户端，支持热座和机器人，静态部署给朋友玩（P1）。

**Architecture:** 规则只在 `packages/engine` 结算（`enumerateActions` / `applyAction`，纯函数，种子确定性）。`packages/sim` 用随机和贪心机器人自对弈并校验重放。`packages/web` 持有 `GameState` 加行动日志，three.js 只画棋盘，DOM 画所有文字界面，合法目标高亮直接来自 `enumerateActions`。

**Tech Stack:** TypeScript 5、pnpm 10 workspaces、vitest 5、Vite 8、three 0.187、React 19、zustand 5。本机 Node 24.7。

设计规格：`docs/superpowers/specs/2026-11-04-brassline-demo-design.md`。开源引擎的本地副本在 `/private/tmp/claude-501/-Users-Norton-MyProject-iPhoneDuoIdeas/0b5b186f-9c89-4c93-bb67-f758ee5f6c71/scratchpad/brass-refs/BrassBirmingham`（临时目录，会消失；消失了就 `git clone --depth 1 https://github.com/Quasrain-Coder/BrassBirmingham.git` 到一个新的空目录再拷）。

---

## 文件结构

```
Brassline/
  package.json                 根：workspaces 脚本
  pnpm-workspace.yaml
  tsconfig.base.json           strict + NodeNext（与引擎一致）
  .gitignore
  packages/engine/             引入的引擎（src/、test/、LICENSE、NOTICE.md）
  packages/sim/src/run.ts      自对弈 CLI，输出统计与校验
  packages/sim/test/replay.test.ts
  packages/bots/src/greedy.ts  贪心机器人（PlayerAgent）
  packages/bots/test/greedy.test.ts
  packages/web/
    index.html
    vite.config.ts
    src/main.tsx               挂载 React
    src/App.tsx                布局：Canvas 容器 + HUD
    src/game/store.ts          zustand：state、log、seed、机器人座位、存档
    src/game/interactions.ts   行动选择状态机（纯函数，可测）
    src/board/layout.ts        地点/商人坐标表
    src/board/scene.ts         three.js 场景：建、更新、拾取
    src/board/BoardCanvas.tsx  把 scene 挂进 React
    src/hud/*.tsx              TopBar、Markets、PlayerPanel、Hand、ActionBar、Log、Overlay
    test/*.test.ts             store、interactions、layout 测试
```

---

### Task 1: Monorepo 脚手架

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.npmrc`

- [ ] **Step 1: 建目录并初始化 git**

```bash
cd /Users/Norton/MyProject/Brassline && git init -b main
```

- [ ] **Step 2: 写根配置**

`package.json`：
```json
{
  "name": "brassline",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.23.0",
  "scripts": {
    "test": "pnpm -r --if-present test",
    "typecheck": "pnpm -r --if-present typecheck",
    "sim": "pnpm -F @brassline/sim run sim",
    "dev": "pnpm -F @brassline/web dev",
    "build": "pnpm -F @brassline/web build"
  },
  "devDependencies": {
    "typescript": "^5.9.0"
  }
}
```

`pnpm-workspace.yaml`：
```yaml
packages:
  - packages/*
```

`tsconfig.base.json`：
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`.gitignore`：
```
node_modules/
dist/
coverage/
*.log
.DS_Store
packages/sim/out/
```

`.npmrc`：
```
auto-install-peers=true
```

- [ ] **Step 3: 安装并验证**

Run: `cd /Users/Norton/MyProject/Brassline && pnpm install`
Expected: 输出以 `Done in` 结尾，生成 `pnpm-lock.yaml`。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold pnpm monorepo"
```

---

### Task 2: 引入规则引擎并跑通它的 390 个测试

**Files:**
- Create: `packages/engine/`（整体拷贝 `src/`、`test/`、`tsconfig.json`、`vitest.config.ts`）
- Create: `packages/engine/package.json`、`packages/engine/LICENSE`、`packages/engine/NOTICE.md`

- [ ] **Step 1: 拷贝引擎源码和测试**

```bash
REF=/private/tmp/claude-501/-Users-Norton-MyProject-iPhoneDuoIdeas/0b5b186f-9c89-4c93-bb67-f758ee5f6c71/scratchpad/brass-refs/BrassBirmingham/packages/engine
mkdir -p /Users/Norton/MyProject/Brassline/packages/engine
cp -R "$REF/src" "$REF/test" "$REF/tsconfig.json" "$REF/vitest.config.ts" /Users/Norton/MyProject/Brassline/packages/engine/
ls /Users/Norton/MyProject/Brassline/packages/engine/src
```
Expected: 列出 `actions agents apply.ts data era.ts errors.ts index.ts market.ts network.ts resources.ts rng.ts serialize.ts state.ts turn.ts types.ts`。

- [ ] **Step 2: 写 package.json（改名，升 vitest）**

`packages/engine/package.json`：
```json
{
  "name": "@brassline/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^5.1.0"
  }
}
```

把 `packages/engine/vitest.config.ts` 整个替换为（去掉覆盖率依赖）：
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: 写版权声明**

`packages/engine/LICENSE`：
```
MIT License

Copyright (c) 2026 Quasrain-Coder (https://github.com/Quasrain-Coder/BrassBirmingham)
Copyright (c) 2026 Brassline contributors (modifications)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`packages/engine/NOTICE.md`：
```markdown
# 来源

本包的初始版本来自 https://github.com/Quasrain-Coder/BrassBirmingham 的 `packages/engine`
（MIT，仅代码；2026-11-04 拷贝，上游 commit 见 git 首次提交信息）。
规则数据对照 Roxley 官方规则书 v2018.11（`docs/reference/`）。
本项目不包含任何官方美术、卡牌文字或商标。
```

- [ ] **Step 4: 安装并跑测试**

Run: `cd /Users/Norton/MyProject/Brassline && pnpm install && pnpm -F @brassline/engine test 2>&1 | tail -15`
Expected: 最后几行含 `Test Files  34 passed (34)` 和 `Tests  390 passed (390)`。少于 390 或有 failed 就停下来排查（最可能是 vitest 5 与旧断言 API 的差异，逐条修）。

- [ ] **Step 5: 类型检查**

Run: `pnpm -F @brassline/engine typecheck`
Expected: 无输出（成功）。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(engine): vendor MIT Brass rules engine with its test suite"
```

---

### Task 3: 无界面模拟器（P0 完成标志）

**Files:**
- Create: `packages/sim/package.json`, `packages/sim/tsconfig.json`, `packages/sim/src/run.ts`, `packages/sim/src/stats.ts`
- Test: `packages/sim/test/replay.test.ts`

- [ ] **Step 1: 写包配置**

`packages/sim/package.json`：
```json
{
  "name": "@brassline/sim",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "sim": "tsx src/run.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@brassline/engine": "workspace:*",
    "@brassline/bots": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "vitest": "^5.1.0"
  }
}
```

`packages/sim/tsconfig.json`：
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

（`@brassline/bots` 在 Task 4 建；本 Task 先只用引擎自带的 `RandomAgent`。为了让 `pnpm install` 不报错，先在 Task 4 的 Step 1 之前把 `"@brassline/bots": "workspace:*"` 这一行暂时删掉，Task 4 再加回来。）

- [ ] **Step 2: 写失败的重放测试**

`packages/sim/test/replay.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { applyAction, newGame, playGame, stableStringify } from '@brassline/engine';
import { summarize } from '../src/stats.js';

describe('self-play', () => {
  it('replays a logged game to a byte-identical final state', () => {
    const { state, log } = playGame(2, 42);
    let replay = newGame(2, 42);
    for (const a of log) replay = applyAction(replay, a, { assumeLegal: true });
    expect(stableStringify(replay)).toBe(stableStringify(state));
    expect(state.phase).toBe('game-over');
    expect(state.era).toBe('rail');
  });

  it('summarizes a game', () => {
    const { state, log } = playGame(3, 7);
    const s = summarize(state, log);
    expect(s.playerCount).toBe(3);
    expect(s.actions).toBe(log.length);
    expect(s.vp.length).toBe(3);
    expect(Object.values(s.actionMix).reduce((a, b) => a + b, 0)).toBe(log.length);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd /Users/Norton/MyProject/Brassline && pnpm install && pnpm -F @brassline/sim test`
Expected: FAIL，报 `Cannot find module '../src/stats.js'`。

- [ ] **Step 4: 写 stats.ts**

`packages/sim/src/stats.ts`：
```ts
import { incomeLevelAt, type Action, type GameState } from '@brassline/engine';

export interface GameSummary {
  playerCount: number;
  actions: number;
  vp: number[];
  income: number[];
  money: number[];
  winner: number[] | null;
  actionMix: Record<Action['type'], number>;
}

export function summarize(state: GameState, log: Action[]): GameSummary {
  const actionMix: Record<Action['type'], number> = {
    build: 0, network: 0, develop: 0, sell: 0, loan: 0, scout: 0, pass: 0,
  };
  for (const a of log) actionMix[a.type]++;
  return {
    playerCount: state.playerCount,
    actions: log.length,
    vp: state.players.map((p) => p.vp),
    income: state.players.map((p) => incomeLevelAt(p.incomeSpace)),
    money: state.players.map((p) => p.money),
    winner: state.winner,
    actionMix,
  };
}

export function aggregate(summaries: GameSummary[]): Record<string, number> {
  const n = summaries.length;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const out: Record<string, number> = {
    games: n,
    meanActions: mean(summaries.map((s) => s.actions)),
    meanWinnerVp: mean(summaries.map((s) => Math.max(...s.vp))),
    meanLoserVp: mean(summaries.map((s) => Math.min(...s.vp))),
    meanIncome: mean(summaries.flatMap((s) => s.income)),
  };
  for (const t of ['build', 'network', 'develop', 'sell', 'loan', 'scout', 'pass'] as const) {
    out[`mix.${t}`] = mean(summaries.map((s) => s.actionMix[t] / s.actions));
  }
  return out;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm -F @brassline/sim test`
Expected: `Tests  2 passed (2)`。

- [ ] **Step 6: 写 CLI**

`packages/sim/src/run.ts`：
```ts
/**
 * 自对弈 CLI：pnpm sim -- --games 200 --players 2,3,4 --seed 1
 * 每局：playGame → 重放校验 → 统计；任何异常立即打印种子并退出 1。
 */
import { applyAction, newGame, playGame, stableStringify } from '@brassline/engine';
import { aggregate, summarize, type GameSummary } from './stats.js';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
}

const games = Number(arg('games', '50'));
const counts = arg('players', '2,3,4').split(',').map(Number) as (2 | 3 | 4)[];
const seed0 = Number(arg('seed', '1'));

for (const pc of counts) {
  const summaries: GameSummary[] = [];
  const t0 = performance.now();
  for (let g = 0; g < games; g++) {
    const seed = seed0 + g;
    try {
      const { state, log } = playGame(pc, seed);
      let replay = newGame(pc, seed);
      for (const a of log) replay = applyAction(replay, a, { assumeLegal: true });
      if (stableStringify(replay) !== stableStringify(state)) {
        throw new Error(`replay mismatch (players ${pc}, seed ${seed})`);
      }
      summaries.push(summarize(state, log));
    } catch (e) {
      console.error(`FAILED players=${pc} seed=${seed}:`, e);
      process.exit(1);
    }
  }
  const ms = performance.now() - t0;
  console.log(`players=${pc} games=${games} ${(ms / games).toFixed(1)} ms/game`);
  console.table(aggregate(summaries));
}
```

- [ ] **Step 7: 跑 200 局**

Run: `cd /Users/Norton/MyProject/Brassline && pnpm sim -- --games 200`
Expected: 三个人数各打印一张表，无 `FAILED`。记下 `meanActions`（4 人约 8 轮 × 2 行动 × 4 人 ≈ 64 加运河首轮折扣，两时代约 120 左右）。把这三张表贴进 `docs/superpowers/specs/2026-11-04-brassline-demo-design.md` 末尾新开的"P0 结果"一节。

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(sim): headless self-play with replay verification and stats"
```

---

### Task 4: 贪心机器人

**Files:**
- Create: `packages/bots/package.json`, `packages/bots/tsconfig.json`, `packages/bots/src/index.ts`, `packages/bots/src/greedy.ts`
- Test: `packages/bots/test/greedy.test.ts`
- Modify: `packages/sim/package.json`（加回 bots 依赖）、`packages/sim/src/run.ts`（加 `--bot greedy`）

- [ ] **Step 1: 包配置**

`packages/bots/package.json`：
```json
{
  "name": "@brassline/bots",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "@brassline/engine": "workspace:*" },
  "devDependencies": { "typescript": "^5.9.0", "vitest": "^5.1.0" }
}
```

`packages/bots/tsconfig.json`：
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": [] },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 2: 失败测试**

`packages/bots/test/greedy.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { playGame, RandomAgent } from '@brassline/engine';
import { GreedyAgent, evaluate } from '../src/greedy.js';

describe('GreedyAgent', () => {
  it('is deterministic for a seed', () => {
    const a = playGame(2, 5, [new GreedyAgent(50), new GreedyAgent(51)]);
    const b = playGame(2, 5, [new GreedyAgent(50), new GreedyAgent(51)]);
    expect(a.log).toEqual(b.log);
  });

  it('beats random most of the time', () => {
    let wins = 0;
    const N = 30;
    for (let seed = 1; seed <= N; seed++) {
      const greedySeat = seed % 2;
      const agents = greedySeat === 0
        ? [new GreedyAgent(seed), new RandomAgent(seed + 1000)]
        : [new RandomAgent(seed + 1000), new GreedyAgent(seed)];
      const { state } = playGame(2, seed, agents);
      if (state.winner?.includes(greedySeat)) wins++;
    }
    expect(wins / N).toBeGreaterThanOrEqual(0.7);
  });

  it('evaluate counts vp, income, money and board presence', () => {
    const { state } = playGame(2, 3);
    const v = evaluate(state, 0);
    expect(Number.isFinite(v)).toBe(true);
  });
});
```

- [ ] **Step 3: 确认失败**

Run: `cd /Users/Norton/MyProject/Brassline && pnpm install && pnpm -F @brassline/bots test`
Expected: FAIL，`Cannot find module '../src/greedy.js'`。

- [ ] **Step 4: 实现**

`packages/bots/src/greedy.ts`：
```ts
/**
 * 贪心机器人：对每个合法行动做一步模拟，取评估值增量最大者；并列用种子随机打破。
 * 评估 = VP + 2×收入等级 + 0.25×现金 + 场上己方板块（翻面 3 分、未翻面 1.5 分）
 *        + 己方 Link 1 分 + 面板已清掉的板块 0.5 分（Develop 的长期价值）。
 */
import {
  applyAction,
  createRng,
  incomeLevelAt,
  TILES,
  type Action,
  type GameState,
  type PlayerAgent,
  type PlayerIndex,
  type Rng,
} from '@brassline/engine';

const TOTAL_TILES = TILES.reduce((n, t) => n + t.count, 0);

export function evaluate(state: GameState, player: PlayerIndex): number {
  const p = state.players[player]!;
  let v = p.vp + 2 * incomeLevelAt(p.incomeSpace) + 0.25 * p.money;
  for (const slots of Object.values(state.board.slots)) {
    for (const t of slots) {
      if (t && t.player === player) v += t.flipped ? 3 : 1.5;
    }
  }
  v += state.board.links.filter((l) => l.player === player).length;
  v += 0.5 * (TOTAL_TILES - p.tiles.length);
  return v;
}

export class GreedyAgent implements PlayerAgent {
  private readonly rng: Rng;
  constructor(seed: number) {
    this.rng = createRng(seed);
  }

  chooseAction(state: GameState, legal: Action[]): Action {
    const player = state.turnOrder[state.currentPlayerIdx]!;
    const base = evaluate(state, player);
    let best: Action[] = [];
    let bestGain = -Infinity;
    for (const a of legal) {
      const next = applyAction(state, a, { assumeLegal: true });
      const gain = evaluate(next, player) - base - (a.type === 'pass' ? 0.1 : 0);
      if (gain > bestGain + 1e-9) {
        bestGain = gain;
        best = [a];
      } else if (Math.abs(gain - bestGain) <= 1e-9) {
        best.push(a);
      }
    }
    return best[this.rng.nextInt(best.length)]!;
  }
}
```

`packages/bots/src/index.ts`：
```ts
export { GreedyAgent, evaluate } from './greedy.js';
```

- [ ] **Step 5: 确认通过**

Run: `pnpm -F @brassline/bots test`
Expected: `Tests  3 passed (3)`。胜率测试若低于 0.7，先把 N 提到 60 看是否稳定，仍不够就把评估里收入权重从 2 提到 3 再试；不要降阈值。

- [ ] **Step 6: 接进模拟器**

把 `"@brassline/bots": "workspace:*"` 加回 `packages/sim/package.json` 的 dependencies。在 `packages/sim/src/run.ts` 顶部加：
```ts
import { GreedyAgent } from '@brassline/bots';
import type { PlayerAgent } from '@brassline/engine';
```
在 `const seed0` 下面加：
```ts
const bot = arg('bot', 'random');
function agents(pc: number, seed: number): PlayerAgent[] | undefined {
  if (bot !== 'greedy') return undefined;
  return Array.from({ length: pc }, (_, i) => new GreedyAgent(seed * 10 + i));
}
```
把 `playGame(pc, seed)` 改为 `playGame(pc, seed, agents(pc, seed))`。

Run: `pnpm install && pnpm sim -- --games 50 --bot greedy`
Expected: 无 FAILED；`mix.sell` 明显高于随机机器人的值。

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(bots): greedy one-ply agent, wired into sim"
```

---

### Task 5: Web 包脚手架与游戏存储

**Files:**
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/index.html`, `packages/web/src/main.tsx`, `packages/web/src/App.tsx`, `packages/web/src/game/store.ts`
- Test: `packages/web/test/store.test.ts`

- [ ] **Step 1: 包配置**

`packages/web/package.json`：
```json
{
  "name": "@brassline/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@brassline/bots": "workspace:*",
    "@brassline/engine": "workspace:*",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "three": "^0.187.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@types/three": "^0.187.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.9.0",
    "vite": "^8.0.0",
    "vitest": "^5.1.0"
  }
}
```

`packages/web/tsconfig.json`：
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "noEmit": true,
    "declaration": false
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "test/**/*.ts"]
}
```

`packages/web/vite.config.ts`：
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  test: { include: ['test/**/*.test.ts'] },
});
```

`packages/web/index.html`：
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Brassline</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 失败的 store 测试**

`packages/web/test/store.test.ts`：
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { enumerateActions } from '@brassline/engine';
import { createGameStore, serializeSave, loadSave } from '../src/game/store';

describe('game store', () => {
  let store: ReturnType<typeof createGameStore>;
  beforeEach(() => {
    store = createGameStore();
    store.getState().newGame({ playerCount: 2, seed: 11, seats: ['human', 'human'] });
  });

  it('starts a game and applies a legal action', () => {
    const s = store.getState();
    const player = s.state!.turnOrder[s.state!.currentPlayerIdx]!;
    const legal = enumerateActions(s.state!, player);
    s.apply(legal[0]!);
    expect(store.getState().log.length).toBe(1);
  });

  it('round-trips a save through replay', () => {
    const s = store.getState();
    const player = s.state!.turnOrder[s.state!.currentPlayerIdx]!;
    s.apply(enumerateActions(s.state!, player)[0]!);
    const json = serializeSave(store.getState());
    const other = createGameStore();
    loadSave(other, json);
    expect(other.getState().log).toEqual(store.getState().log);
    expect(JSON.stringify(other.getState().state)).toBe(JSON.stringify(store.getState().state));
  });

  it('runs bot seats automatically', () => {
    store.getState().newGame({ playerCount: 2, seed: 3, seats: ['bot', 'bot'] });
    store.getState().runBotsUntilHumanOrEnd();
    expect(store.getState().state!.phase).toBe('game-over');
  });
});
```

- [ ] **Step 3: 确认失败**

Run: `cd /Users/Norton/MyProject/Brassline && pnpm install && pnpm -F @brassline/web test`
Expected: FAIL，找不到 `../src/game/store`。

- [ ] **Step 4: 实现 store**

`packages/web/src/game/store.ts`：
```ts
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  applyAction,
  enumerateActions,
  newGame as engineNewGame,
  type Action,
  type GameState,
  type PlayerIndex,
} from '@brassline/engine';
import { GreedyAgent } from '@brassline/bots';

export type Seat = 'human' | 'bot';

export interface Save {
  version: 1;
  playerCount: 2 | 3 | 4;
  seed: number;
  seats: Seat[];
  actions: Action[];
}

export interface GameStore {
  state: GameState | null;
  log: Action[];
  seed: number;
  seats: Seat[];
  newGame(opts: { playerCount: 2 | 3 | 4; seed: number; seats: Seat[] }): void;
  apply(action: Action): void;
  currentPlayer(): PlayerIndex | null;
  legal(): Action[];
  isBotTurn(): boolean;
  /** 连续执行机器人座位直到轮到人类或终局；每步同步执行。 */
  runBotsUntilHumanOrEnd(): void;
}

export function createGameStore(): StoreApi<GameStore> {
  const bots = new Map<PlayerIndex, GreedyAgent>();
  return createStore<GameStore>((set, get) => ({
    state: null,
    log: [],
    seed: 0,
    seats: [],
    newGame({ playerCount, seed, seats }) {
      bots.clear();
      seats.forEach((s, i) => {
        if (s === 'bot') bots.set(i, new GreedyAgent(seed * 10 + i));
      });
      set({ state: engineNewGame(playerCount, seed), log: [], seed, seats });
    },
    apply(action) {
      const { state, log } = get();
      if (!state) throw new Error('no game');
      set({ state: applyAction(state, action), log: [...log, action] });
    },
    currentPlayer() {
      const { state } = get();
      if (!state || state.phase === 'game-over') return null;
      return state.turnOrder[state.currentPlayerIdx]!;
    },
    legal() {
      const { state } = get();
      const p = get().currentPlayer();
      return state && p !== null ? enumerateActions(state, p) : [];
    },
    isBotTurn() {
      const p = get().currentPlayer();
      return p !== null && bots.has(p);
    },
    runBotsUntilHumanOrEnd() {
      let guard = 0;
      while (get().isBotTurn() && guard++ < 10_000) {
        const p = get().currentPlayer()!;
        const legal = get().legal();
        get().apply(bots.get(p)!.chooseAction(get().state!, legal));
      }
    },
  }));
}

export function serializeSave(s: GameStore): string {
  const save: Save = {
    version: 1,
    playerCount: s.state!.playerCount,
    seed: s.seed,
    seats: s.seats,
    actions: s.log,
  };
  return JSON.stringify(save);
}

export function loadSave(store: StoreApi<GameStore>, json: string): void {
  const save = JSON.parse(json) as Save;
  store.getState().newGame({ playerCount: save.playerCount, seed: save.seed, seats: save.seats });
  for (const a of save.actions) store.getState().apply(a);
}

export const SAVE_KEY = 'brassline.save.v1';

export function saveToLocalStorage(store: StoreApi<GameStore>): void {
  try {
    localStorage.setItem(SAVE_KEY, serializeSave(store.getState()));
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}

export function loadFromLocalStorage(store: StoreApi<GameStore>): boolean {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return false;
    loadSave(store, json);
    return true;
  } catch {
    return false;
  }
}

export const gameStore = createGameStore();
```

- [ ] **Step 5: 确认通过**

Run: `pnpm -F @brassline/web test`
Expected: `Tests  3 passed (3)`。

- [ ] **Step 6: 最小 App 能启动**

`packages/web/src/main.tsx`：
```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

`packages/web/src/App.tsx`（先只显示引擎状态，后续 Task 替换）：
```tsx
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
```

Run: `pnpm -F @brassline/web build`
Expected: 以 `✓ built in` 结尾，生成 `packages/web/dist/`。

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): vite+react scaffold, zustand game store with save/replay and bot seats"
```

---

### Task 6: 棋盘坐标表与 three.js 场景

**Files:**
- Create: `packages/web/src/board/layout.ts`, `packages/web/src/board/scene.ts`, `packages/web/src/board/BoardCanvas.tsx`
- Test: `packages/web/test/layout.test.ts`

- [ ] **Step 1: 失败测试**

`packages/web/test/layout.test.ts`：
```ts
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
```

Run: `pnpm -F @brassline/web test`
Expected: FAIL，找不到 `../src/board/layout`。

- [ ] **Step 2: 坐标表**

`packages/web/src/board/layout.ts`（x 向东，z 向南，单位约为"一座城的间距"）：
```ts
import { LINKS } from '@brassline/engine';

export interface Pos { x: number; z: number }

export const NODE_POS: Record<string, Pos> = {
  warrington: { x: 0, z: 0 },
  'stoke-on-trent': { x: 1.5, z: 1.2 },
  leek: { x: 3, z: 0.6 },
  belper: { x: 5.5, z: 0.8 },
  derby: { x: 6.5, z: 2 },
  nottingham: { x: 8.5, z: 1.5 },
  stone: { x: 1.8, z: 2.6 },
  uttoxeter: { x: 4, z: 2.6 },
  stafford: { x: 1.2, z: 4 },
  'burton-on-trent': { x: 5, z: 3.8 },
  shrewsbury: { x: -1, z: 5 },
  coalbrookdale: { x: 0.5, z: 6 },
  cannock: { x: 2.8, z: 5.2 },
  'farm-north': { x: 1.6, z: 5.9 },
  tamworth: { x: 5.2, z: 5.6 },
  wolverhampton: { x: 1.8, z: 6.8 },
  walsall: { x: 3.4, z: 6.6 },
  nuneaton: { x: 6.4, z: 6.8 },
  dudley: { x: 1.8, z: 8.2 },
  birmingham: { x: 4.2, z: 8.2 },
  coventry: { x: 6.4, z: 8.6 },
  kidderminster: { x: 0.8, z: 9.8 },
  'farm-south': { x: -0.4, z: 10.6 },
  worcester: { x: 1.4, z: 11.6 },
  redditch: { x: 3.6, z: 10.6 },
  gloucester: { x: 0.6, z: 13.2 },
  oxford: { x: 5.2, z: 12.6 },
};

export const MERCHANT_IDS = new Set(['warrington', 'nottingham', 'shrewsbury', 'gloucester', 'oxford']);

/** 场景缩放：坐标表单位 → three.js 世界单位。 */
export const SCALE = 3;

export function world(id: string): { x: number; z: number } {
  const p = NODE_POS[id];
  if (!p) throw new Error(`no layout position for ${id}`);
  return { x: p.x * SCALE, z: p.z * SCALE };
}

export function linkMidpoint(linkIndex: number): { x: number; z: number } {
  const l = LINKS[linkIndex]!;
  const a = world(l.a);
  const b = world(l.b);
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}
```

Run: `pnpm -F @brassline/web test`
Expected: 通过。

- [ ] **Step 3: 场景**

`packages/web/src/board/scene.ts`：
```ts
/**
 * three.js 棋盘：从 GameState 增量更新网格。对外只暴露 build / update / pick / dispose。
 * 可拾取对象的 userData：{ kind: 'location'|'merchant'|'slot'|'link', id, slotIndex?, linkIndex? }
 */
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { LINKS, LOCATIONS, MERCHANTS, type GameState, type IndustryType } from '@brassline/engine';
import { MERCHANT_IDS, SCALE, world } from './layout';

export type PickTarget =
  | { kind: 'location'; id: string }
  | { kind: 'merchant'; id: string }
  | { kind: 'slot'; id: string; slotIndex: number }
  | { kind: 'link'; linkIndex: number };

export const PLAYER_COLORS = [0xd9534f, 0x4a7fd6, 0xf0ad4e, 0x5cb85c];
const INDUSTRY_COLORS: Record<IndustryType, number> = {
  cotton: 0xf2e9d8, manufacturer: 0xc99a5b, pottery: 0x8bb8d6,
  coal: 0x333333, iron: 0xd17a3a, brewery: 0x7a5230,
};

export interface Highlights {
  slots: Set<string>;      // `${locationId}:${slotIndex}`
  links: Set<number>;
  merchants: Set<string>;
}

export class BoardScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labelRenderer = new CSS2DRenderer();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly slotMeshes = new Map<string, THREE.Mesh>();
  private readonly linkMeshes = new Map<number, THREE.Mesh>();
  private readonly tileGroup = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private frame = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
    this.labelRenderer.setSize(container.clientWidth, container.clientHeight);
    this.labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
    container.appendChild(this.labelRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 500);
    this.camera.position.set(4 * SCALE, 38, 7 * SCALE + 26);
    this.camera.lookAt(4 * SCALE, 0, 7 * SCALE);

    this.scene.background = new THREE.Color(0xe8e1d1);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x807060, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(20, 40, 10);
    this.scene.add(sun);
    this.scene.add(this.tileGroup);
    this.buildStatic();
    this.installCameraControls();
    this.loop();
  }

  private buildStatic(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(14 * SCALE, 18 * SCALE),
      new THREE.MeshLambertMaterial({ color: 0xb9c7a0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(4 * SCALE, -0.05, 6.5 * SCALE);
    this.scene.add(ground);

    for (const [id, loc] of Object.entries(LOCATIONS)) {
      const { x, z } = world(id);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.7, 0.3, 24),
        new THREE.MeshLambertMaterial({ color: 0xcfc3a8 }),
      );
      base.position.set(x, 0.15, z);
      base.userData = { kind: 'location', id } satisfies PickTarget;
      this.scene.add(base);
      this.pickables.push(base);
      this.addLabel(base, loc.name, 'loc-label');
      loc.slots.forEach((slot, i) => {
        const n = loc.slots.length;
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
        const r = n === 1 ? 0 : 0.8;
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.1, 0.7),
          new THREE.MeshLambertMaterial({ color: INDUSTRY_COLORS[slot.industries[0]!] }),
        );
        m.position.set(x + Math.cos(ang) * r, 0.35, z + Math.sin(ang) * r);
        m.userData = { kind: 'slot', id, slotIndex: i } satisfies PickTarget;
        this.scene.add(m);
        this.pickables.push(m);
        this.slotMeshes.set(`${id}:${i}`, m);
      });
    }
    for (const id of Object.keys(MERCHANTS)) {
      const { x, z } = world(id);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.4, 1.6),
        new THREE.MeshLambertMaterial({ color: 0x8c2f39 }),
      );
      m.position.set(x, 0.2, z);
      m.userData = { kind: 'merchant', id } satisfies PickTarget;
      this.scene.add(m);
      this.pickables.push(m);
      this.addLabel(m, id[0]!.toUpperCase() + id.slice(1), 'merchant-label');
    }
    LINKS.forEach((l, i) => {
      const a = world(l.a);
      const b = world(l.b);
      const len = Math.hypot(b.x - a.x, b.z - a.z) - 3;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.08, 0.35),
        new THREE.MeshLambertMaterial({ color: 0xa89f8c, transparent: true, opacity: 0.5 }),
      );
      m.position.set((a.x + b.x) / 2, 0.04, (a.z + b.z) / 2);
      m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      m.userData = { kind: 'link', linkIndex: i } satisfies PickTarget;
      this.scene.add(m);
      this.pickables.push(m);
      this.linkMeshes.set(i, m);
    });
  }

  private addLabel(parent: THREE.Object3D, text: string, cls: string): void {
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = text;
    const label = new CSS2DObject(div);
    label.position.set(0, 1.2, 1.9);
    parent.add(label);
  }

  /** 按状态重建动态物体：板块、资源、Link 颜色。每次行动后调用一次，开销可忽略。 */
  update(state: GameState, hl: Highlights): void {
    this.tileGroup.clear();
    for (const [id, slots] of Object.entries(state.board.slots)) {
      slots.forEach((t, i) => {
        const slotMesh = this.slotMeshes.get(`${id}:${i}`)!;
        const mat = slotMesh.material as THREE.MeshLambertMaterial;
        mat.emissive.setHex(hl.slots.has(`${id}:${i}`) ? 0x33aa33 : 0x000000);
        if (!t) return;
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.5, 0.7),
          new THREE.MeshLambertMaterial({ color: PLAYER_COLORS[t.player] }),
        );
        box.position.copy(slotMesh.position).add(new THREE.Vector3(0, 0.3, 0));
        this.tileGroup.add(box);
        const top = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.06, 0.6),
          new THREE.MeshLambertMaterial({ color: t.flipped ? 0x1b1b1b : INDUSTRY_COLORS[t.tile.industry] }),
        );
        top.position.copy(box.position).add(new THREE.Vector3(0, 0.28, 0));
        this.tileGroup.add(top);
        for (let r = 0; r < t.resources; r++) {
          const cube = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.18, 0.18),
            new THREE.MeshLambertMaterial({
              color: t.tile.industry === 'coal' ? 0x111111 : t.tile.industry === 'iron' ? 0xe08a3c : 0xc8a24a,
            }),
          );
          cube.position.copy(box.position).add(new THREE.Vector3(-0.25 + (r % 3) * 0.25, 0.42 + Math.floor(r / 3) * 0.2, 0.45));
          this.tileGroup.add(cube);
        }
      });
    }
    for (const [i, m] of this.linkMeshes) {
      const mat = m.material as THREE.MeshLambertMaterial;
      const built = state.board.links.find((l) => l.linkIndex === i);
      const def = LINKS[i]!;
      const available = state.era === 'canal' ? def.canal : def.rail;
      mat.color.setHex(built ? PLAYER_COLORS[built.player]! : available ? 0xa89f8c : 0xd8d2c4);
      mat.opacity = built ? 1 : available ? 0.5 : 0.2;
      mat.emissive.setHex(hl.links.has(i) ? 0x33aa33 : 0x000000);
    }
    for (const id of MERCHANT_IDS) {
      const m = this.pickables.find((o) => o.userData.kind === 'merchant' && o.userData.id === id) as THREE.Mesh;
      (m.material as THREE.MeshLambertMaterial).emissive.setHex(hl.merchants.has(id) ? 0x33aa33 : 0x000000);
    }
  }

  pick(clientX: number, clientY: number): PickTarget | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    return hit ? (hit.object.userData as PickTarget) : null;
  }

  private installCameraControls(): void {
    const el = this.renderer.domElement;
    let dragging = false;
    let last = { x: 0, y: 0 };
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || e.button === 1) { dragging = true; last = { x: e.clientX, y: e.clientY }; }
    });
    window.addEventListener('pointerup', () => (dragging = false));
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const k = this.camera.position.y / 600;
      this.camera.position.x -= (e.clientX - last.x) * k;
      this.camera.position.z -= (e.clientY - last.y) * k;
      last = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(e.deltaY * 0.001);
      this.camera.position.y = THREE.MathUtils.clamp(this.camera.position.y * f, 12, 80);
    }, { passive: false });
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.renderer.dispose();
    this.container.innerHTML = '';
  }
}
```

- [ ] **Step 4: React 挂载**

`packages/web/src/board/BoardCanvas.tsx`：
```tsx
import { useEffect, useRef } from 'react';
import type { GameState } from '@brassline/engine';
import { BoardScene, type Highlights, type PickTarget } from './scene';

interface Props {
  state: GameState;
  highlights: Highlights;
  onPick(target: PickTarget): void;
}

export function BoardCanvas({ state, highlights, onPick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const scene = new BoardScene(ref.current!);
    sceneRef.current = scene;
    const el = scene.renderer.domElement;
    const click = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const t = scene.pick(e.clientX, e.clientY);
      if (t) onPickRef.current(t);
    };
    el.addEventListener('click', click);
    const onResize = () => scene.resize();
    window.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('click', click);
      window.removeEventListener('resize', onResize);
      scene.dispose();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.update(state, highlights);
  }, [state, highlights]);

  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}
```

- [ ] **Step 5: 在 App 里临时接上看效果**

把 `packages/web/src/App.tsx` 的 `return <pre>…` 换成：
```tsx
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <BoardCanvas
        state={s.state}
        highlights={{ slots: new Set(), links: new Set(), merchants: new Set() }}
        onPick={(t) => console.log('pick', t)}
      />
    </div>
  );
```
并在文件顶部加 `import { BoardCanvas } from './board/BoardCanvas';`。加 `packages/web/src/style.css`：
```css
html, body, #root { margin: 0; height: 100%; font-family: system-ui, "PingFang SC", sans-serif; }
.loc-label { font-size: 12px; color: #2b2520; background: rgba(255,255,255,.75); padding: 1px 4px; border-radius: 3px; }
.merchant-label { font-size: 12px; color: #fff; background: #8c2f39; padding: 1px 4px; border-radius: 3px; }
```
在 `main.tsx` 顶部 `import './style.css';`。

Run: `pnpm -F @brassline/web dev`，浏览器打开 `http://localhost:5173`，点"开始"。
Expected: 看到 22 个圆台、5 个红色商人块、39 条线；右键拖动平移，滚轮缩放；点击地点时控制台打印 `pick {kind:'location', id}`。用 `pnpm -F @brassline/web build` 确认类型通过。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): three.js board scene with layout table, picking and camera controls"
```

---

### Task 7: 行动选择状态机（纯函数）

**Files:**
- Create: `packages/web/src/game/interactions.ts`
- Test: `packages/web/test/interactions.test.ts`

行动流程：选行动类型 → 选卡 → 在棋盘点目标（Build：槽位；Network：线，可选第二条；Sell：选若干自己的可售板块再选商人；Develop：选 1–2 个产业；Loan/Pass/Scout：直接确认）→ 确认。`candidates` 总是从 `enumerateActions` 过滤得到，所以界面永远只能发出引擎认可的行动。

- [ ] **Step 1: 失败测试**

`packages/web/test/interactions.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { enumerateActions, newGame } from '@brassline/engine';
import { highlightsFor, reduce, start, type Interaction } from '../src/game/interactions';

function setup() {
  const state = newGame(2, 9);
  const player = state.turnOrder[state.currentPlayerIdx]!;
  return { state, legal: enumerateActions(state, player), player };
}

describe('interactions', () => {
  it('starts idle and narrows candidates by action type', () => {
    const { legal } = setup();
    let ui: Interaction = start(legal);
    expect(ui.step).toBe('type');
    ui = reduce(ui, { kind: 'type', type: 'build' });
    expect(ui.step).toBe('card');
    expect(ui.candidates.every((a) => a.type === 'build')).toBe(true);
  });

  it('build: picking a card then a slot yields a single confirmable action', () => {
    const { legal } = setup();
    let ui = reduce(start(legal), { kind: 'type', type: 'build' });
    const card = ui.candidates[0]!.cardId;
    ui = reduce(ui, { kind: 'card', cardId: card });
    expect(ui.step).toBe('target');
    const hl = highlightsFor(ui);
    expect(hl.slots.size).toBeGreaterThan(0);
    const first = [...hl.slots][0]!;
    const [loc, idx] = first.split(':');
    ui = reduce(ui, { kind: 'pick', target: { kind: 'slot', id: loc!, slotIndex: Number(idx) } });
    expect(ui.step).toBe('confirm');
    expect(ui.chosen?.type).toBe('build');
  });

  it('loan goes straight to confirm after a card', () => {
    const { legal } = setup();
    let ui = reduce(start(legal), { kind: 'type', type: 'loan' });
    ui = reduce(ui, { kind: 'card', cardId: ui.candidates[0]!.cardId });
    expect(ui.step).toBe('confirm');
  });

  it('cancel returns to type selection', () => {
    const { legal } = setup();
    let ui = reduce(start(legal), { kind: 'type', type: 'network' });
    ui = reduce(ui, { kind: 'cancel' });
    expect(ui.step).toBe('type');
  });
});
```

Run: `pnpm -F @brassline/web test`
Expected: FAIL，找不到 `../src/game/interactions`。

- [ ] **Step 2: 实现**

`packages/web/src/game/interactions.ts`：
```ts
import type { Action } from '@brassline/engine';
import type { Highlights, PickTarget } from '../board/scene';

export type Step = 'type' | 'card' | 'target' | 'confirm';

export interface Interaction {
  legal: Action[];
  step: Step;
  type: Action['type'] | null;
  cardId: string | null;
  /** 当前筛选后仍可能的行动。 */
  candidates: Action[];
  /** Network 第一条已选的线、Sell 已选的板块等多步目标。 */
  picked: PickTarget[];
  chosen: Action | null;
}

export type UiEvent =
  | { kind: 'type'; type: Action['type'] }
  | { kind: 'card'; cardId: string }
  | { kind: 'pick'; target: PickTarget }
  | { kind: 'done' }      // 多目标行动（Network 双轨、Sell 多块）提前结束选择
  | { kind: 'cancel' };

export function start(legal: Action[]): Interaction {
  return { legal, step: 'type', type: null, cardId: null, candidates: legal, picked: [], chosen: null };
}

function cardOf(a: Action): string {
  return a.type === 'scout' ? a.cardIds[0] : a.cardId;
}

const NO_TARGET: ReadonlySet<Action['type']> = new Set(['loan', 'pass', 'scout']);

export function reduce(ui: Interaction, ev: UiEvent): Interaction {
  switch (ev.kind) {
    case 'cancel':
      return start(ui.legal);
    case 'type': {
      const candidates = ui.legal.filter((a) => a.type === ev.type);
      return { ...start(ui.legal), step: 'card', type: ev.type, candidates };
    }
    case 'card': {
      const candidates = ui.candidates.filter((a) => cardOf(a) === ev.cardId);
      if (candidates.length === 0) return ui;
      if (NO_TARGET.has(ui.type!) || candidates.length === 1 && ui.type === 'develop') {
        return { ...ui, cardId: ev.cardId, candidates, step: 'confirm', chosen: candidates[0]! };
      }
      return { ...ui, cardId: ev.cardId, candidates, step: 'target', picked: [] };
    }
    case 'pick': {
      const picked = [...ui.picked, ev.target];
      const candidates = ui.candidates.filter((a) => matches(a, picked));
      if (candidates.length === 0) return ui; // 点了不合法的位置，忽略
      const exact = candidates.find((a) => targetCount(a) === picked.length);
      if (candidates.length === 1 || (exact && candidates.length === 1)) {
        return { ...ui, picked, candidates, step: 'confirm', chosen: candidates[0]! };
      }
      return { ...ui, picked, candidates, chosen: exact ?? null };
    }
    case 'done': {
      const exact = ui.candidates.find((a) => targetCount(a) === ui.picked.length);
      return exact ? { ...ui, step: 'confirm', chosen: exact } : ui;
    }
  }
}

/** 行动的目标序列长度（用于判断"已经点够了"）。 */
function targetCount(a: Action): number {
  switch (a.type) {
    case 'build': return 1;
    case 'network': return a.links.length;
    case 'sell': return a.sales.length * 2;
    case 'develop': return a.removals.length;
    default: return 0;
  }
}

/** picked 的前缀是否与行动的目标序列一致。 */
function matches(a: Action, picked: PickTarget[]): boolean {
  const seq = targetsOf(a);
  if (picked.length > seq.length) return false;
  return picked.every((p, i) => sameTarget(p, seq[i]!));
}

function targetsOf(a: Action): PickTarget[] {
  switch (a.type) {
    case 'build':
      return [{ kind: 'slot', id: a.location, slotIndex: a.slotIndex ?? -1 }];
    case 'network':
      return a.links.map((linkIndex) => ({ kind: 'link', linkIndex }));
    case 'sell':
      return a.sales.flatMap((s) => [
        { kind: 'slot', id: s.location, slotIndex: s.slotIndex } as PickTarget,
        { kind: 'merchant', id: s.merchant } as PickTarget,
      ]);
    case 'develop':
      // Develop 用产业名做"目标"，界面上是按钮不是棋盘；借用 location 字段放产业名。
      return a.removals.map((ind) => ({ kind: 'location', id: `industry:${ind}` }));
    default:
      return [];
  }
}

function sameTarget(p: PickTarget, q: PickTarget): boolean {
  if (p.kind !== q.kind) return false;
  switch (p.kind) {
    case 'slot': {
      const qq = q as Extract<PickTarget, { kind: 'slot' }>;
      // 引擎 build 行动的 slotIndex 可省略（规范化槽位）；省略时只比地点。
      return p.id === qq.id && (qq.slotIndex === -1 || p.slotIndex === qq.slotIndex);
    }
    case 'link': return p.linkIndex === (q as Extract<PickTarget, { kind: 'link' }>).linkIndex;
    case 'location':
    case 'merchant': return p.id === (q as { id: string }).id;
  }
}

/** 当前这一步可以点的东西。 */
export function highlightsFor(ui: Interaction): Highlights {
  const hl: Highlights = { slots: new Set(), links: new Set(), merchants: new Set() };
  if (ui.step !== 'target') return hl;
  const depth = ui.picked.length;
  for (const a of ui.candidates) {
    const t = targetsOf(a)[depth];
    if (!t) continue;
    if (t.kind === 'slot') {
      if (t.slotIndex === -1) {
        // 省略槽位的 build：高亮该地点所有槽（引擎会规范化到合法槽）
        for (let i = 0; i < 4; i++) hl.slots.add(`${t.id}:${i}`);
      } else hl.slots.add(`${t.id}:${t.slotIndex}`);
    } else if (t.kind === 'link') hl.links.add(t.linkIndex);
    else if (t.kind === 'merchant') hl.merchants.add(t.id);
  }
  return hl;
}
```

- [ ] **Step 3: 确认通过**

Run: `pnpm -F @brassline/web test`
Expected: `interactions.test.ts` 4 个用例通过。若 build 用例失败，打印 `ui.candidates[0]` 看引擎是否带 `slotIndex`；引擎 `enumerateBuilds` 对"有多个合法双图标空槽"的地点会产出带 `slotIndex` 的多个行动，其余省略，上面的 `-1` 约定就是为此。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(web): pure interaction state machine driven by enumerateActions"
```

---

### Task 8: HUD 与完整回合流程

**Files:**
- Create: `packages/web/src/hud/TopBar.tsx`, `Markets.tsx`, `PlayerPanel.tsx`, `Hand.tsx`, `ActionBar.tsx`, `Log.tsx`, `Overlay.tsx`
- Modify: `packages/web/src/App.tsx`, `packages/web/src/style.css`

- [ ] **Step 1: 顶栏、市场、玩家面板**

`packages/web/src/hud/TopBar.tsx`：
```tsx
import type { GameState } from '@brassline/engine';
import { PLAYER_COLORS } from '../board/scene';

export function TopBar({ state }: { state: GameState }) {
  const cur = state.turnOrder[state.currentPlayerIdx]!;
  return (
    <div className="topbar">
      <span>{state.era === 'canal' ? '运河时代' : '铁路时代'} · 第 {state.round} 轮</span>
      <span>顺位：{state.turnOrder.map((p) => (
        <b key={p} style={{ color: `#${PLAYER_COLORS[p]!.toString(16).padStart(6, '0')}` }}>P{p + 1} </b>
      ))}</span>
      <span>当前：P{cur + 1}（本回合第 {state.actionsThisTurn + 1} 个行动）</span>
    </div>
  );
}
```

`packages/web/src/hud/Markets.tsx`：
```tsx
import { COAL_MARKET_PRICES, IRON_MARKET_PRICES, type GameState } from '@brassline/engine';

function Market({ name, prices, filled }: { name: string; prices: readonly number[]; filled: number }) {
  return (
    <div className="market">
      <b>{name}</b>
      <div className="market-row">
        {prices.map((p, i) => (
          <span key={i} className={i < filled ? 'cube on' : 'cube'} title={`£${p}`}>{p}</span>
        ))}
      </div>
      <small>下一块买价 £{filled > 0 ? prices[prices.length - filled] : name === '煤' ? 8 : 6}</small>
    </div>
  );
}

export function Markets({ state }: { state: GameState }) {
  return (
    <div className="markets">
      <Market name="煤" prices={COAL_MARKET_PRICES} filled={state.coalMarket} />
      <Market name="铁" prices={IRON_MARKET_PRICES} filled={state.ironMarket} />
    </div>
  );
}
```

（`coalMarket` 是"已填充块数"，价格数组按升序，市场从最便宜卖起，所以已填的是数组末尾 `filled` 个。若 Task 2 的引擎 `market.ts` 里的 helper 语义相反，以引擎 `buyCoalCost(state, 1)` 为准改这里的显示。）

`packages/web/src/hud/PlayerPanel.tsx`：
```tsx
import { incomeLevelAt, type GameState, type IndustryType } from '@brassline/engine';
import { PLAYER_COLORS } from '../board/scene';

const IND: IndustryType[] = ['cotton', 'manufacturer', 'pottery', 'coal', 'iron', 'brewery'];
const IND_NAME: Record<IndustryType, string> = {
  cotton: '棉', manufacturer: '制造', pottery: '陶', coal: '煤', iron: '铁', brewery: '酿',
};

export function PlayerPanel({ state }: { state: GameState }) {
  return (
    <div className="players">
      {state.players.map((p, i) => (
        <div key={i} className="player" style={{ borderColor: `#${PLAYER_COLORS[i]!.toString(16).padStart(6, '0')}` }}>
          <b>P{i + 1}</b> £{p.money} · 收入 {incomeLevelAt(p.incomeSpace)} · VP {p.vp} · 手牌 {p.hand.length}
          <div className="stacks">
            {IND.map((ind) => {
              const next = p.tiles.find((t) => t.industry === ind);
              return <span key={ind}>{IND_NAME[ind]}{next ? next.level : '—'}</span>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 手牌与行动栏**

`packages/web/src/hud/Hand.tsx`：
```tsx
import { LOCATIONS, type Card } from '@brassline/engine';

export function cardLabel(c: Card): string {
  switch (c.kind) {
    case 'location': return LOCATIONS[c.location]!.name;
    case 'industry': return '产业：' + c.industries.join('/');
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
```

`packages/web/src/hud/ActionBar.tsx`：
```tsx
import type { Action } from '@brassline/engine';
import type { Interaction } from '../game/interactions';

const TYPES: { t: Action['type']; label: string }[] = [
  { t: 'build', label: '建造' }, { t: 'network', label: '铺路' }, { t: 'develop', label: '研发' },
  { t: 'sell', label: '卖货' }, { t: 'loan', label: '贷款' }, { t: 'scout', label: '侦察' }, { t: 'pass', label: '跳过' },
];

export function ActionBar({ ui, onType, onDevelop, onDone, onConfirm, onCancel }: {
  ui: Interaction;
  onType(t: Action['type']): void;
  onDevelop(ind: string): void;
  onDone(): void;
  onConfirm(): void;
  onCancel(): void;
}) {
  const available = new Set(ui.legal.map((a) => a.type));
  return (
    <div className="actionbar">
      {ui.step === 'type' && TYPES.map(({ t, label }) => (
        <button key={t} disabled={!available.has(t)} onClick={() => onType(t)}>{label}</button>
      ))}
      {ui.step === 'card' && <span>选一张要弃的卡{ui.type === 'scout' ? '（再选两张）' : ''}</span>}
      {ui.step === 'target' && ui.type === 'develop' && (
        <span>
          移除：{['cotton', 'manufacturer', 'pottery', 'coal', 'iron', 'brewery'].map((ind) => (
            <button key={ind} onClick={() => onDevelop(ind)}>{ind}</button>
          ))}
        </span>
      )}
      {ui.step === 'target' && ui.type !== 'develop' && <span>在棋盘上点绿色高亮的目标</span>}
      {ui.step === 'target' && ui.picked.length > 0 && <button onClick={onDone}>就这些</button>}
      {ui.step === 'confirm' && <button className="primary" onClick={onConfirm}>确认 {ui.type}</button>}
      {ui.step !== 'type' && <button onClick={onCancel}>取消</button>}
    </div>
  );
}
```

- [ ] **Step 3: 日志与遮罩**

`packages/web/src/hud/Log.tsx`：
```tsx
import { LOCATIONS, type Action } from '@brassline/engine';

export function describe(a: Action): string {
  switch (a.type) {
    case 'build': return `建造 ${a.industry} @ ${LOCATIONS[a.location]!.name}`;
    case 'network': return `铺路 #${a.links.join(', #')}`;
    case 'develop': return `研发 ${a.removals.join('+')}`;
    case 'sell': return `卖货 ${a.sales.map((s) => `${LOCATIONS[s.location]!.name}→${s.merchant}`).join('，')}`;
    case 'loan': return '贷款 £30';
    case 'scout': return '侦察';
    case 'pass': return '跳过';
  }
}

export function Log({ log }: { log: Action[] }) {
  return (
    <div className="log">
      {log.slice(-12).map((a, i) => <div key={log.length - 12 + i}>{describe(a)}</div>)}
    </div>
  );
}
```

`packages/web/src/hud/Overlay.tsx`：
```tsx
export function Overlay({ title, body, button, onClick }: {
  title: string; body: string; button: string; onClick(): void;
}) {
  return (
    <div className="overlay">
      <div className="dialog">
        <h2>{title}</h2>
        <p style={{ whiteSpace: 'pre-line' }}>{body}</p>
        <button className="primary" onClick={onClick}>{button}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 组装 App**

把 `packages/web/src/App.tsx` 整个替换为：
```tsx
import { useEffect, useMemo, useState } from 'react';
import type { Action } from '@brassline/engine';
import { BoardCanvas } from './board/BoardCanvas';
import type { PickTarget } from './board/scene';
import { gameStore, loadFromLocalStorage, saveToLocalStorage, type Seat } from './game/store';
import { highlightsFor, reduce, start, type Interaction } from './game/interactions';
import { TopBar } from './hud/TopBar';
import { Markets } from './hud/Markets';
import { PlayerPanel } from './hud/PlayerPanel';
import { Hand } from './hud/Hand';
import { ActionBar } from './hud/ActionBar';
import { Log } from './hud/Log';
import { Overlay } from './hud/Overlay';

function useStore() {
  const [, force] = useState(0);
  useEffect(() => gameStore.subscribe(() => force((n) => n + 1)), []);
  return gameStore.getState();
}

export function App() {
  const s = useStore();
  const [ui, setUi] = useState<Interaction | null>(null);
  const [handRevealed, setHandRevealed] = useState(false);
  const [lastEra, setLastEra] = useState<'canal' | 'rail'>('canal');
  const [eraNotice, setEraNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!s.state && loadFromLocalStorage(gameStore)) return;
  }, []);

  // 每次状态变化：机器人走棋，重置选择，存档，检测时代切换
  useEffect(() => {
    if (!s.state) return;
    gameStore.getState().runBotsUntilHumanOrEnd();
    const st = gameStore.getState();
    setUi(st.state!.phase === 'game-over' ? null : start(st.legal()));
    setHandRevealed(false);
    saveToLocalStorage(gameStore);
    if (st.state!.era !== lastEra) {
      setLastEra(st.state!.era);
      setEraNotice('运河时代结束：已计分，所有 1 级板块和运河被移除，重新发牌。');
    }
  }, [s.state]);

  const highlights = useMemo(
    () => (ui ? highlightsFor(ui) : { slots: new Set<string>(), links: new Set<number>(), merchants: new Set<string>() }),
    [ui],
  );

  if (!s.state) {
    const startGame = (playerCount: 2 | 3 | 4, seats: Seat[]) =>
      s.newGame({ playerCount, seed: Date.now() % 1_000_000, seats });
    return (
      <div className="lobby">
        <h1>Brassline</h1>
        <button onClick={() => startGame(2, ['human', 'bot'])}>2 人：我 vs 机器人</button>
        <button onClick={() => startGame(2, ['human', 'human'])}>2 人热座</button>
        <button onClick={() => startGame(3, ['human', 'bot', 'bot'])}>3 人：我 vs 两个机器人</button>
        <button onClick={() => startGame(4, ['human', 'human', 'human', 'human'])}>4 人热座</button>
      </div>
    );
  }

  const state = s.state;
  const cur = s.currentPlayer();
  const me = cur !== null ? state.players[cur]! : null;
  const usable = new Set(ui?.step === 'card' ? ui.candidates.map((a) => (a.type === 'scout' ? a.cardIds[0] : a.cardId)) : []);

  const onPick = (t: PickTarget) => ui && setUi(reduce(ui, { kind: 'pick', target: t }));
  const confirm = () => {
    if (!ui?.chosen) return;
    const a: Action = ui.chosen;
    s.apply(a);
  };

  return (
    <div className="app">
      <BoardCanvas state={state} highlights={highlights} onPick={onPick} />
      <TopBar state={state} />
      <Markets state={state} />
      <PlayerPanel state={state} />
      <Log log={s.log} />
      {ui && me && (
        <div className="bottom">
          {!handRevealed && s.seats[cur!] === 'human' && s.seats.filter((x) => x === 'human').length > 1 ? (
            <button className="primary" onClick={() => setHandRevealed(true)}>P{cur! + 1} 请接手，点我亮牌</button>
          ) : (
            <>
              <ActionBar
                ui={ui}
                onType={(t) => setUi(reduce(ui, { kind: 'type', type: t }))}
                onDevelop={(ind) => setUi(reduce(ui, { kind: 'pick', target: { kind: 'location', id: `industry:${ind}` } }))}
                onDone={() => setUi(reduce(ui, { kind: 'done' }))}
                onConfirm={confirm}
                onCancel={() => setUi(reduce(ui, { kind: 'cancel' }))}
              />
              <Hand cards={me.hand} usable={usable} hidden={false} onPick={(id) => setUi(reduce(ui, { kind: 'card', cardId: id }))} />
            </>
          )}
        </div>
      )}
      {eraNotice && <Overlay title="时代切换" body={eraNotice} button="继续" onClick={() => setEraNotice(null)} />}
      {state.phase === 'game-over' && (
        <Overlay
          title="终局"
          body={state.players.map((p, i) => `P${i + 1}: ${p.vp} VP`).join('\n') + `\n胜者：${state.winner?.map((w) => `P${w + 1}`).join('、')}`}
          button="再来一局"
          onClick={() => { localStorage.removeItem('brassline.save.v1'); location.reload(); }}
        />
      )}
    </div>
  );
}
```

Scout 的三张卡：引擎的 scout 行动是 `cardIds: [a,b,c]`，上面的 `card` 事件只匹配第一张；`reduce` 在 `type === 'scout'` 时把同一首张卡的候选收窄后直接进 confirm 并取第一个候选（额外两张由引擎枚举决定）。这在 P1 可接受，日志里会写明弃了哪三张。

- [ ] **Step 5: 样式**

在 `packages/web/src/style.css` 追加：
```css
.app { position: fixed; inset: 0; overflow: hidden; }
.topbar { position: absolute; top: 0; left: 0; right: 0; display: flex; gap: 24px; padding: 6px 12px; background: rgba(43,37,32,.85); color: #fff; font-size: 14px; }
.markets { position: absolute; top: 40px; left: 8px; background: rgba(255,255,255,.9); padding: 8px; border-radius: 6px; font-size: 13px; }
.market-row { display: flex; gap: 2px; }
.cube { width: 18px; height: 18px; display: inline-grid; place-items: center; border: 1px solid #999; font-size: 10px; background: #eee; }
.cube.on { background: #333; color: #fff; }
.players { position: absolute; top: 40px; right: 8px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.player { background: rgba(255,255,255,.92); border-left: 6px solid; padding: 6px 8px; border-radius: 4px; min-width: 240px; }
.stacks span { margin-right: 8px; }
.log { position: absolute; right: 8px; bottom: 120px; width: 260px; max-height: 200px; overflow: auto; background: rgba(255,255,255,.85); font-size: 12px; padding: 6px; border-radius: 4px; }
.bottom { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(43,37,32,.9); padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; }
.actionbar { display: flex; gap: 8px; align-items: center; color: #fff; }
.hand { display: flex; gap: 6px; flex-wrap: wrap; }
.card { padding: 10px 12px; min-width: 96px; border: 1px solid #777; background: #f5efe0; border-radius: 4px; }
.card.ok { border-color: #2a2; box-shadow: 0 0 0 2px #2a2 inset; }
button { font-size: 14px; padding: 8px 12px; cursor: pointer; }
button.primary { background: #c8102e; color: #fff; border: none; }
.overlay { position: absolute; inset: 0; background: rgba(0,0,0,.5); display: grid; place-items: center; }
.dialog { background: #fff; padding: 24px; border-radius: 8px; min-width: 320px; }
.lobby { display: grid; place-items: center; gap: 12px; height: 100%; }
```

- [ ] **Step 6: 手动验收**

Run: `pnpm -F @brassline/web dev`，选"2 人：我 vs 机器人"。
Expected，逐项勾选：
- 能完成一次建造：建造 → 高亮的卡 → 棋盘绿色槽位 → 确认；板块出现，钱减少。
- 铺路：选线后出现"就这些"，点它或直接进确认。
- 机器人回合自动完成，日志出现它的行动。
- 刷新页面后局面恢复（localStorage）。
- 运河时代结束弹出提示，棋盘上 1 级板块和运河消失。
- 打到终局弹出分数。
任何一步不通，先看控制台是否有 `IllegalActionError`：那说明界面发出了引擎没枚举过的行动，问题在 `interactions.ts` 的匹配逻辑，不要绕过引擎校验。

- [ ] **Step 7: 类型与测试**

Run: `pnpm -F @brassline/web build && pnpm -F @brassline/web test`
Expected: 构建成功，测试全部通过。

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(web): HUD, hotseat, bot turns, era and game-over overlays"
```

---

### Task 9: 静态部署与 README

**Files:**
- Create: `README.md`, `.github/workflows/pages.yml`

- [ ] **Step 1: README**

`README.md`：
```markdown
# Brassline

用 Brass: Birmingham 的规则做的 Web 版 demo（内部试玩，非商用，不含官方素材）。
设计：`docs/superpowers/specs/2026-11-04-brassline-demo-design.md`。

## 运行

pnpm install
pnpm sim -- --games 50 --bot greedy    # 无界面自对弈
pnpm dev                                # 浏览器 http://localhost:5173
pnpm test && pnpm typecheck

## 部署

pnpm build 产出 packages/web/dist，任何静态托管都能放。GitHub Pages 由 .github/workflows/pages.yml 自动发布。
```

- [ ] **Step 2: GitHub Pages 工作流**

`.github/workflows/pages.yml`：
```yaml
name: pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm build
      - uses: actions/upload-pages-artifact@v3
        with: { path: packages/web/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: 本地验证构建产物可直接打开**

Run: `pnpm build && pnpm -F @brassline/web preview`
Expected: preview 地址打开后能开局。`vite.config.ts` 里 `base: './'` 保证放在任何子路径都能加载。

- [ ] **Step 4: Commit 并（在用户确认后）建远程仓库推送**

```bash
git add -A && git commit -m "docs: README and GitHub Pages workflow"
```
推送到 GitHub 和开启 Pages 需要用户决定仓库名与可见性，执行到这里停下来问。

---

## 自检

- 规格 §1 P0 完成标志 → Task 3 Step 7（200 局 × 3 人数，重放校验）。
- 规格 §1 P1 完成标志 → Task 8 Step 6 的手动验收清单。
- 规格 §2 的引擎引入、MIT 声明 → Task 2。机器人 → Task 4。存档即行动日志 → Task 5。three.js 只画棋盘、DOM 画界面 → Task 6–8。静态部署 → Task 9。
- 规格 §3 的规则本身由引擎及其 390 个测试承担；§3.7 验收清单中每一条在引擎 `test/audit-*.test.ts` 已有对应用例，Task 2 Step 4 跑通即视为通过。
- 类型一致性：`PickTarget`、`Highlights` 在 `scene.ts` 定义，`interactions.ts` 与 `App.tsx` 引用同一处；`Seat`、`GameStore` 在 `store.ts` 定义；`GreedyAgent` 来自 `@brassline/bots`，`PlayerAgent`、`playGame`、`RandomAgent` 来自引擎。
- 未覆盖、留到 P2：联机服务器、掉线重连；留到 P3：实时内层。
