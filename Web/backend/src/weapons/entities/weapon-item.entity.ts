import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('weapons')
export class WeaponItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ name: 'serial_number', type: 'varchar', length: 100 })
  serialNumber: string;

  @Column({ name: 'acquired_at', type: 'date' })
  acquiredAt: string;

  @Column({ type: 'varchar', length: 20, default: 'good' })
  condition: 'good' | 'damaged' | 'maintenance';

  @Column({ name: 'storage_location', type: 'varchar', length: 200 })
  storageLocation: string;

  @Column({ name: 'responsible_person_id', type: 'uuid', nullable: true })
  responsiblePersonId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'retired' | 'maintenance';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
