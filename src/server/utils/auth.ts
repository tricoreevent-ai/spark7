import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET: jwt.Secret = (process.env.JWT_SECRET || 'your-secret-key-here') as jwt.Secret;
const JWT_EXPIRE: string = process.env.JWT_EXPIRE || '7d';

export interface TokenPayload {
  userId: string;
  tenantId?: string;
}

export const generateToken = (userId: string, tenantId?: string): string => {
  const payload: TokenPayload = { userId };
  if (tenantId) payload.tenantId = tenantId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRE as jwt.SignOptions['expiresIn'] });
};

export const verifyToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<TokenPayload>;
    const userId = String(decoded?.userId || '').trim();
    const tenantId = decoded?.tenantId ? String(decoded.tenantId).trim() : undefined;
    if (!userId) throw new Error('Invalid token payload');
    return { userId, tenantId };
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};
