/**
 * GameState 核心类型与对局初始化（rules-reference §4 初始设置 + §8 人数变体）。
 *
 * 初始化顺序（确定性，同一 seed 逐字节一致）：
 * 1. 建牌堆并洗牌，发 8 张/人，再每位玩家各抽 1 张面朝下作弃牌堆底
 *    （规则书 p.5 玩家区设置步骤 9 为逐玩家执行；弃牌堆在引擎中是单一共享堆，
 *    时代末合洗不受影响，但堆底数量 = playerCount 张，否则时代长度出错）；
 * 2. 按人数取商人板块洗混，铺到可用商人位（MERCHANTS 键序），每非 blank 板块 beer=1；
 * 3. 角色块洗混定首轮顺位。
 */
import type {
  Era,
  GameEvent,
  LocationId,
  MerchantId,
  PlayerIndex,
} from './types.js';
import { LOCATIONS, MERCHANTS } from './data/board.js';
import { TILES, type TileDef } from './data/tiles.js';
import {
  buildDeck,
  WILD_INDUSTRY_COUNT,
  WILD_LOCATION_COUNT,
  type Card,
} from './data/cards.js';
import {
  COAL_MARKET_INITIAL_FILLED,
  IRON_MARKET_INITIAL_FILLED,
} from './data/market.js';
import { INCOME_START_SPACE } from './data/income.js';
import { createRng } from './rng.js';
import { soloHand } from './solo-hand.js';

export interface PlacedTile {
  tile: TileDef;
  player: PlayerIndex;
  flipped: boolean;
  /** 煤/铁方块数或啤酒桶数（酒厂桶数按时代，见 market.ts BREWERY_BARRELS）。 */
  resources: number;
  /**
   * 内层产线（rules.innerLayer）专用：矿里/酒厂里尚未交付的方块/桶数。
   * 开关关闭时不写入（undefined 视为 0），序列化兼容。见 deliver.ts。
   */
  deposit?: number;
}

export interface BuiltLink {
  linkIndex: number;
  player: PlayerIndex;
  /** 建造时所在时代（运河时代的连接画驳船、铁路时代画火车）。 */
  era: Era;
}

export interface PlayerState {
  /** wild 卡也是 hand 里的 Card（kind: 'wild-location'|'wild-industry'）。 */
  hand: Card[];
  /** 面板堆叠（未建），按产业分组、等级升序，建造即取栈顶。 */
  tiles: TileDef[];
  money: number;
  incomeSpace: number;
  vp: number;
  spentThisRound: number;
  /** Solo 变体（rules.solo）专用：许可证数（合成 Wild Location 卡张数）。仅 solo 写入。 */
  permits?: number;
}

export type MerchantTile = 'any' | 'cotton' | 'manufacturer' | 'pottery' | 'blank';

/** 规则变体开关（P3 spec §1）。 */
export interface GameRules {
  /** 资源板块由内层产线逐步交付（deposit → resources），建造时不放满、不卖市场。 */
  innerLayer: boolean;
  /**
   * Solo 变体（spec 2026-11-05 §1）：1 人、合成手牌、NPC 需求、每时代 8 轮。
   * 仅 solo 局写入 true；非 solo 局不写该字段（undefined 视为 false），保持序列化兼容。
   */
  solo?: boolean;
}

export interface GameState {
  /** 1 仅在 rules.solo 下出现。 */
  playerCount: 1 | 2 | 3 | 4;
  rules: GameRules;
  era: Era;
  /** 从 1 起。 */
  round: number;
  board: {
    slots: Record<LocationId, (PlacedTile | null)[]>;
    links: BuiltLink[];
  };
  merchants: Record<MerchantId, { tiles: MerchantTile[]; barrels: boolean[] }>;
  /** Wild 卡供应堆余量（§6.7 Scout 获取、Wild 弃置归还；§9.14）。 */
  wildSupply: { location: number; industry: number };
  /** 已填充方块数（索引语义见 market.ts helper）。 */
  coalMarket: number;
  ironMarket: number;
  deck: Card[];
  discard: Card[];
  players: PlayerState[];
  /** 本轮顺位。 */
  turnOrder: PlayerIndex[];
  /** turnOrder 内下标。 */
  currentPlayerIdx: number;
  /** 当前玩家本轮已行动数。 */
  actionsThisTurn: number;
  /** 每步快照，供重放校验。 */
  rngState: number;
  /** 上一步 applyX/applyAction 产生的事件。 */
  lastEvents: GameEvent[];
  /** 时代结束待清算（牌堆空且全部手牌空的轮末由 turn.ts 置位；Task 12 消费做时代切换/终局）。 */
  eraEndPending: boolean;
  /** 轮末结算待消费(联机回合确认窗口:顺位/收入/时代清算等 held 玩家确认后才落)。 */
  roundEndPending: boolean;
  phase: 'action' | 'game-over';
  winner: PlayerIndex[] | null;
}

const START_MONEY = 17;
const HAND_SIZE = 8;

