import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('organization_units')
export class OrganizationUnit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  type: 'tieu_doi' | 'trung_doi' | 'dai_doi';

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ name: 'commander_id', type: 'uuid', nullable: true })
  commanderId: string | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ type: 'int', default: 0 })
  capacity: number;

  @Column({ name: 'ward_id', type: 'varchar', nullable: true })
  wardId: string | null;

  @ManyToOne(() => OrganizationUnit, (unit) => unit.children, {
    nullable: true,
  })
  @JoinColumn({ name: 'parent_id' })
  parent: OrganizationUnit | null;

  @OneToMany(() => OrganizationUnit, (unit) => unit.parent)
  children: OrganizationUnit[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
