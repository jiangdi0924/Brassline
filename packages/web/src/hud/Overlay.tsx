import { SOLO_TARGETS, soloRank, type SoloRank } from '@brassline/engine';

const RANK_NAME: Record<SoloRank, string> = { none: '未达标', bronze: '铜', silver: '银', gold: '金' };

/** Solo 终局弹窗正文（spec 2026-11-05 §3）。 */
export function soloGameOverText(vp: number): string {
  return `你的分数：${vp} VP\n评级：${RANK_NAME[soloRank(vp)]}\n`
    + `阈值：铜 ${SOLO_TARGETS.bronze} · 银 ${SOLO_TARGETS.silver} · 金 ${SOLO_TARGETS.gold}`;
}

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
