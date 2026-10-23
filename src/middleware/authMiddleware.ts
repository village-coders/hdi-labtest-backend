import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../models/User.js';

export interface AuthUserPayload {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  labIdentifier?: string;
  labName?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'Authentication required. No token provided.' });
    return;
  }

  const secret = process.env.JWT_SECRET || 'hdi_lab_portal_secret_key_2026_super_secure';

  jwt.verify(token, secret, (err: any, decoded: any) => {
    if (err) {
      res.status(403).json({ message: 'Invalid or expired token.' });
      return;
    }
    req.user = decoded as AuthUserPayload;
    next();
  });
};

export const requireRoles = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ message: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]` });
      return;
    }
    next();
  };
};

export const requireSuperAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ message: 'Unauthorized. Authentication required.' });
    return;
  }
  if (req.user.role !== 'SUPER_ADMIN') {
    res.status(403).json({
      message: 'Access denied. Only Super Administrator can add new users. Regular Administrators do not have user creation permissions.',
    });
    return;
  }
  next();
};
