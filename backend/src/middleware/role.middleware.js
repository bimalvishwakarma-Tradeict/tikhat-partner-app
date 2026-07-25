export const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  INVESTOR: 'investor',
});

/**
 * Restrict route to one or more roles.
 * Accepts: requireRole('admin') or requireRole(['admin', 'super_admin'])
 */
export const requireRole = (...allowedRoles) => {
  const roles = allowedRoles.flat();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'AUTH_UNAUTHORIZED',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        error: 'AUTH_FORBIDDEN',
      });
    }

    return next();
  };
};

/** Investor (Tikhat Partner) only */
export const requireInvestor = requireRole(ROLES.INVESTOR);

/** Admin or Super Admin */
export const requireAdmin = requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN);

/** Super Admin only */
export const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN);
