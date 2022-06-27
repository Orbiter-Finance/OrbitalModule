import dayjs from 'dayjs'
import { Address, QueryTxFilterIMX, ITransaction } from '../types'
import BasetWatch from './base.watch'
export default class ImmutableXWatch extends BasetWatch {
  minConfirmations: number

  public async getApiFilter(address: Address): Promise<QueryTxFilterIMX> {
    const params: Partial<QueryTxFilterIMX> = {
      page_size: 100,
      direction: 'desc',
    }
    await this.apiScanCursor(address)
    return params as QueryTxFilterIMX
  }

  public async apiWatchNewTransaction(
    address: Address
  ): Promise<Array<ITransaction>> {
    const filter: any = await this.getApiFilter(address)
    const response = await this.chain.getTransactions(address, filter)
    const cursor = await this.apiScanCursor(address)
    const prevTxTime = cursor?.timestamp || dayjs().unix();
    return response.txlist.filter((tx) => tx.timestamp > prevTxTime);
  }
  public replayBlock(start: number, end: number, changeBlock?: Function | undefined): Promise<{ start: number; end: number }> {
    throw new Error('Method not implemented.')
  }
}
