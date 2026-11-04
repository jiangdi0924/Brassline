/** 厂区 2D 绘制：10×7 网格，每格 48px。纯绘制，不持有状态。 */
import {
  BREWHOUSE_SECONDS,
  DRILL_SECONDS,
  FARM_SECONDS,
  FURNACE_SECONDS,
  PUMP_SECONDS,
  type Building,
  type BuildingKind,
  type Dir,
  type ItemKind,
  type Plot,
} from '@brassline/factory';

export const CELL = 48;

const SOURCE_COLOR: Record<ItemKind, string> = {
  coal: '#3b3b3b', ore: '#5a3d32', water: '#4f8fd6', grain: '#e3c14f', iron: '#888', beer: '#a0662b',
};
export const ITEM_COLOR: Record<ItemKind, string> = {
  coal: '#111', ore: '#9a5b3c', iron: '#d8d8e0', water: '#6fb6ff', grain: '#f4d35e', beer: '#c47a2c',
};
const BUILDING_COLOR: Record<BuildingKind, string> = {
  drill: '#c0763a', pump: '#2f6db5', farm: '#7aa83a', belt: '#9b958a', furnace: '#b8432f', brewhouse: '#7a5230',
};
export const BUILDING_NAME: Record<BuildingKind, string> = {
  drill: '钻机', pump: '水泵', farm: '农场', belt: '传送带', furnace: '熔炉', brewhouse: '酿造屋',
};
const BUILDING_GLYPH: Record<BuildingKind, string> = {
  drill: '钻', pump: '泵', farm: '农', belt: '', furnace: '熔', brewhouse: '酿',
};
const PERIOD: Partial<Record<BuildingKind, number>> = {
  drill: DRILL_SECONDS, pump: PUMP_SECONDS, farm: FARM_SECONDS, furnace: FURNACE_SECONDS, brewhouse: BREWHOUSE_SECONDS,
};

function arrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: Dir, size: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.5, -size * 0.7);
  ctx.lineTo(-size * 0.5, size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBuilding(ctx: CanvasRenderingContext2D, b: Building): void {
  const x0 = b.x * CELL;
  const y0 = b.y * CELL;
  const cx = x0 + CELL / 2;
  const cy = y0 + CELL / 2;
  if (b.kind === 'belt') {
    ctx.fillStyle = BUILDING_COLOR.belt;
    ctx.fillRect(x0 + 4, y0 + 4, CELL - 8, CELL - 8);
    arrow(ctx, cx, cy, b.dir, 12, 'rgba(255,255,255,.55)');
  } else {
    ctx.fillStyle = BUILDING_COLOR[b.kind];
    ctx.fillRect(x0 + 3, y0 + 3, CELL - 6, CELL - 6);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px system-ui, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(BUILDING_GLYPH[b.kind], cx - 4, cy - 2);
    // 朝向箭头贴在出口一侧
    const ox = [1, 0, -1, 0][b.dir]! * (CELL / 2 - 8);
    const oy = [0, 1, 0, -1][b.dir]! * (CELL / 2 - 8);
    arrow(ctx, cx + ox, cy + oy, b.dir, 6, '#fff');
    // 机器缓冲：小点
    let k = 0;
    for (const [item, n] of Object.entries(b.buf) as [ItemKind, number][]) {
      for (let i = 0; i < n; i++, k++) {
        ctx.fillStyle = ITEM_COLOR[item];
        ctx.beginPath();
        ctx.arc(x0 + 9 + k * 7, y0 + 10, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const period = PERIOD[b.kind];
    if (period) {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(x0 + 6, y0 + CELL - 11, CELL - 12, 5);
      ctx.fillStyle = '#7fe07f';
      ctx.fillRect(x0 + 6, y0 + CELL - 11, (CELL - 12) * Math.min(1, b.progress / period), 5);
    }
  }
  if (b.item) {
    // 带上物品按停留进度沿朝向前移，看得出在流动
    const t = b.kind === 'belt' ? Math.min(1, b.progress / 2) - 0.5 : 0.25;
    const px = cx + [1, 0, -1, 0][b.dir]! * t * CELL * 0.6;
    const py = cy + [0, 1, 0, -1][b.dir]! * t * CELL * 0.6;
    ctx.fillStyle = ITEM_COLOR[b.item];
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export function drawPlot(ctx: CanvasRenderingContext2D, plot: Plot, hover: { x: number; y: number } | null): void {
  const W = plot.w * CELL;
  const H = plot.h * CELL;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#d9cfb6';
  ctx.fillRect(0, 0, W, H);
  for (const s of plot.sources) {
    ctx.fillStyle = SOURCE_COLOR[s.item];
    ctx.fillRect(s.x * CELL, s.y * CELL, CELL, CELL);
  }
  // 出货口
  const dx = plot.dock.x * CELL;
  const dy = plot.dock.y * CELL;
  ctx.fillStyle = '#2e7d4f';
  ctx.fillRect(dx, dy, CELL, CELL);
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('出货', dx + CELL / 2, dy + CELL / 2);
  ctx.strokeStyle = 'rgba(0,0,0,.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= plot.w; x++) {
    ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, H); ctx.stroke();
  }
  for (let y = 0; y <= plot.h; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(W, y * CELL + 0.5); ctx.stroke();
  }
  for (const b of plot.buildings) drawBuilding(ctx, b);
  if (hover) {
    ctx.strokeStyle = '#c8102e';
    ctx.lineWidth = 2;
    ctx.strokeRect(hover.x * CELL + 1, hover.y * CELL + 1, CELL - 2, CELL - 2);
  }
}
