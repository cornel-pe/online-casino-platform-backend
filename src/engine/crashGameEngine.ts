/**
 * Public/shared build stub.
 *
 * The real crash engine (provably fair, risk control, treasury, etc.) is premium/private
 * and intentionally not included in this public backend.
 *
 * This stub exists so TypeScript/JS bundling still works even when the premium engine
 * sources are removed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const crashGameEngine: any = {
  start: async () => {
    // Disabled in public build
    return;
  },
  pause: async () => {
    return;
  },
  resume: async () => {
    return;
  },
  forceEndGame: async () => {
    return { success: false, error: 'Crash engine disabled in public build' };
  },
  forceEndRound: async () => {
    return { success: false, error: 'Crash engine disabled in public build' };
  },
  placeBet: async () => {
    return { success: false, message: 'Crash engine disabled in public build' };
  },
  cashoutPlayer: async () => {
    return { success: false, message: 'Crash engine disabled in public build', payout: 0 };
  },
  getCurrentGame: (): any => null,
  getStatus: (): { isRunning: boolean; isPaused: boolean } => ({ isRunning: false, isPaused: false }),
  getGameHistory: async (): Promise<any[]> => [],
};

