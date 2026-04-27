import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

@Entity('weapons')
export class WeaponItem {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 100 })
  type: string

  @Column({ type: 'varchar', length: 100 })
  serialNumber: string

  @Column({ type: 'date' })
  acquiredAt: string

  @Column({ type: 'varchar', length: 20, default: 'good' })
  condition: 'good' | 'damaged' | 'maintenance'

  @Column({ type: 'varchar', length: 200 })
  storageLocation: string

  @Column({ type: 'uuid', nullable: true })
  responsiblePersonId: string | null

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
