import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'

@Entity('organization_units')
export class OrganizationUnit {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 20 })
  type: 'tieu_doi' | 'trung_doi' | 'dai_doi'

  @Column({ type: 'varchar', length: 200 })
  name: string

  @Column({ type: 'uuid', nullable: true })
  commanderId: string | null

  @Column({ type: 'uuid', nullable: true })
  parentId: string | null

  @Column({ type: 'int', default: 0 })
  capacity: number

  @Column({ type: 'varchar', nullable: true })
  wardId: string | null

  @ManyToOne(() => OrganizationUnit, unit => unit.children, { nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent: OrganizationUnit | null

  @OneToMany(() => OrganizationUnit, unit => unit.parent)
  children: OrganizationUnit[]

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
