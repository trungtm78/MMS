// US-W001, US-W002: User entity — aligned with actual MMS DB schema
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { RoleCode } from '../../common/constants/roles';

// One list shared with the RBAC guard and the role catalogue migration
export type UserRole = RoleCode;
export type UserStatus = 'active' | 'inactive' | 'suspended';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true, length: 50 })
  username: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  phone: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true, default: null })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: UserStatus;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Virtual fields — populated via query joins, not DB columns
  role?: UserRole;
  unitScope?: string | null;
}
