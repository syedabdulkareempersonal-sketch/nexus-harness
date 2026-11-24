import crypto from 'node:crypto';
import os from 'node:os';

interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

let electronSafeStorage: SafeStorageLike | null = null;
try {
  // Dynamically load electron safeStorage when running inside Electron Main
  // Falls back cleanly to AES-256-GCM in unit test / headless environments.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron');
  if (electron && electron.safeStorage) {
    electronSafeStorage = electron.safeStorage as SafeStorageLike;
  }
} catch {
  electronSafeStorage = null;
}

function getFallbackKey(secretSalt = 'auradesk-local-vault-v1'): Buffer {
  const machineMaterial = `${os.hostname()}::${os.userInfo().username}::${os.platform()}::${secretSalt}`;
  return crypto.scryptSync(machineMaterial, 'auradesk-salt-2026', 32);
}

export function encryptSecret(plainText: string): string {
  if (!plainText) return '';

  if (electronSafeStorage && electronSafeStorage.isEncryptionAvailable()) {
    const encrypted = electronSafeStorage.encryptString(plainText);
    return `os:${encrypted.toString('base64')}`;
  }

  const key = getFallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string | null | undefined): string {
  if (!payload) return '';

  try {
    if (payload.startsWith('os:')) {
      if (!electronSafeStorage || !electronSafeStorage.isEncryptionAvailable()) {
        return '';
      }
      const raw = Buffer.from(payload.slice(3), 'base64');
      return electronSafeStorage.decryptString(raw);
    }

    if (payload.startsWith('aes:')) {
      const parts = payload.split(':');
      if (parts.length !== 4) return '';
      const iv = Buffer.from(parts[1], 'base64');
      const tag = Buffer.from(parts[2], 'base64');
      const ciphertext = Buffer.from(parts[3], 'base64');
      const key = getFallbackKey();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf8');
    }
  } catch {
    return '';
  }

  return '';
}

export function maskSecretHint(secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}••••${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}
