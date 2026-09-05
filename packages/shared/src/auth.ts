export interface RegisterRequest {
  email: string;
  password: string;
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
  createdAt: string;
}

export interface AuthResponse extends AuthTokens {
  player: PlayerSummary;
}

export interface RefreshRequest {
  refreshToken: string;
}
