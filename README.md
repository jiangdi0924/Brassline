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
局面每步自动存到 localStorage（存档即行动日志，刷新可恢复）；顶栏"回大厅"会清掉存档。

## 部署

`pnpm build` 产出 `packages/web/dist`（`base: './'`，放任何子路径都能加载），任何静态托管都能放。
GitHub Pages 由 `.github/workflows/pages.yml` 在推送 `main` 时自动发布（仓库 Settings → Pages 的 Source 选 GitHub Actions）。
