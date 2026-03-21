export type WSMessage =
  | { type: 'join'; room?: string; username?: string }
  | { type: 'chat'; message: string; room?: string; username?: string }
  | { type: 'game'; status: string; data?: unknown }
  | { type: 'mine_set_game'; gameId: string }
  | { type: 'mine_start_game'; gameId: string }
  | { type: 'mine_reveal'; gameId: string; tileIndex: number }
  | { type: 'mine_cashout'; gameId: string }
  | { type: 'ping' };
