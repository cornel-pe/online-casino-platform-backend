/**
 * Public/shared build stub.
 *
 * The real roulette engine is premium/private and is intentionally not included in this
 * public backend.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rouletteGameEngine: any = {
  start: async (): Promise<void> => {
    return;
  },
  pause: async (): Promise<void> => {
    return;
  },
  resume: async (): Promise<void> => {
    return;
  },
  resetGameToWaiting: async (): Promise<void> => {
    return;
  },
  placeBet: async (): Promise<any> => {
    return { success: false, message: 'Roulette engine disabled in public build', data: null as any };
  },
  getCurrentGame: (): any => ({
    status: 'completed',
    // Provide minimal fields to avoid crashes if someone calls for current game
    gameId: null,
    totalBetAmount: 0,
    playerCount: 0,
    bettingDurationMs: 0,
    minBetAmount: 0,
    maxBetAmount: 0,
    serverSeedHash: '',
    publicSeed: '',
    playerBets: [] as any[],
    winningSlot: 0,
    winningType: null,
    completedAt: new Date(),
  }),
  getStatus: (): any => ({ isRunning: false, isPaused: false }),
  getGameHistory: async (limit: number): Promise<any[]> => [],
};

