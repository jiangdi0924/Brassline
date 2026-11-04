# Brassline

用 Brass: Birmingham 的规则做的 Web 版 demo（内部试玩，非商用，不含官方素材）。
设计：`docs/superpowers/specs/2026-11-04-brassline-demo-design.md`。

规则引擎在 `packages/engine`（MIT，见该目录下的许可证声明），机器人在 `packages/bots`，无界面模拟器在 `packages/sim`，浏览器客户端（three.js 棋盘 + React HUD）在 `packages/web`。

## 运行

```bash
pnpm install
pnpm sim -- --games 50 --bot greedy    # 无界面自对弈
pnpm dev                                # 浏览器 http://localhost:5173
pnpm test && pnpm typecheck
```

大厅可选：人 vs 机器人、2/4 人热座（换人时先点"请接手，点我亮牌"）、两机器人对战观战。
大厅"单人：对抗区域需求"是 solo 变体：每时代 8 轮，轮末区域（NPC）从连通商人的煤矿/酒厂和任意铁厂拿走资源，卖货翻面得许可证（任意地点建造），终局按 VP 评铜/银/金（见 `docs/superpowers/specs/2026-11-05-solo-variant.md`）。
局面每步自动存到 localStorage（v2 存档直接存局面和厂区，刷新可恢复；旧 v1 行动日志存档仍按重放读取）；顶栏"回大厅"会清掉存档。
大厅的"厂区内层"勾选（默认开）启用 P3 内层：煤矿/铁厂/酿酒厂建好后不放满，由 10×7 厂区产线每个外层行动推进 20 s 逐步交付（棋盘上的 `1/3` = 库存/矿量）；点自己的资源板块打开厂区面板，花钱加钻机/传送带等（见 `docs/superpowers/specs/2026-11-04-p3-inner-factory.md`）。

## 部署

`pnpm build` 产出 `packages/web/dist`（`base: './'`，放任何子路径都能加载），任何静态托管都能放。
GitHub Pages 由 `.github/workflows/pages.yml` 在推送 `main` 时自动发布（仓库 Settings → Pages 的 Source 选 GitHub Actions）。
