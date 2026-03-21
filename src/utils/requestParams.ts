import type { Request } from 'express';

/**
 * Get a single route param as string.
 * Express types req.params as Record<string, string | string[]>, so values are
 * string | string[] and cause type errors when passed to APIs expecting string.
 * Use this helper everywhere you read a route param to get a consistent string
 * (or undefined if missing).
 */
export function getParam(req: Request, key: string): string | undefined {
  const value = req.params[key];
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : value?.[0];
}
