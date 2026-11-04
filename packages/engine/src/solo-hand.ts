/**
 * Solo 变体的合成手牌（spec 2026-11-05 §1.1）：1 张 Wild Industry（solo-industry）
 * + permits 张 Wild Location（solo-permit-0..N-1）。无依赖，供 state/apply/build 共用。
 */
import { SOLO_INDUSTRY_CARD_ID, SOLO_PERMIT_CARD_PREFIX } from './data/solo.js';
import type { Card } from './data/cards.js';
import type { GameState } from './state.js';
import type { PlayerIndex } from './types.js';

export function soloHand(permits: number): Card[] {
  const hand: Card[] = [{ id: SOLO_INDUSTRY_CARD_ID, kind: 'wild-industry' }];
  for (let k = 0; k < permits; k++) {
    hand.push({ id: `${SOLO_PERMIT_CARD_PREFIX}${k}`, kind: 'wild-location' });
  }
  return hand;
}

/** 是否合成卡（id 以 'solo-' 开头）：弃掉时直接消失，不进弃牌堆、不回 Wild 供应。 */
export function isSoloCard(cardId: string): boolean {
  return cardId.startsWith('solo-');
}

export function isSoloPermitCard(cardId: string): boolean {
  return cardId.startsWith(SOLO_PERMIT_CARD_PREFIX);
}

/**
 * 合成卡已从手牌移除后的结算：许可证卡 permits − 1；solo-industry 无事发生。
 * 调用方负责"不进弃牌堆、不回 Wild 供应"。
 */
export function spendSoloCard(state: GameState, player: PlayerIndex, cardId: string): GameState {
  if (!isSoloPermitCard(cardId)) return state;
  const ps = state.players[player]!;
  const players = state.players.slice();
  players[player] = { ...ps, permits: Math.max(0, (ps.permits ?? 0) - 1) };
  return { ...state, players };
}
