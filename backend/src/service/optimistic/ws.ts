import { AlchemyWeb3, createAlchemyWeb3 } from '@alch/alchemy-web3'
import { makerConfig } from '../../config'

export interface Transaction {}
type Address = String
export default class OptimisticWS {
  static txList: Map<Address, Array<Transaction>> = new Map()
  static web3: AlchemyWeb3
  constructor(addressList: Array<Address>, ws: string) {
    for (const address of addressList) {
      //
      OptimisticWS.txList.set(address, [])
    }
    if (!OptimisticWS.web3) {
      OptimisticWS.web3 = createAlchemyWeb3(ws)
    }
  }
  run() {
    /// 订阅
  }
}
