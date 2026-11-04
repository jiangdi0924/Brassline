import { PLAYER_COLORS } from '../board/scene';

export function playerColor(p: number): string {
  return `#${PLAYER_COLORS[p]!.toString(16).padStart(6, '0')}`;
}
