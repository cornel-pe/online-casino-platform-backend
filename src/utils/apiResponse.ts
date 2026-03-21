import { Response } from 'express';

/**
 * Standard API response helpers for consistent success/error JSON.
 * Use these so all endpoints share the same shape: { success, data? } or { success: false, error }.
 */

export const apiResponse = {
  success<T>(res: Response, data: T, status = 200): Response {
    return res.status(status).json({ success: true, data });
  },

  error(res: Response, message: string, status = 500): Response {
    return res.status(status).json({ success: false, error: message });
  },

  badRequest(res: Response, message: string): Response {
    return res.status(400).json({ success: false, error: message });
  },

  unauthorized(res: Response, message = 'Unauthorized'): Response {
    return res.status(401).json({ success: false, error: message });
  },

  forbidden(res: Response, message = 'Forbidden'): Response {
    return res.status(403).json({ success: false, error: message });
  },

  notFound(res: Response, message = 'Not found'): Response {
    return res.status(404).json({ success: false, error: message });
  },
};
