import User, { IUser } from '../models/User';

/**
 * Check if a user is an admin
 */
export function isAdmin(user: IUser | null): boolean {
  return user?.isAdmin === true;
}

/**
 * Check if a user ID belongs to an admin
 */
export async function isAdminById(userId: string): Promise<boolean> {
  try {
    const user = await User.findOne({supabaseId:userId});
    return isAdmin(user);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Get admin users
 */
export async function getAdminUsers(): Promise<IUser[]> {
  try {
    return await User.find({ isAdmin: true }).select('username email isActive createdAt');
  } catch (error) {
    console.error('Error getting admin users:', error);
    return [];
  }
}

/**
 * Remove admin privileges from a user
 */
export async function removeUserAdmin(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    user.isAdmin = false;
    await user.save();

    return { success: true };
  } catch (error) {
    console.error('Error removing admin privileges:', error);
    return { success: false, error: 'Failed to remove admin privileges' };
  }
}

/**
 * Middleware function to check admin access
 */
export function requireAdmin() {
  return async (req: any, res: any, next: any) => {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const user = await User.findById(userId);
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      req.adminUser = user;
      next();
    } catch (error) {
      console.error('Admin check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
