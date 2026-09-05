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
