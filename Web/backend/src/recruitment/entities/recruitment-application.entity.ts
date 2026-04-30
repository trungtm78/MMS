import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type ApplicationStatus = 'new' | 'reviewing' | 'approved' | 'rejected';

@Entity('recruitment_applications')
export class RecruitmentApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'int', nullable: true, default: null })
  age: number | null;

  @Column({ type: 'text', nullable: true, default: null })
  address: string | null;

  @Column({ length: 20, nullable: true, default: null })
  phone: string | null;

  @Column({ length: 100, nullable: true, default: null })
  email: string | null;

  @Column({ name: 'id_number', length: 20, nullable: true, default: null })
  idNumber: string | null;

  @Column({ length: 100, nullable: true, default: null })
  district: string | null;

  @Column({ name: 'apply_date', type: 'date' })
  applyDate: string;

  @Column({ type: 'varchar', length: 20, default: 'new' })
  status: ApplicationStatus;

  @Column({ name: 'reviewer_notes', type: 'text', nullable: true, default: null })
  reviewerNotes: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true, default: null })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true, default: null })
  reviewedAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true, default: null })
  createdBy: string | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
