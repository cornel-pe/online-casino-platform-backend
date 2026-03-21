import type { Rng } from '../platform/rng';

export type CoinflipSide = 'heads' | 'tails';

export interface CoinflipEngineInput {
  gameId: number;
  creatorId: string;
  joinerId: string;
  betAmount: number;
  coinSide: CoinflipSide;
  serverSeed: string;
  creatorSeed: string;
  joinerSeed: string;
}

export interface CoinflipEngineConfig {
  /**
   * Platform fee as fraction of total pot.
   * Example: 0.05 = 5% fee, 95% to winner.
   */
  platformFeeRate?: number;
}

export interface CoinflipEngineOutcome {
  winnerId: string;
  winningTicket: number;
  winningSide: 'HEADS' | 'TAILS';
  totalPot: number;
  platformFee: number;
  winnerPayout: number;
}

export function resolveCoinflipGame(
  input: CoinflipEngineInput,
  config: CoinflipEngineConfig,
  deps: { rng: Rng }
): CoinflipEngineOutcome {
  const {
    gameId,
    creatorId,
    joinerId,
    betAmount,
    coinSide,
    serverSeed,
    creatorSeed,
    joinerSeed,
  } = input;

  const feeRate = config.platformFeeRate ?? 0.05; // default 5% as in legacy model

  const result = deps.rng.generateCoinflipResult(
    serverSeed,
    creatorSeed || '',
    joinerSeed || '',
    gameId.toString()
  );

  const creatorSide = coinSide.toUpperCase() as 'HEADS' | 'TAILS';
  const joinerSide = creatorSide === 'HEADS' ? 'TAILS' : 'HEADS';

  const creatorWins = result.winnerSide === creatorSide;
  const winnerId = creatorWins ? creatorId : joinerId;

  const totalPot = betAmount * 2;
  const platformFee = totalPot * feeRate;
  const winnerPayout = totalPot - platformFee;

  return {
    winnerId,
    winningTicket: result.ticket,
    winningSide: result.winnerSide,
    totalPot,
    platformFee,
    winnerPayout,
  };
}

