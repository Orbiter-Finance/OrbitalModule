import { EVMChain } from '../chain/evm-chain.service'
import {
  Address,
  AddressMapTransactions,
  IEVMChain,
  QueryTxFilterEther,
} from '../types'
import logger from '../utils/logger'
import BasetWatch from './base.watch'

export default abstract class EVMWatchBase extends BasetWatch {
  minConfirmations: number = 1
  constructor(public readonly chain: IEVMChain) {
    super(chain)
  }
  public async getApiFilter(address: Address): Promise<QueryTxFilterEther> {
    const params: Partial<QueryTxFilterEther> = {
      address,
      sort: 'asc',
      page: 1,
      offset: 100,
    }
    const cursor = await this.apiScanCursor(address)
    if (cursor) {
      params.startblock = Number(cursor.blockNumber) + 1
    }
    return params as QueryTxFilterEther
  }

  public async replayBlockTransaction(
    hashOrTx: string | any
  ): Promise<AddressMapTransactions> {
    const txmap: AddressMapTransactions = new Map()
    let originTx =
      typeof hashOrTx === 'string'
        ? await (<EVMChain>this.chain).getWeb3().eth.getTransaction(hashOrTx)
        : hashOrTx
    if (!originTx || !originTx.to) {
      return txmap
    }
    try {
      let isMatchTx = await this.isWatchWalletAddress(originTx.from)
      if (!isMatchTx && (await this.isWatchWalletAddress(originTx.to))) {
        isMatchTx = true
      }
      if (await this.isWatchContractAddress(originTx.to)) {
        isMatchTx = true
      }
      if (!isMatchTx && originTx.input.length >= 138) {
        // match2
        for (const address of Array.from(this.watchAddress.keys())) {
          if (originTx.input.includes(address.substring(2))) {
            if (await this.isWatchTokenAddress(originTx.to)) {
              isMatchTx = true
              break
            }
          }
        }
      }
      if (!isMatchTx) {
        return txmap
      }
      const trx = await this.chain.convertTxToEntity(originTx)
      if (!trx) {
        return txmap
      }
      let matchAddress = ''
      if (await this.isWatchWalletAddress(trx.from)) {
        matchAddress = trx.from
      } else if (await this.isWatchWalletAddress(trx.to)) {
        matchAddress = trx.to
      }
      if (!matchAddress) {
        logger.info(
          `[${this.chain.chainConfig.name}] Matched but the resolved transaction failed to match: Addrss=${matchAddress}`,
          JSON.stringify(trx)
        )
        return txmap
      }
      matchAddress = matchAddress.toLowerCase()
      logger.info(
        `[${this.chain.chainConfig.name}] replayBlock Match Transaction:Addrss=${matchAddress},matchAddress Hash=${originTx.hash}`
      )
      if (!txmap.has(matchAddress)) txmap.set(matchAddress, [])
      txmap.get(matchAddress)?.push(trx)
      return txmap
    } catch (error) {
      throw error
    }
  }

  public async replayBlock(
    start: number,
    end: number,
    changeBlock?: Function
  ): Promise<{ start: number; end: number }> {
    try {
      const web3 = (<EVMChain>this.chain).getWeb3()
      const config = this.chain.chainConfig
      config.debug && logger.info(`[${config.name}] Start replayBlock ${start}/${end - this.minConfirmations}/${end}`)
      while (start <= end - this.minConfirmations) {
        try {
          let timestamp = Date.now()
          config.debug &&
            logger.debug(
              `[${config.name} - replayBlock - GgetBlockBefore] Block:${start}/${end - this.minConfirmations}/${end},, timestamp:${timestamp}`
            )
          const block = await web3.eth.getBlock(start, true)
          config.debug &&
            logger.debug(
              `[${config.name} - replayBlock - GetBlockAfter] Block:${start}/${end - this.minConfirmations}/${end}, timestamp:${timestamp},Spend time:${
                (Date.now() - timestamp) / 1000 + '/s'
              }`
            )
          if (block) {
            const { transactions } = block
            config.debug && logger.info(
              `[${config.name} - replayBlock (${start}/${end- this.minConfirmations}/${end}), Trxs Count : ${transactions.length}`
            )
            const txmap: AddressMapTransactions = new Map()
            for (const tx of transactions) {
              // Filter non whitelist address transactions
              const matchTxList = await this.replayBlockTransaction(tx)
              matchTxList.forEach((txlist, address) => {
                if (!txmap.has(address)) txmap.set(address, [])
                txmap.get(address)?.push(...txlist)
              })
            }
            changeBlock && changeBlock(start, txmap)
            config.debug &&
              logger.debug(
                `[${config.name} - replayBlock - complete] Block:${start}, Latest:${end}, Next Block:${
                  start + 1
                }, timestamp:${timestamp},Spend time:${
                  (Date.now() - timestamp) / 1000 + '/s'
                }`
              )
            start++
          }
        } catch (error) {
          console.error(error)
          logger.error(`[${config.name}] replayBlock Error:`, error.message)
        }
      }
      return { start, end }
    } catch (error) {
      throw error
    }
  }

}
