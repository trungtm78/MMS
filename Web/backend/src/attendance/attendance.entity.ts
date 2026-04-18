// US-SS-07: AttendanceRecord entity — aligned with 004_attendance_gps.sql
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AttendanceStatus =
  | 'checked_in'
  | 'checked_out'
  | 'late'
  | 'early_leave'
  | 'absent';
export type AttendanceSource = 'mobile' | 'web' | 'manual';

@Entity('attendance_records')
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'militia_id', type: 'uuid' })
  militiaId: string;

  @Column({ name: 'work_date', type: 'date' })
  workDate: string;

  @Column({
    name: 'checkin_at',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  checkinAt: Date | null;

  @Column({
    name: 'checkout_at',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  checkoutAt: Date | null;

  @Column({ length: 20, default: 'manual' })
  source: AttendanceSource;

  @Column({ length: 20, default: 'checked_in' })
  status: AttendanceStatus;

  @Column({
    name: 'work_hours',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    default: null,
  })
  workHours: number | null;

  @Column({ type: 'text', nullable: true, default: null })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
