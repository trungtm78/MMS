// US-W012: Audit log entity — aligned with actual MMS DB schema (audit_logs table)
// Immutable: no update/delete operations
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId: string;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true, default: null })
  entityId: string | null;

  @Column({ name: 'before_json', type: 'jsonb', nullable: true, default: null })
  beforeJson: Record<string, unknown> | null;

  @Column({ name: 'after_json', type: 'jsonb', nullable: true, default: null })
  afterJson: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 45, nullable: true, default: null })
  ip: string | null;

  @Column({ type: 'text', nullable: true, default: null, name: 'user_agent' })
  userAgent: string | null;

  @Column({
    name: 'request_id',
    type: 'varchar',
    length: 100,
    nullable: true,
    default: null,
  })
  requestId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
