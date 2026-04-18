import { queryOne, queryMany } from '../db/pool';
import { hashPassword } from '../utils/password';

export interface UserProfile {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MilitiaProfile {
  id: string;
  userId: string | null;
  militiaCode: string;
  fullName: string;
  cccd: string;
  dob: Date;
  gender: string | null;
  phone: string | null;
  address: string | null;
  unitId: string;
  unitName: string;
  position: string | null;
  rank: string | null;
  joinDate: Date;
  status: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
}

export async function getUserById(userId: string): Promise<UserProfile | null> {
  const user = await queryOne<{
    id: string;
    username: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
    status: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, username, full_name, email, phone, avatar_url, status, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId]
  );

  if (!user) return null;

  const roles = await queryMany<{ code: string }>(
    `SELECT r.code FROM roles r
     JOIN user_roles ur ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );

  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatar_url,
    status: user.status,
    roles: roles.map(r => r.code),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

export async function updateUserProfile(
  userId: string,
  data: { fullName?: string; email?: string; phone?: string }
): Promise<UserProfile | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (data.fullName) {
    updates.push(`full_name = $${paramCount++}`);
    values.push(data.fullName);
  }
  if (data.email !== undefined) {
    updates.push(`email = $${paramCount++}`);
    values.push(data.email);
  }
  if (data.phone !== undefined) {
    updates.push(`phone = $${paramCount++}`);
    values.push(data.phone);
  }

  if (updates.length === 0) {
    return getUserById(userId);
  }

  updates.push(`updated_at = NOW()`);
  values.push(userId);

  await queryOne(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
    values
  );

  return getUserById(userId);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const user = await queryOne<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  const { verifyPassword } = await import('../utils/password');
  const isValid = await verifyPassword(currentPassword, user.password_hash);
  
  if (!isValid) {
    return { success: false, error: 'Current password is incorrect' };
  }

  const hashedPassword = await hashPassword(newPassword);
  await queryOne(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [hashedPassword, userId]
  );

  return { success: true };
}

export async function getMilitiaProfile(userId: string): Promise<MilitiaProfile | null> {
  const profile = await queryOne<{
    id: string;
    user_id: string | null;
    militia_code: string;
    full_name: string;
    cccd: string;
    dob: Date;
    gender: string | null;
    phone: string | null;
    address: string | null;
    unit_id: string;
    unit_name: string;
    position: string | null;
    rank: string | null;
    join_date: Date;
    status: string;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_relationship: string | null;
  }>(
    `SELECT mp.*, u.name as unit_name
     FROM militia_profiles mp
     JOIN units u ON mp.unit_id = u.id
     WHERE mp.user_id = $1`,
    [userId]
  );

  if (!profile) return null;

  return {
    id: profile.id,
    userId: profile.user_id,
    militiaCode: profile.militia_code,
    fullName: profile.full_name,
    cccd: profile.cccd,
    dob: profile.dob,
    gender: profile.gender,
    phone: profile.phone,
    address: profile.address,
    unitId: profile.unit_id,
    unitName: profile.unit_name,
    position: profile.position,
    rank: profile.rank,
    joinDate: profile.join_date,
    status: profile.status,
    emergencyContactName: profile.emergency_contact_name,
    emergencyContactPhone: profile.emergency_contact_phone,
    emergencyContactRelationship: profile.emergency_contact_relationship,
  };
}

export async function getMilitiaProfileById(militiaId: string): Promise<MilitiaProfile | null> {
  const profile = await queryOne<{
    id: string;
    user_id: string | null;
    militia_code: string;
    full_name: string;
    cccd: string;
    dob: Date;
    gender: string | null;
    phone: string | null;
    address: string | null;
    unit_id: string;
    unit_name: string;
    position: string | null;
    rank: string | null;
    join_date: Date;
    status: string;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_relationship: string | null;
  }>(
    `SELECT mp.*, u.name as unit_name
     FROM militia_profiles mp
     JOIN units u ON mp.unit_id = u.id
     WHERE mp.id = $1`,
    [militiaId]
  );

  if (!profile) return null;

  return {
    id: profile.id,
    userId: profile.user_id,
    militiaCode: profile.militia_code,
    fullName: profile.full_name,
    cccd: profile.cccd,
    dob: profile.dob,
    gender: profile.gender,
    phone: profile.phone,
    address: profile.address,
    unitId: profile.unit_id,
    unitName: profile.unit_name,
    position: profile.position,
    rank: profile.rank,
    joinDate: profile.join_date,
    status: profile.status,
    emergencyContactName: profile.emergency_contact_name,
    emergencyContactPhone: profile.emergency_contact_phone,
    emergencyContactRelationship: profile.emergency_contact_relationship,
  };
}


export async function getMilitiaProfileByUserId(userId: string): Promise<{ id: string } | null> {
  return queryOne<{ id: string }>(
    'SELECT id FROM militia_profiles WHERE user_id = $1',
    [userId]
  );
}
