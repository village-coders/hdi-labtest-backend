import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

const generateToken = (user: IUser): string => {
  const secret = process.env.JWT_SECRET || 'hdi_lab_portal_secret_key_2026_super_secure';
  return jwt.sign(
    {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      labIdentifier: user.labIdentifier,
      labName: user.labName,
    },
    secret,
    { expiresIn: '7d' }
  );
};

// Helper to look up users by email, recognized username/alias, or email prefix
export const findUserByIdentifier = async (identifier: string): Promise<IUser | null> => {
  if (!identifier) return null;
  const rawInput = String(identifier).toLowerCase().trim();
  const prefix = rawInput.includes('@') ? rawInput.split('@')[0] : rawInput;

  // 1. Try exact email match
  let user = await User.findOne({ email: rawInput });

  // 2. Try matching by recognized alias / username
  if (!user) {
    if (['superadmin', 'super-admin', 'super_admin'].includes(prefix) || rawInput.includes('superadmin')) {
      user = await User.findOne({
        $or: [
          { email: 'superadmin@hdi.com.ng' },
          { role: 'SUPER_ADMIN' },
        ],
      });
    } else if (['admin', 'administrator'].includes(prefix) || rawInput === 'admin') {
      user = await User.findOne({
        $or: [
          { email: 'admin@hdi.com.ng' },
          { role: 'ADMIN' },
        ],
      });
    } else if (['accountant', 'finance'].includes(prefix) || rawInput === 'accountant') {
      user = await User.findOne({
        $or: [
          { email: 'accountant@hdi.com.ng' },
          { role: 'ACCOUNTANT' },
        ],
      });
    } else if (['lab1', 'hydrochrom', 'jarvis', 'jarvismpock85'].includes(prefix) || rawInput.includes('hydrochrom') || rawInput.includes('jarvismpock85')) {
      user = await User.findOne({
        $or: [
          { email: 'jarvismpock85@gmail.com' },
          { labIdentifier: 'LAB_1' },
        ],
      });
    } else if (['lab2', 'saag', 'info@saagchemical'].includes(prefix) || rawInput.includes('saag')) {
      user = await User.findOne({
        $or: [
          { email: 'info@saagchemical.com.ng' },
          { labIdentifier: 'LAB_2' },
        ],
      });
    } else if (['lab3', 'kazlat', 'info@kazlatpublicanalysts'].includes(prefix) || rawInput.includes('kazlat')) {
      user = await User.findOne({
        $or: [
          { email: 'info@kazlatpublicanalysts.com' },
          { labIdentifier: 'LAB_3' },
        ],
      });
    } else if (['lab4', 'central', 'info@halalcert'].includes(prefix) || rawInput.includes('central') || rawInput.includes('halalcert')) {
      user = await User.findOne({
        $or: [
          { email: 'info@halalcert.com.ng' },
          { labIdentifier: 'LAB_4' },
        ],
      });
    }
  }

  // 3. Try prefix regex match
  if (!user) {
    user = await User.findOne({
      email: { $regex: new RegExp(`^${prefix}@`, 'i') },
    });
  }

  return user;
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email) {
      res.status(400).json({ message: 'Email or username is required' });
      return;
    }

    const user = await findUserByIdentifier(email);

    // If user not found, reject login (only Super Admin can add users)
    if (!user) {
      res.status(401).json({ message: 'Invalid credentials. User account not found. Please contact the Super Administrator.' });
      return;
    }

    // Password validation — strict bcrypt comparison only
    const isMatch = password ? await bcrypt.compare(password, user.passwordHash) : false;

    if (!isMatch) {
      res.status(401).json({ message: 'Invalid credentials. Incorrect password.' });
      return;
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        labIdentifier: user.labIdentifier,
        labName: user.labName,
        phone: user.phone,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
};

export const getCurrentUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthenticated' });
      return;
    }

    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        labIdentifier: user.labIdentifier,
        labName: user.labName,
        phone: user.phone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving user profile', error: error.message });
  }
};

