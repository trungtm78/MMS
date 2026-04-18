// US-SS-06: Task entity — aligned with 003_tasks.sql
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TaskType =
  | 'patrol'
  | 'guard'
  | 'inspection'
  | 'support'
  | 'training'
  | 'admin'
  | 'other';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'overdue';

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  @Column({ length: 50 })
  type: TaskType;

  @Column({ length: 20, default: 'medium' })
  priority: TaskPriority;

  @Column({ length: 20, default: 'pending' })
  status: TaskStatus;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  deadline: Date | null;

  @Column({ name: 'unit_id', type: 'uuid', nullable: true, default: null })
  unitId: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({
    name: 'completed_at',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  completedAt: Date | null;
}
