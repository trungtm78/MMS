import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AccessTokenPayload {
  userId: string;
  sessionId: string;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  tokenVersion: number;
}

export function generateAccessToken(userId: string, sessionId: string): string {
  const payload: AccessTokenPayload = { userId, sessionId };
  
  return jwt.sign(payload, config.jwt.accessTokenSecret, {
    expiresIn: config.jwt.accessTokenExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function generateRefreshToken(userId: string, sessionId: string, tokenVersion: number = 0): string {
  const payload: RefreshTokenPayload = { userId, sessionId, tokenVersion };
  
  return jwt.sign(payload, config.jwt.refreshTokenSecret, {
    expiresIn: config.jwt.refreshTokenExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, config.jwt.accessTokenSecret) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    return jwt.verify(token, config.jwt.refreshTokenSecret) as RefreshTokenPayload;
  } catch {
    return null;
  }
}

export function decodeToken(token: string): unknown {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}