/** 商人板块构成（§1.4）：2p 基础 5 块；3p +{pottery, blank}；4p +{cotton, manufacturer}。 */
function merchantTilePool(playerCount: 2 | 3 | 4): MerchantTile[] {
  const pool: MerchantTile[] = ['any', 'cotton', 'manufacturer', 'blank', 'blank'];
  if (playerCount >= 3) pool.push('pottery', 'blank');
  if (playerCount >= 4) pool.push('cotton', 'manufacturer');
  return pool;
}

/** 可用商人位（§8）：2p 不放 warrington/nottingham；3p 不放 nottingham。 */
function availableMerchants(playerCount: 2 | 3 | 4): MerchantId[] {
  const all = Object.keys(MERCHANTS) as MerchantId[];
  return all.filter((id) => {
    if (playerCount === 2) return id !== 'warrington' && id !== 'nottingham';
    if (playerCount === 3) return id !== 'nottingham';
    return true;
  });
}

/** 玩家面板：TILES 按 count 展开（TILES 本身按产业分组、等级升序）。 */
function playerTileStacks(): TileDef[] {
  const out: TileDef[] = [];
  for (const def of TILES) {
    for (let i = 0; i < def.count; i++) out.push(def);
  }
  return out;
}

/**
 * 新开一局。playerCount 1 仅在 opts.solo 下允许（solo 也只允许 1 人）。
 * Solo：版图按 2 人设置（商人位/商人板块池），牌堆与弃牌堆为空，手牌为合成卡
 * （见 solo-hand.ts），players[0].permits = 0；不消耗洗牌用 rng（商人板块与顺位照常洗）。
 */
export function newGame(
  playerCount: 1 | 2 | 3 | 4,
  seed: number,
  opts?: { innerLayer?: boolean; solo?: boolean },
): GameState {
  const isSolo = opts?.solo === true;
  if (isSolo !== (playerCount === 1)) {
    throw new RangeError(
      isSolo
        ? `newGame: solo requires playerCount 1, got ${playerCount}`
        : 'newGame: playerCount 1 is only allowed with { solo: true }',
    );
  }
  const rng = createRng(seed);
  const boardCount: 2 | 3 | 4 = playerCount === 1 ? 2 : playerCount;

  // 1. 牌堆：洗牌 → 发 8 张/人 → 每位玩家各 1 张弃牌堆底（规则书 p.5 步骤 9）
  //    solo：无牌堆，手牌为合成卡
  const hands: Card[][] = [];
  let discard: Card[] = [];
  let deck: Card[] = [];
  if (isSolo) {
    hands.push(soloHand(0));
  } else {
    const shuffled = rng.shuffle(buildDeck(boardCount));
    let cursor = 0;
    for (let i = 0; i < playerCount; i++) {
      hands.push(shuffled.slice(cursor, cursor + HAND_SIZE));
      cursor += HAND_SIZE;
    }
    discard = shuffled.slice(cursor, cursor + playerCount);
    cursor += playerCount;
    deck = shuffled.slice(cursor);
  }

  // 2. 商人板块：洗混后按 MERCHANTS 键序铺位；啤酒桶按板块格绑定（每非 blank 格 1 桶）
  const tiles = rng.shuffle(merchantTilePool(boardCount));
  const available = new Set(availableMerchants(boardCount));
  const merchants = {} as Record<MerchantId, { tiles: MerchantTile[]; barrels: boolean[] }>;
  let t = 0;
  for (const id of Object.keys(MERCHANTS) as MerchantId[]) {
    if (!available.has(id)) {
      merchants[id] = { tiles: [], barrels: [] };
      continue;
    }
    const placed = tiles.slice(t, t + MERCHANTS[id].slots);
    t += MERCHANTS[id].slots;
    merchants[id] = {
      tiles: placed,
      barrels: placed.map((x) => x !== 'blank'),
    };
  }

  // 3. 角色块洗混定首轮顺位
  const turnOrder = rng.shuffle(
    Array.from({ length: playerCount }, (_, i) => i as PlayerIndex),
  );

  const slots: Record<LocationId, (PlacedTile | null)[]> = {};
  for (const [id, loc] of Object.entries(LOCATIONS)) {
    slots[id] = Array.from({ length: loc.slots.length }, () => null);
  }

  const players: PlayerState[] = hands.map((hand) => ({
    hand,
    tiles: playerTileStacks(),
    money: START_MONEY,
    incomeSpace: INCOME_START_SPACE,
    vp: 0,
    spentThisRound: 0,
    ...(isSolo ? { permits: 0 } : {}),
  }));

  return {
    playerCount,
    rules: { innerLayer: opts?.innerLayer === true, ...(isSolo ? { solo: true } : {}) },
    era: 'canal',
    round: 1,
    board: { slots, links: [] },
    merchants,
    wildSupply: { location: WILD_LOCATION_COUNT, industry: WILD_INDUSTRY_COUNT },
    coalMarket: COAL_MARKET_INITIAL_FILLED,
    ironMarket: IRON_MARKET_INITIAL_FILLED,
    deck,
    discard,
    players,
    turnOrder,
    currentPlayerIdx: 0,
    actionsThisTurn: 0,
    rngState: rng.getState(),
    lastEvents: [],
    eraEndPending: false,
    roundEndPending: false,
    phase: 'action',
    winner: null,
  };
}
