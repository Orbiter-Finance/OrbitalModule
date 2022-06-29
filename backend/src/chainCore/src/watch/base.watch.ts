import {
  Address,
  AddressMapTransactions,
  IChain,
  IChainWatch,
  ITransaction,
  QueryTransactionsResponse,
  QueryTxFilter,
  Transaction,
} from '../types'
import PubSubMQ from '../utils/pubsub'
import logger from '../utils/logger'
import { equals, isEmpty, orderBy } from '../utils'
import Keyv from 'keyv'
import dayjs from 'dayjs'
import { IntervalTimerDecorator } from '../decorators/intervalTimer.decorator'
import KeyvFile from '../utils/keyvFile'
export default abstract class BasetWatch implements IChainWatch {
  protected watchAddress: Map<Address, any> = new Map()
  protected pushHistory: Map<
    string,
    {
      status: boolean
      time: number
    }
  > = new Map()
  protected cache: Keyv
  private rpcLastBlockHeight: number = 0
  public set setRpcLastBlockHeight(height: number) {
    if (height > this.rpcLastBlockHeight) {
      this.rpcLastBlockHeight = height
      this.cache.set(`rpcScan:${this.chain.chainConfig.chainId}`, height)
    }
  }
  abstract readonly minConfirmations: number
  constructor(public readonly chain: IChain) {
    this.cache = new Keyv({
      store: new KeyvFile({
        filename: `cache/${this.chain.chainConfig.internalId}`, // the file path to store the data
        expiredCheckDelay: 999999 * 24 * 3600 * 1000, // ms, check and remove expired data in each ms
        writeDelay: 100, // ms, batch write to disk in a specific duration, enhance write performance.
        encode: JSON.stringify, // serialize function
        decode: JSON.parse, // deserialize function
      }),
    })
  }

  public async isWatchWalletAddress(address: string): Promise<boolean> {
    return this.watchAddress.has(address.toLowerCase())
  }
  public async isWatchContractAddress(address: string): Promise<boolean> {
    const isWatchContract =
      this.chain.chainConfig.contracts.findIndex((addr) =>
        equals(addr, address)
      ) != -1
    return isWatchContract
  }
  public async isWatchTokenAddress(address: string): Promise<boolean> {
    const chainConfig = this.chain.chainConfig
    const isChainMainCoin = equals(chainConfig.nativeCurrency.address, address)
    if (isChainMainCoin) return true
    const isWatchToken =
      chainConfig.tokens.findIndex((token) => equals(token.address, address)) !=
      -1
    return isWatchToken
  }
  public abstract getApiFilter(address: Address): Promise<QueryTxFilter>
  public async init() {
    // let txlist: Array<string> = (await this.cache.get(`txlist`)) || []
    // if (txlist.length >= 1000) {
    //   txlist.splice(1000)
    // }
    // if (!Array.isArray(txlist)) txlist = []
    // txlist.forEach((hash) => {
    //   if (!this.pushHistory.has(hash.toLowerCase())) {
    //     this.pushHistory.set(hash, {
    //       status: true,
    //       time: 0,
    //     })
    //   }
    // })
    return this
  }
  public addWatchAddress(address: Array<Address> | Address) {
    if (Array.isArray(address)) {
      for (const addr of address) {
        const addrLower = addr.toLowerCase()
        if (!this.watchAddress.has(addrLower) && !isEmpty(addrLower)) {
          this.watchAddress.set(addrLower, [])
        }
      }
    } else if (typeof address === 'string') {
      const addrLower = address.toLowerCase()
      if (!this.watchAddress.has(addrLower) && !isEmpty(addrLower)) {
        this.watchAddress.set(addrLower, [])
      }
    } else {
      throw new Error('Failed to identify parameter')
    }
    return this
  }
  protected async pushMessage(address: Address, txList: Array<ITransaction>) {
    let pushTrx: Array<ITransaction> = []
    ;({ txList } = await this.pushBefore(address, txList))
    txList = txList.filter((tx) => tx.value.gt(0))
    txList.forEach((tx) => {
      if (!this.pushHistory.has(tx.hash.toLowerCase())) {
        pushTrx.push(tx)
        this.pushHistory.set(tx.hash.toLowerCase(), {
          status: false,
          time: tx.timestamp,
        })
      }
    })
    if (pushTrx.length > 0) {
      // write addrTxMap to cache
      logger.info(
        `[${this.chain.chainConfig.name}] New Transaction Pushed`,
        JSON.stringify(pushTrx)
      )
      PubSubMQ.publish(`${this.chain.chainConfig.internalId}:txlist`, pushTrx)
      // const hashList = (Array.from(this.pushHistory.keys()).reverse()).splice(10);
      // this.cache.set('txlist',hashList)
      // PubSubMQ.publish(
      //   `${this.chain.chainConfig.internalId}:txlist`,
      //   pushTrx,
      //   (hashList: Array<string>) => {
      //     if (hashList && Array.isArray(hashList)) {
      //       hashList.forEach((hash) => {
      //         if (this.pushHistory.has(hash)) {
      //           const tx = this.pushHistory.get(hash)
      //           if (tx) {
      //             tx.status = true
      //           }
      //         }
      //       })
      //       this.cache.set(
      //         'txlist',
      //         Array.from(this.pushHistory.keys()).reverse()
      //       )
      //     }
      //     logger.info(
      //       `[${this.chain.chainConfig.name}] New Transaction Pushed Save DB Success TxHash List`,
      //       JSON.stringify(hashList)
      //     )
      //   }
      // )
      //
      pushTrx = orderBy(pushTrx, ['timestamp', 'blockNumber'], ['desc', 'desc'])
      this.pushAfter(address, pushTrx)
    }
    return pushTrx
  }
  protected async pushBefore(address: Address, txList: Array<ITransaction>) {
    return { address, txList }
  }
  protected pushAfter(address: Address, txList: Array<ITransaction>) {
    return { address, txList }
  }
  public async apiWatchNewTransaction(
    address: Address
  ): Promise<Array<ITransaction>> {
    const trxList: Array<ITransaction> = []
    const filter = await this.getApiFilter(address)
    try {
      const response = await this.chain.getTokenTransactions(
        address,
        null,
        filter
      )
      trxList.push(...response.txlist)
    } catch (error) {
      logger.error(
        `[${this.chain.chainConfig.name}] apiWatchNewTransaction getTokenTransactions error: ${error.message}`
      )
    }
    try {
      const response: QueryTransactionsResponse =
        await this.chain.getTransactions(address, filter)
      trxList.push(...response.txlist)
    } catch (error) {
      logger.error(
        `[${this.chain.chainConfig.name}] apiWatchNewTransaction getTransactions error: ${error.message}`
      )
    }
    return trxList.filter((tx) => tx.value.gt(0))
  }
  public async apiScanCursor(
    address: Address,
    trx?: ITransaction
  ): Promise<ITransaction | null> {
    const cursorKey = `ApiCursor:${address}`
    let cursorTx: ITransaction = await this.cache.get(cursorKey)
    if (trx && trx.hash) {
      if (
        cursorTx &&
        (cursorTx.blockNumber > trx.blockNumber ||
          Number(cursorTx.timestamp) > Number(trx.timestamp))
      ) {
        return null
      }
      this.cache.set(cursorKey, {
        blockNumber: trx.blockNumber,
        hash: trx.hash,
        timestamp: trx.timestamp,
      })
      return trx
    } else {
      // get cursor
      if (!isEmpty(cursorTx)) {
        return cursorTx
      }
      //
      let blockNumber: number = 0
      try {
        blockNumber = await this.chain.getLatestHeight()
      } catch (error) {
        logger.error(
          `[${this.chain.chainConfig.name}] init apiScanCursor get LastHeight error:`,
          error.message
        )
      }
      // TAG:blockNumber Whether + 1 is needed needs to be considered
      const nowTx: Pick<Transaction, 'blockNumber' | 'timestamp' | 'hash'> = {
        blockNumber: blockNumber,
        hash: '',
        timestamp: dayjs().unix(),
      }
      this.cache.set(cursorKey, nowTx)
      return nowTx as Transaction
    }
  }

