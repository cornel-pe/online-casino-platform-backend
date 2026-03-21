/**
 * Calculate multiplier for mine game based on grid size, number of mines, and revealed tiles
 * @param gridSize - Size of the grid (e.g., 5 for 5x5)
 * @param numMines - Number of mines in the grid
 * @param revealedTiles - Number of tiles revealed so far
 * @param maxMultiplier - Maximum allowed multiplier (optional, defaults to 24)
 * @returns The current multiplier (capped at maxMultiplier)
 */
export const calculateMultiplier = (gridSize: number, numMines: number, revealedTiles: number, maxMultiplier: number = 24): number => {
  const houseEdge = 0.04;
  const totalTiles = gridSize * gridSize;
  // const safeTiles = totalTiles - numMines;

  // if (revealedTiles <= 0) return 1.0;
  // if (revealedTiles >= safeTiles) return 0.0; // All safe tiles revealed

  // // Calculate house edge (5%)
  // const houseEdge = 0.95;

  // // Calculate probability of revealing all safe tiles
  // const probability = safeTiles / totalTiles;

  // // Calculate multiplier based on revealed tiles
  // const multiplier = (1 / probability) * houseEdge;

  // // Apply revealed tiles factor
  // const revealedFactor = revealedTiles / safeTiles;
  // const finalMultiplier = 1 + (multiplier - 1) * revealedFactor;

  // return Math.round(finalMultiplier * 10000) / 10000; // Round to 4 decimal places
  if (revealedTiles < 1) return 1;
  const S = totalTiles - numMines;
  if (revealedTiles > S) return 0; // impossible to reveal more safe tiles than exist
  // compute survive probability: product (S-i)/(T-i) for i=0..k-1
  let p = 1;
  for (let i = 0; i < revealedTiles; i++) {
    p *= (S - i) / (totalTiles - i);
  }
  const fair = 1 / p;
  const mult = (1 - houseEdge) * fair;
  
  // Cap the multiplier at the maximum allowed value
  return Math.min(mult, maxMultiplier);
}

/**
 * Calculate next multiplier for display purposes
 * @param gridSize - Size of the grid
 * @param numMines - Number of mines
 * @param revealedTiles - Current revealed tiles
 * @param maxMultiplier - Maximum allowed multiplier (optional, defaults to 24)
 * @returns The next multiplier if one more tile is revealed
 */
export const calculateNextMultiplier = (gridSize: number, numMines: number, revealedTiles: number, maxMultiplier: number = 24): number => {
  return calculateMultiplier(gridSize, numMines, revealedTiles + 1, maxMultiplier);
}
