import dayjs from 'dayjs'
import { Address, ITransaction, QueryTxFilterLoopring } from '../types'
import AbstractWatch from './base.watch'
export default class LoopringWatch extends AbstractWatch {
  minConfirmations: number
  public async getApiFilter(address: string): Promise<QueryTxFilterLoopring> {
    const filter: Partial<QueryTxFilterLoopring> = {
      start: Date.now(),
      status: 'processed,received',
      limit: 100,
      // tokenSymbol: 'ETH',
      transferTypes: 'transfer',
      end: 9999999999999,
    }
    const cursor = await this.apiScanCursor(address)
    if (cursor && cursor.timestamp) {
      filter.start = dayjs(Number(cursor.timestamp * 1000)).add(1, 'second').valueOf()
    }
    // filter.end = dayjs(filter.start).add(20, 'minute').valueOf()
    return filter as QueryTxFilterLoopring
  }
  public async apiWatchNewTransaction(
    address: Address
  ): Promise<Array<ITransaction>> {
    const filter = await this.getApiFilter(address)
    const response = await this.chain.getTransactions(address, filter)
    return response.txlist
  }
  public replayBlock(start: number, end: number, changeBlock?: Function | undefined): Promise<{ start: number; end: number }> {
    throw new Error('Method not implemented.')
  }
}