  @IntervalTimerDecorator
  public async apiScan(): Promise<any> {
    if (this.watchAddress.size <= 0) {
      logger.error(
        `[${this.chain.chainConfig.name}] Api Scan Missing address parameter`
      )
      return []
    }
    let queryTxs: Array<ITransaction> = []
    for (const address of this.watchAddress.keys()) {
      const prevCursor = await this.apiScanCursor(address)
      if (prevCursor) {
        // exec query trx
        this.chain.chainConfig.debug &&
          logger.info(
            `[${this.chain.chainConfig.name}] API Query Transaction in Progress : makerAddress=${address},blockNumber=${prevCursor.blockNumber},timestamp=${prevCursor.timestamp}`
          )
        queryTxs = await this.apiWatchNewTransaction(address)
        await this.pushMessage(address, queryTxs)
        const latest = orderBy(
          queryTxs,
          ['timestamp', 'blockNumber'],
          ['desc', 'desc']
        )[0]
        await this.apiScanCursor(address, latest)
      }
    }
    return queryTxs
  }
  public abstract replayBlock(
    start: number,
    end: number,
    changeBlock?: Function
  ): Promise<{ start: number; end: number }>
  @IntervalTimerDecorator
  public async rpcScan() {
    const currentBlockCacheKey = `rpcScan:${this.chain.chainConfig.chainId}`
    const latestHeight = await this.chain.getLatestHeight()
    if (!this.rpcLastBlockHeight || this.rpcLastBlockHeight <= 0) {
      // get cache height
      let cacheBlock = await this.cache.get(currentBlockCacheKey)
      if (!cacheBlock) {
        cacheBlock = latestHeight
      }
      this.setRpcLastBlockHeight = cacheBlock
    }
    const currentBlockHeight = this.rpcLastBlockHeight
    const isScan = latestHeight - currentBlockHeight + 1 > this.minConfirmations
    if (isScan) {
      const result = await this.replayBlock(
        currentBlockHeight,
        latestHeight,
        (blockNumber: number, txmap: AddressMapTransactions) => {
          if (blockNumber && blockNumber > 0) {
            this.setRpcLastBlockHeight = blockNumber
          }
          if (txmap && txmap.size > 0) {
            txmap.forEach(async (txlist, address) => {
              this.pushMessage(address, txlist)
              if (txlist.length > 0) {
                this.chain.chainConfig.debug &&
                  logger.info(
                    `[${this.chain.chainConfig.name}] RpcScan New Transaction: Cursor = ${blockNumber} `,
                    txlist.map((tx) => tx.hash)
                  )
              }
            })
          }
        }
      )
      this.chain.chainConfig.debug &&
        logger.info(
          `[${this.chain.chainConfig.name}] rpcScan End of scan result：`,
          result
        )
      return result
    }
    return {
      start: currentBlockHeight,
      end: latestHeight,
    }
  }
}
