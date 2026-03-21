export class GameService {
  static updateStatus(status: string, data?: unknown) {
    console.log(`[Game] Status update: ${status}`);
    return { type: 'game', status, data };
  }
}
