import dayjs from 'dayjs'
import { Address, ITransaction, QueryTxFilterZKSpace } from '../types'
import AbstractWatch from './base.watch'
/**
# ZKSpace

* type
 * zkRollup
 
* Tokens are supported (service charges can also be set)
 * ETH、ZKS、WBTC 和 USDT
 * **Gas fee:**Each Swap transaction needs to pay $1 equivalent Gas fee, which is used to amortize the cost of aggregating and packaging the results of multiple transactions on the platform and putting data on ETH blockchain.

* Official website
 *  [zks.org](https://zks.org/) 

* Wallet (officially and test a domain name according to the link network)
 * [ZKSpace - Layer-2 for All](https://zks.app/wallet/token)

* github
 * [L2Labs · GitHub](https://github.com/l2labs)

* docs
 * [RESTful API - ZKSpace Wiki (English)](https://en.wiki.zks.org/interact-with-zkswap/restful-api)

* Block browser
 * mainnet [zkswap.info](https://zkswap.info/) 
 * rinkeby： [ZKSpace Explorer](https://v3-rinkeby.zkswap.info/)
 */
export default class ZKSpaceWatch extends AbstractWatch {
  minConfirmations: number = 1
  public async getApiFilter(address: Address): Promise<QueryTxFilterZKSpace> {
    const params:Partial<QueryTxFilterZKSpace> = {
      types: 'Transfer',
      limit: 100,
      start: 0
    }
    await this.apiScanCursor(address)
    return params as QueryTxFilterZKSpace
  }

  public async apiWatchNewTransaction(
    address: Address
  ): Promise<Array<ITransaction>> {
    const filter = await this.getApiFilter(address)
    const response = await this.chain.getTransactions(address, filter)
    const cursor = await this.apiScanCursor(address)
    const prevTxTime = cursor?.timestamp || dayjs().unix();
    return response.txlist.filter((tx) => tx.timestamp > prevTxTime);
  }
  public replayBlock(start: number, end: number, changeBlock?: Function | undefined): Promise<{ start: number; end: number }> {
    throw new Error('Method not implemented.')
  }
}
