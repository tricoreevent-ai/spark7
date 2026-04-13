const FULL_REDACT_KEYS = [
  'password',
  'pass',
  'pwd',
  'token',
  'accessToken',
  'refreshToken',
  'sessionToken',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
  'api_key',
  'clientSecret',
  'otp',
  'otpHash',
  'otpSalt',
] as const;

const LAST4_ONLY_KEYS = [
  'accountNumber',
  'account_number',
  'bankAccountNumber',
  'bank_account_number',
  'iban',
  'pan',
] as const;

const normalizeKey = (value: string): string => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

const matchesSensitiveKey = (key: string, candidates: readonly string[]): boolean => {
  const normalized = normalizeKey(key);
  return candidates.some((candidate) => normalized.includes(normalizeKey(candidate)));
};

const maskLastFour = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\s+/g, '');
  if (!raw) return '****';
  const lastFour = raw.slice(-4);
  return `****${lastFour}`;
};

const redactPrimitive = (key: string, value: unknown): unknown => {
  if (value == null) return value;
  if (matchesSensitiveKey(key, FULL_REDACT_KEYS)) return '[REDACTED]';
  if (matchesSensitiveKey(key, LAST4_ONLY_KEYS)) return maskLastFour(value);
  return value;
};

export const redactSensitiveData = <T>(value: T, parentKey = ''): T => {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveData(entry, parentKey)) as T;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: String(redactPrimitive(parentKey || 'error', value.message)),
      stack: value.stack,
    } as T;
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const redactedEntries = Object.entries(source).map(([key, entry]) => {
      if (entry && typeof entry === 'object') {
        return [key, redactSensitiveData(entry, key)];
      }
      return [key, redactPrimitive(key, entry)];
    });
    return Object.fromEntries(redactedEntries) as T;
  }

  return redactPrimitive(parentKey, value) as T;
};
