import {
  BaseEntity,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
} from 'typeorm'

export abstract class CommonEntity extends BaseEntity {
  // ↓ common ↓
  @Column('int', { default: 0 })
  created_by: number

  @Column('int', { default: 0 })
  updated_by: number

  @Column('timestamp', {
    default: null,
  })
  published_at?: Date

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date

  @DeleteDateColumn()
  deleted_at?: Date
}
