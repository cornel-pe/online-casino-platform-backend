/**
 * Trading calculation utilities
 */

export interface TradeResult {
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  profit: number;
  loss: number;
  profitExit: number;
  lossExit: number;
  requiredChangePercent: number;
}

/**
 * Calculate bust price for a trading bet
 * @param entryPrice - Entry price of the asset
 * @param leverage - Leverage multiplier (1-1000)
 * @param direction - "up" for long, "down" for short
 * @returns Bust price
 */
export function calculateBustPrice(
  entryPrice: number,
  leverage: number,
  direction: "up" | "down"
): number {
  if (leverage <= 0) throw new Error("Leverage must be greater than 0");
  if (entryPrice <= 0) throw new Error("Entry price must be greater than 0");

  // Optionally add a small safety buffer (0.5%)
  const buffer = 0.005;

  if (direction === "up") {
    // Long position busts when price drops
    return entryPrice - (entryPrice / leverage) * (1 - buffer);
  } else {
    // Short position busts when price rises
    return entryPrice + (entryPrice / leverage) * (1 - buffer);
  }
}

/**
 * Calculate profit/loss, exit prices, and required price change
 * @param entryPrice - The entry price of the asset
 * @param wager - Amount of USD used for the trade
 * @param leverage - Multiplier
 * @param targetPnL - Desired profit or loss in USD
 * @returns TradeResult
 */
export function calculateTrade(
  entryPrice: number,
  wager: number,
  leverage: number,
  targetPnL: number
): TradeResult {
  if (entryPrice <= 0) throw new Error("Entry price must be greater than 0");
  if (wager <= 0) throw new Error("Wager must be greater than 0");
  if (leverage <= 0) throw new Error("Leverage must be greater than 0");

  // Total position size
  const positionSize = wager * leverage;

  // Amount of asset held
  const assetAmount = positionSize / entryPrice;

  // Required price change to achieve ± targetPnL
  const delta = targetPnL / assetAmount;

  // Percentage move relative to entry
  const requiredChangePercent = (delta / entryPrice) * 100;

  // Exit prices for long and short
  const longProfitExit = entryPrice + delta;
  const longLossExit = entryPrice - delta;
  const shortProfitExit = entryPrice - delta;
  const shortLossExit = entryPrice + delta;

  return {
    direction: "long",
    entryPrice,
    exitPrice: entryPrice,
    profit: targetPnL,
    loss: -targetPnL,
    profitExit: longProfitExit,
    lossExit: longLossExit,
    requiredChangePercent,
  };
}

/**
 * Calculate current PnL for an active bet
 * @param entryPrice - Entry price
 * @param currentPrice - Current market price
 * @param wager - Bet amount
 * @param leverage - Leverage multiplier
 * @param direction - "up" for long, "down" for short
 * @returns Current PnL in USD
 */
export function calculatePnL(
  entryPrice: number,
  currentPrice: number,
  wager: number,
  leverage: number,
  direction: "up" | "down"
): number {
  if (entryPrice <= 0) throw new Error("Entry price must be greater than 0");
  if (currentPrice <= 0) throw new Error("Current price must be greater than 0");
  if (wager <= 0) throw new Error("Wager must be greater than 0");
  if (leverage <= 0) throw new Error("Leverage must be greater than 0");

  const positionSize = wager * leverage;
  const assetAmount = positionSize / entryPrice;

  if (direction === "up") {
    // Long position: profit when price goes up
    return (currentPrice - entryPrice) * assetAmount;
  } else {
    // Short position: profit when price goes down
    return (entryPrice - currentPrice) * assetAmount;
  }
}

/**
 * Calculate exit price for a target PnL
 * @param entryPrice - Entry price
 * @param wager - Bet amount
 * @param leverage - Leverage multiplier
 * @param targetPnL - Target profit/loss in USD (positive for profit, negative for loss)
 * @param direction - "up" for long, "down" for short
 * @returns Target exit price
 */
export function calculateExitPrice(
  entryPrice: number,
  wager: number,
  leverage: number,
  targetPnL: number,
  direction: "up" | "down"
): number {
  if (entryPrice <= 0) throw new Error("Entry price must be greater than 0");
  if (wager <= 0) throw new Error("Wager must be greater than 0");
  if (leverage <= 0) throw new Error("Leverage must be greater than 0");

  const positionSize = wager * leverage;
  const assetAmount = positionSize / entryPrice;
  const delta = targetPnL / assetAmount;

  if (direction === "up") {
    return entryPrice + delta;
  } else {
    return entryPrice - delta;
  }
}

/**
 * Calculate multiplier at current price
 * @param entryPrice - Entry price
 * @param currentPrice - Current market price
 * @param leverage - Leverage multiplier
 * @param direction - "up" for long, "down" for short
 * @returns Current multiplier
 */
export function calculateMultiplier(
  entryPrice: number,
  currentPrice: number,
  leverage: number,
  direction: "up" | "down"
): number {
  const pnl = calculatePnL(entryPrice, currentPrice, 1, leverage, direction);
  // Multiplier starts at 1.0, increases/decreases with PnL
  return 1 + (pnl / 1); // For $1 wager
}

/**
 * Check if price has hit bust price
 * @param currentPrice - Current market price
 * @param bustPrice - Bust price
 * @param direction - "up" for long, "down" for short
 * @returns True if busted
 */
export function isBusted(
  currentPrice: number,
  bustPrice: number,
  direction: "up" | "down"
): boolean {
  if (direction === "up") {
    // Long position busts when price drops below bust price
    return currentPrice <= bustPrice;
  } else {
    // Short position busts when price rises above bust price
    return currentPrice >= bustPrice;
  }
}

