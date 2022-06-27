import { Transaction } from '../types'
import { EvmExplorerService } from './evm-explorer.service'

export class Optimism extends EvmExplorerService {
  public async convertTxToEntity(trx: any): Promise<Transaction | null> {
    const txData = await super.convertTxToEntity(trx)
    if (txData) {
      const trxRcceipt = await this.web3.eth.getTransactionReceipt(txData.hash)
      const gasUsed = trxRcceipt.gasUsed
      txData.fee =
        Number(gasUsed) * Number(txData.gasPrice) +
        Number(trxRcceipt['l1GasUsed']) *
          Number(trxRcceipt['l1GasPrice']) *
          Number(trxRcceipt['l1FeeScalar'])
    }
    return txData
  }
}
