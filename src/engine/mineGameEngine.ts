/**
 * Public/shared build stub.
 *
 * The real mine engine is premium/private and is not included in this public backend.
 */

// Keep the function signatures flexible: callers will only get disabled behavior.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function revealMineTile(state: any, tileIndex: number, opts: any): any {
  throw new Error('Mine engine disabled in public build');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cashOutMineGame(state: any): any {
  throw new Error('Mine engine disabled in public build');
}

