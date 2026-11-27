import type { Role } from './games/avalon/rules';

export interface PlayerProfileStats {
  games: { gameId: string; played: number; finished: number }[];
  avalonRoles: { role: Role; played: number; wins: number }[];
}
