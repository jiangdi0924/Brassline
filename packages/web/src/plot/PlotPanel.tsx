import { useEffect, useRef, useState } from 'react';
import { COSTS, step, throughputPerMinute, type BuildingKind, type Dir, type Plot, type PlotKind } from '@brassline/factory';
import { plotTitle, type GameStore } from '../game/store';
import { BUILDING_NAME, CELL, drawPlot } from './plotCanvas';

type Tool = BuildingKind | 'remove' | 'turn';

const TOOLS: Record<PlotKind, BuildingKind[]> = {
  coal: ['drill', 'belt'],
  iron: ['drill', 'belt', 'furnace'],
  brewery: ['pump', 'farm', 'belt', 'brewhouse'],
};
const DIR_NAME = ['东 →', '南 ↓', '西 ←', '北 ↑'];
/** 外层 20 s 推进在面板里分 10 个子步、约 1 秒播放。 */
const ANIM_STEPS = 10;
const ANIM_INTERVAL_MS = 100;

interface Props {
  s: GameStore;
  plotKey: string;
  onClose(): void;
}

export function PlotPanel({ s, plotKey, onClose }: Props) {
  const plot = s.plots[plotKey];
  const [loc, idxStr] = plotKey.split(':');
  const tile = s.state?.board.slots[loc!]?.[Number(idxStr)] ?? null;
  const [tool, setTool] = useState<Tool>(plot ? TOOLS[plot.kind][0]! : 'belt');
  const [dir, setDir] = useState<Dir>(0);
  const [msg, setMsg] = useState('');
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anim = useRef<Plot | null>(null);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const latest = useRef<Plot | undefined>(plot);
  latest.current = plot;

  const draw = (p: Plot) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawPlot(ctx, p, hoverRef.current);
  };

  // 外层行动后（plotVersion 变化）：从推进前的厂区以 10 × 2 s 重放，最后落在权威状态上。
  const lastVersion = useRef(s.plotVersion);
  useEffect(() => {
    if (lastVersion.current === s.plotVersion) return;
    lastVersion.current = s.plotVersion;
    const from = s.plotsBefore[plotKey];
    if (!from) return;
    let cur = from;
    let n = 0;
    anim.current = cur;
    draw(cur);
    const timer = setInterval(() => {
      n++;
      if (n >= ANIM_STEPS) {
        clearInterval(timer);
        anim.current = null;
        const auth = latest.current;
        if (auth) draw(auth);
        return;
      }
      cur = step(cur, 20 / ANIM_STEPS).plot;
      anim.current = cur;
      draw(cur);
    }, ANIM_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      anim.current = null;
    };
  }, [s.plotVersion, plotKey]);

  useEffect(() => {
    const p = anim.current ?? plot;
    if (p) draw(p);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setDir((d) => (((d + 1) % 4) as Dir));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!plot || !tile) {
    return (
      <div className="plot-panel">
        <div className="plot-head"><b>厂区已关闭</b><button onClick={onClose}>关闭</button></div>
        <div>板块已翻面、被覆盖或在时代末被移除。</div>
      </div>
    );
  }

  const cellOf = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * plot.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * plot.h);
    return x >= 0 && y >= 0 && x < plot.w && y < plot.h ? { x, y } : null;
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = cellOf(e);
    if (!c) return;
    let err: string;
    if (tool === 'remove') err = s.removeFromPlot(plotKey, c.x, c.y);
    else if (tool === 'turn') {
      const b = plot.buildings.find((q) => q.x === c.x && q.y === c.y);
      err = b ? s.rotateInPlot(plotKey, c.x, c.y, ((b.dir + 1) % 4) as Dir) : '该格没有建筑';
    } else err = s.placeInPlot(plotKey, tool, c.x, c.y, dir);
    setMsg(err);
  };

  const owner = s.state!.players[tile.player]!;
  return (
    <div className="plot-panel" onClick={(e) => e.stopPropagation()}>
      <div className="plot-head">
        <b>{plotTitle(loc!, plot.kind)} 厂区</b>
        <span>P{tile.player + 1} · £{owner.money}</span>
        <button onClick={onClose}>关闭</button>
      </div>
      <div className="plot-stats">
        <span>库存 {tile.resources} / 矿量 {tile.deposit ?? 0}</span>
        <span>预估吞吐 {throughputPerMinute(plot).toFixed(2)} 件/分（每行动 20 s）</span>
        <span>累计交付 {plot.delivered}</span>
      </div>
      <div className="plot-body">
        <canvas
          ref={canvasRef}
          width={plot.w * CELL}
          height={plot.h * CELL}
          onClick={onClick}
          onMouseMove={(e) => setHover(cellOf(e))}
          onMouseLeave={() => setHover(null)}
        />
        <div className="plot-tools">
          {TOOLS[plot.kind].map((k) => (
            <button key={k} className={tool === k ? 'on' : ''} onClick={() => setTool(k)}>
              {BUILDING_NAME[k]} £{COSTS[k]}
            </button>
          ))}
          <button className={tool === 'turn' ? 'on' : ''} onClick={() => setTool('turn')}>转向（点建筑）</button>
          <button className={tool === 'remove' ? 'on' : ''} onClick={() => setTool('remove')}>拆除（不退款）</button>
          <button onClick={() => setDir((d) => (((d + 1) % 4) as Dir))}>旋转 R：{DIR_NAME[dir]}</button>
        </div>
      </div>
      <div className="plot-msg">{msg || (hover ? `(${hover.x}, ${hover.y})` : '点格子放置；R 换朝向；Esc 关闭')}</div>
    </div>
  );
}