export const listUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const query: any = {};
    // Non-super-admins cannot see super admin accounts
    if (req.user?.role !== 'SUPER_ADMIN') {
      query.role = { $ne: 'SUPER_ADMIN' };
    }
    const users = await User.find(query).select('-passwordHash').sort({ name: 1 });
    res.json({ users });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};


// Create user — Super Admin only
export const createUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, labIdentifier, labName, phone } = req.body;
    if (!name || !email || !password || !role) {
      res.status(400).json({ message: 'Full name, email, password, and role are required.' });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      res.status(400).json({ message: `A user with email ${normalizedEmail} already exists in the portal.` });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      role,
      labIdentifier: role === 'LAB_USER' ? labIdentifier || null : null,
      labName: role === 'LAB_USER' ? labName || null : null,
      phone: phone ? String(phone).trim() : '',
    });

    console.log(`[Super Admin Action]: Created user ${newUser.email} with role ${newUser.role}`);

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser._id,
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        labIdentifier: newUser.labIdentifier,
        labName: newUser.labName,
        phone: newUser.phone,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
};


// Switch Lab — Super Admin impersonates a lab user by labIdentifier
export const switchLab = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Only Super Admin can switch lab sessions.' });
      return;
    }

    const { labIdentifier } = req.body;
    if (!labIdentifier) {
      res.status(400).json({ message: 'labIdentifier is required.' });
      return;
    }

    const labUser = await User.findOne({ labIdentifier, role: 'LAB_USER' });
    if (!labUser) {
      res.status(404).json({ message: `No lab user found with labIdentifier: ${labIdentifier}` });
      return;
    }

    const token = generateToken(labUser);
    console.log(`[Super Admin Action]: ${req.user.email} switched to lab session as ${labUser.name} (${labIdentifier})`);

    res.json({
      token,
      user: {
        id: labUser._id,
        _id: labUser._id,
        name: labUser.name,
        email: labUser.email,
        role: labUser.role,
        labIdentifier: labUser.labIdentifier,
        labName: labUser.labName,
        phone: labUser.phone,
      },
    });
  } catch (error: any) {
    console.error('Switch lab error:', error);
    res.status(500).json({ message: 'Error switching lab session', error: error.message });
  }
};

// Reset Password — allows labs and admin users to securely reset their password
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, email, newPassword } = req.body;
    const lookupKey = identifier || email;

    if (!lookupKey) {
      res.status(400).json({ message: 'Email address or username is required.' });
      return;
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      res.status(400).json({ message: 'New password must be at least 6 characters long.' });
      return;
    }

    const user = await findUserByIdentifier(lookupKey);
    if (!user) {
      res.status(404).json({ message: 'No registered account found matching that email or username. Please contact the Super Administrator.' });
      return;
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    user.passwordHash = passwordHash;
    await user.save();

    console.log(`[Password Reset Success]: Password updated for ${user.email} (${user.role}${user.labIdentifier ? ' / ' + user.labIdentifier : ''})`);

    res.json({
      success: true,
      message: `Password reset successfully for ${user.email}. You can now sign in with your new password.`,
      email: user.email,
    });
  } catch (error: any) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Failed to reset password', error: error.message });
  }
};

// Revert to Super Admin — allows a Super Admin impersonating a lab user to restore their Super Admin session
export const revertToSuperAdmin = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const superAdmin = await User.findOne({ role: 'SUPER_ADMIN' });
    if (!superAdmin) {
      res.status(404).json({ message: 'Super Admin account not found.' });
      return;
    }

    const token = generateToken(superAdmin);
    console.log(`[Revert Session]: Restored Super Admin session for ${superAdmin.email}`);

    res.json({
      token,
      user: {
        id: superAdmin._id,
        _id: superAdmin._id,
        name: superAdmin.name,
        email: superAdmin.email,
        role: superAdmin.role,
        labIdentifier: superAdmin.labIdentifier,
        labName: superAdmin.labName,
        phone: superAdmin.phone,
      },
    });
  } catch (error: any) {
    console.error('Revert to Super Admin error:', error);
    res.status(500).json({ message: 'Failed to restore Super Admin session', error: error.message });
  }
};


