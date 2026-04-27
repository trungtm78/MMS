import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity('weapon_allocations')
export class WeaponAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  weaponId: string

  @Column({ type: 'uuid' })
  recipientId: string

  @Column({ type: 'timestamp' })
  issuedAt: Date

  @Column({ type: 'varchar', length: 500 })
  purpose: string

  @Column({ type: 'timestamp', nullable: true })
  returnedAt: Date | null

  @CreateDateColumn()
  createdAt: Date
}
