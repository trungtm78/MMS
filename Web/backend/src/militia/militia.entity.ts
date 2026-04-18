// US-SS-01: MilitiaProfile entity — aligned with 002_personnel.sql migration
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MilitiaStatus = 'active' | 'inactive' | 'leave';
export type MilitiaGender = 'male' | 'female';

@Entity('militia_profiles')
export class MilitiaProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true, default: null })
  userId: string | null;

  @Column({ name: 'militia_code', length: 30, unique: true })
  militiaCode: string;

  @Column({ name: 'full_name', length: 100 })
  fullName: string;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  cccd: string | null;

  @Column({ name: 'dob', type: 'date', nullable: true, default: null })
  dob: string | null;

  @Column({ type: 'varchar', length: 10, default: 'male' })
  gender: MilitiaGender;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  phone: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  address: string | null;

  @Column({ name: 'unit_id', type: 'uuid' })
  unitId: string;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  position: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  rank: string | null;

  @Column({ name: 'join_date', type: 'date', nullable: true, default: null })
  joinDate: string | null;

  @Column({ length: 20, default: 'active' })
  status: MilitiaStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
