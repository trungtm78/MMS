// US-W001 AC-3: Sessions entity — aligned with actual MMS DB schema (sessions table)
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ name: 'refresh_token_hash', length: 500 })
  refreshTokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({
    name: 'revoked_at',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  revokedAt: Date | null;

  @Column({ type: 'varchar', length: 45, nullable: true, default: null })
  ip: string | null;

  @Column({ type: 'text', nullable: true, default: null, name: 'user_agent' })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
