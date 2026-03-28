import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth.js';
import { IUserDocument } from '../models/User.js';
import { ensureUserTenantId } from '../services/tenant.js';
import { runWithTenantContext, getCurrentTenantId } from '../services/tenantContext.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  tenantId?: string;
  user?: IUserDocument | null;
  userRole?: string;
}

const resolveTenantFromToken = async (userId: string, tokenTenantId?: string): Promise<string | null> => {
  if (tokenTenantId) return tokenTenantId;
  return ensureUserTenantId(userId);
};

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const handleAuth = async () => {
    try {
      const token = req.headers.authorization?.split(' ')[1];

      if (!token) {
        return res.status(401).json({ success: false, error: 'No token provided' });
      }

      const { userId, tenantId: tokenTenantId } = verifyToken(token);
      const tenantId = await resolveTenantFromToken(userId, tokenTenantId);
      if (!tenantId) {
        return res.status(401).json({ success: false, error: 'Tenant context not found for user' });
      }

      req.userId = userId;
      req.tenantId = tenantId;
      
      // Wrap ALL route handling in tenant context
      // This ensures every async operation in the route has access to tenantId
      runWithTenantContext(tenantId, () => {
        next();
      });
    } catch (error) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  };
  
  handleAuth().catch((err) => {
    console.error('Auth middleware error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  });
};

export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      const { userId, tenantId: tokenTenantId } = verifyToken(token);
      const tenantId = await resolveTenantFromToken(userId, tokenTenantId);
      req.userId = userId;
      req.tenantId = tenantId || undefined;
      if (tenantId) {
        runWithTenantContext(tenantId, () => next());
        return;
      }
    }
  } catch {
    // Optional auth, so we don't throw error
  }

  next();
};
