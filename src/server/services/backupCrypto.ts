import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const resolveBackupEncryptionSecret = (): string =>
  String(process.env.DB_BACKUP_ENCRYPTION_KEY || process.env.BACKUP_ENCRYPTION_KEY || '').trim();

const deriveBackupKey = (): Buffer => createHash('sha256').update(resolveBackupEncryptionSecret()).digest();

export const isBackupEncryptionEnabled = (): boolean => Boolean(resolveBackupEncryptionSecret());

export const encryptBackupPayload = (plainText: string): string => {
  if (!isBackupEncryptionEnabled()) return plainText;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveBackupKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText || ''), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    encryption: {
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    },
    payload: encrypted.toString('base64'),
  });
};

export const decryptBackupPayload = (rawContent: string): string => {
  const text = String(rawContent || '');
  if (!text.trim()) return text;

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  if (!parsed?.encryption?.algorithm || parsed.encryption.algorithm !== 'aes-256-gcm' || !parsed?.payload) {
    return text;
  }

  if (!isBackupEncryptionEnabled()) {
    throw new Error('Backup payload is encrypted but no backup encryption key is configured');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveBackupKey(),
    Buffer.from(String(parsed.encryption.iv || ''), 'base64')
  );
  decipher.setAuthTag(Buffer.from(String(parsed.encryption.authTag || ''), 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(String(parsed.payload || ''), 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};
