import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

@Entity('exemptions')
export class Exemption {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  militiaId: string

  @Column({ type: 'varchar', length: 20 })
  type: 'exemption' | 'deferral'

  @Column({ type: 'text' })
  reason: string

  @Column({ type: 'varchar', length: 500 })
  legalBasis: string

  @Column({ type: 'date' })
  effectiveDate: string

  @Column({ type: 'date', nullable: true })
  expiryDate: string | null

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'expired' | 'revoked'

  @Column({ type: 'simple-array', nullable: true })
  documents: string[]

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
