import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { CommonEntity } from './common'

@Index('compare_data_1', [
  'makerAddress',
  'fromAddress',
  'toAddress',
  'amount_flag',
  'nonce',
  'tx_status',
])
@Index('compare_data_2', [
  'chainId',
  'makerAddress',
  'fromAddress',
  'toAddress',
  'amount',
  'amount_flag',
  'tx_status',
])
@Index('save_pull_find', ['chainId', 'makerAddress', 'tokenAddress', 'txHash'])
@Index('get_maker_pulls_1', ['makerAddress', 'fromAddress', 'txTime'])
@Index('get_maker_pulls_0', ['makerAddress', 'toAddress', 'txTime'])
@Entity()
export class MakerPull extends CommonEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column('int', { width: 11, default: 0 })
  chainId: number

  @Column('varchar', { length: 128, default: '0x' })
  makerAddress: string

  @Column('varchar', { length: 128, default: '' })
  tokenAddress: string

  @Column('text')
  data: string

  @Column('varchar', { length: 32, default: '' })
  amount: string

  @Column('varchar', { length: 10, default: '' })
  amount_flag: string

  @Column('varchar', { length: 10, default: '' })
  nonce: string

  @Column('varchar', { length: 128, default: '' })
  fromAddress: string

  @Column('varchar', { length: 128, default: '' })
  toAddress: string

  @Column('varchar', { length: 255, default: '' })
  txBlock: string

  @Column('varchar', { length: 255, default: '' })
  txHash: string

  @Column('json', { default: null })
  txExt: { type: string; value: string }

  @Column('varchar', { default: null })
  userReceive: string;
  @Column('varchar', { default: null })
  makerSender: string;
  @Column('varchar', { default: null })
  symbol: string;
  @Column('timestamp', { default: null })
  txTime: Date

  @Column('varchar', { length: 40, default: '' })
  gasCurrency: string // ex: USDC ETH

  @Column('varchar', { length: 40, default: '0' })
  gasAmount: string // gas's ether

  @Column('varchar', { length: 11, default: null })
  tx_status: string // committed, finalized, rejected
}
