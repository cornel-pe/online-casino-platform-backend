import { Socket } from 'socket.io';

export interface ChatClient {
  socket: Socket;
  room: string;
  tokenValidation: any;
  lastPing: number;
  isAlive: boolean;
  isAuthenticated: boolean;
  isAnonymous: boolean; // New field for anonymous users
  isAdmin?: boolean; // New field for admin users
  // Room management
  rooms: Set<string>; // Track all rooms the client is in
  user:{
    id: string;
    username: string;
    avatar: string;
    level: number;
    role?: string; // New field for user role
  }
}

// Room types for different games and features
export const ROOM_TYPES = {
  CHAT: 'chat',
  MINE: 'mine',
  CRASH: 'crash',
  COINFLIP: 'coinflip',
  ROULETTE: 'roulette'
} as const;

export type RoomType = typeof ROOM_TYPES[keyof typeof ROOM_TYPES];

// Room configuration
export interface RoomConfig {
  name: string;
  type: RoomType;
  autoJoin?: boolean; // Whether clients should auto-join this room
  gameSpecific?: boolean; // Whether this room is game-specific
  maxClients?: number; // Maximum clients allowed in this room
}

// Default rooms configuration
export const DEFAULT_ROOMS: RoomConfig[] = [
  { name: 'chat', type: ROOM_TYPES.CHAT, autoJoin: true, gameSpecific: false },
  { name: 'mine', type: ROOM_TYPES.MINE, autoJoin: false, gameSpecific: true },
  { name: 'crash', type: ROOM_TYPES.CRASH, autoJoin: false, gameSpecific: true },
  { name: 'coinflip', type: ROOM_TYPES.COINFLIP, autoJoin: false, gameSpecific: true },
  { name: 'roulette', type: ROOM_TYPES.ROULETTE, autoJoin: false, gameSpecific: true }
];
