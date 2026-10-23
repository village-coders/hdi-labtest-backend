import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';

export const seedDatabase = async (): Promise<void> => {
  try {
    console.log('[Seeder]: Checking and initializing default system accounts...');

    const salt = await bcrypt.genSalt(10);
    const defaultPasswordHash = await bcrypt.hash('password123', salt);

    // Seed only the essential system accounts if they do not already exist.
    // Super Admin should add all other users (admin staff, accountants, etc.) manually.
    const systemAccounts = [
      {
        name: 'Super Administrator',
        email: 'superadmin@hdi.com.ng',
        passwordHash: defaultPasswordHash,
        role: 'SUPER_ADMIN' as const,
        phone: '',
      },
      // 4 accredited laboratory partner accounts
      {
        name: 'Hydrochrom Analytical Services Limited',
        email: 'jarvismpock85@gmail.com',
        passwordHash: defaultPasswordHash,
        role: 'LAB_USER' as const,
        labIdentifier: 'LAB_1',
        labName: 'Hydrochrom Analytical Services Limited',
        phone: '',
      },
      {
        name: 'SAAG Chemical Nigeria Limited (SNCL)',
        email: 'info@saagchemical.com.ng',
        passwordHash: defaultPasswordHash,
        role: 'LAB_USER' as const,
        labIdentifier: 'LAB_2',
        labName: 'SAAG Chemical Nigeria Limited (SNCL)',
        phone: '',
      },
      {
        name: 'Kazlat Public Analyst Laboratory',
        email: 'info@kazlatpublicanalysts.com',
        passwordHash: defaultPasswordHash,
        role: 'LAB_USER' as const,
        labIdentifier: 'LAB_3',
        labName: 'Kazlat Public Analyst Laboratory',
        phone: '',
      },
      {
        name: 'Central Halal Laboratory',
        email: 'info@halalcert.com.ng',
        passwordHash: defaultPasswordHash,
        role: 'LAB_USER' as const,
        labIdentifier: 'LAB_4',
        labName: 'Central Halal Laboratory',
        phone: '',
      },
    ];

    for (const account of systemAccounts) {
      const existing = await User.findOne({ email: account.email });
      if (!existing) {
        await User.create(account);
        console.log(`[Seeder]: Created system account — ${account.name} (${account.role})`);
      } else {
        // Only refresh role and lab binding, never overwrite password of an existing account
        existing.role = account.role as any;
        if ((account as any).labIdentifier) existing.labIdentifier = (account as any).labIdentifier;
        if ((account as any).labName) existing.labName = (account as any).labName;
        await existing.save();
      }
    }

    console.log('[Seeder]: System accounts verified. All other users managed by Super Administrator.');
  } catch (error) {
    console.error('[Seeder Error]:', error);
  }
};
