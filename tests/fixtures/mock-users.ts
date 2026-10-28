import type { SafeUser, UserRecord } from '@/lib/user-store';

/**
 * Test-only fixtures for mock users.
 * These fixtures must NEVER be imported or accessible in production code.
 */
export const MOCK_SUPERADMIN_FIXTURE: SafeUser = {
  id: 'usr_t33rx0x6mvs5qy0a',
  username: 'superboss',
  email: 'superboss@dyt-ecosystem.local',
  displayName: 'System Owner Super Admin',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  mustChangePassword: false,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

export const MOCK_NORMALUSER_FIXTURE: SafeUser = {
  id: 'usr_c6gqttx7mvs5qy6q',
  username: 'normaluser',
  email: 'normaluser@dyt-ecosystem.local',
  displayName: 'Normal User',
  role: 'USER',
  status: 'ACTIVE',
  mustChangePassword: false,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

export const MOCK_SUPERADMIN_RECORD: UserRecord = {
  ...MOCK_SUPERADMIN_FIXTURE,
  passwordHash: '$2b$12$e7k/aM6r3qFq8PjZ5wA9reL1oGv4H6t2I9j0K1l2M3n4O5p6Q7r8S',
};

export const MOCK_NORMALUSER_RECORD: UserRecord = {
  ...MOCK_NORMALUSER_FIXTURE,
  passwordHash: '$2b$12$e7k/aM6r3qFq8PjZ5wA9reL1oGv4H6t2I9j0K1l2M3n4O5p6Q7r8S',
};
