import { Race } from './game';

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  race: Race;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PlayerSummary {
  id: string;
  email: string;
  username: string;
  race: Race;
  createdAt: string;
}

export interface AuthResponse extends AuthTokens {
  player: PlayerSummary;
}

export interface RefreshRequest {
  refreshToken: string;
}

// Registered-player count per race, shown at registration to nudge new players
// toward the least-represented race (flavor/social nudge only — race carries no
// mechanical bonus yet, see instructions/OPEN_DECISIONS.md).
export type RaceCountsDto = Record<Race, number>;
