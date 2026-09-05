import type { AuthResponse, LoginRequest, RegisterRequest } from '@pentilius/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

export function register(payload: RegisterRequest): Promise<AuthResponse> {
  return postJson<AuthResponse>('/auth/register', payload);
}

export function login(payload: LoginRequest): Promise<AuthResponse> {
  return postJson<AuthResponse>('/auth/login', payload);
}
