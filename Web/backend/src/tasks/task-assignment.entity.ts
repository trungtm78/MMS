// US-SS-06: TaskAssignment entity — aligned with 003_tasks.sql
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type AssignmentStatus =
  | 'assigned'
  | 'accepted'
  | 'rejected'
  | 'in_progress'
  | 'completed';

@Entity('task_assignments')
export class TaskAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @Column({ name: 'assignee_id', type: 'uuid' })
  assigneeId: string; // references users.id

  @Column({ name: 'assigned_by', type: 'uuid' })
  assignedBy: string;

  @Column({ length: 20, default: 'assigned' })
  status: AssignmentStatus;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt: Date;

  @Column({
    name: 'accepted_at',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  acceptedAt: Date | null;

  @Column({
    name: 'completed_at',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  note: string | null;
}
