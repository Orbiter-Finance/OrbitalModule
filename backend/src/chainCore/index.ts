import { IChain } from './src/types/chain'
import { IChainConfig, IChainWatch } from './src/types'
import { Chain } from './src/utils'
import logger from './src/utils/logger'
import PubSubMQ, { PubSub } from './src/utils/pubsub'
import { ChainFactory } from './src/watch/chainFactory'
import BasetWatch from './src/watch/base.watch'
export interface IScanChainItem {
  address: string
  intranetId: string
  chainId: string
}
export class ScanChainMain {
  public mq: PubSub = PubSubMQ
  private static taskChain: Map<string, IChainWatch> = new Map()
  constructor(configs: Array<IChainConfig>) {
    if (!Array.isArray(configs)) {
      throw new Error('Chain Config Error')
    }
    Chain.configs = configs
  }
  public async startScanChain(
    intranetId: string,
    addressList?: Array<string>
  ): Promise<IChainWatch | null> {
    try {
      let watchService: IChainWatch | null
      if (ScanChainMain.taskChain.has(intranetId)) {
        watchService = ScanChainMain.taskChain.get(intranetId) || null
      } else {
        watchService = ChainFactory.createWatchChainByIntranetId(intranetId)
        await watchService?.init()
        const chainConfig = watchService.chain.chainConfig
        if (Array.isArray(chainConfig.watch) && chainConfig.watch.length > 0) {
          // await watchService.init()
          try {
            chainConfig.watch.includes('api') && watchService.apiScan()
          } catch (error: any) {
            logger.error('Start API Scan Exception:', error.message)
          }
          try {
            chainConfig.watch.includes('rpc') && watchService.rpcScan()
          } catch (error: any) {
            logger.error('Start RPC Scan Exception:', error.message)
          }
        }
      }
      addressList && watchService?.addWatchAddress(addressList)
      logger.info(
        `startScanChain Run Start: intranetId:${intranetId}, addressList:${JSON.stringify(
          addressList
        )}`
      )
      return watchService
    } catch (error: any) {
      logger.error(
        `startScanChain Run Error:${
          error.message
        }, intranetId:${intranetId}, addressList:${JSON.stringify(addressList)}`
      )
    }
    return null
  }
}

process.on('uncaughtException', (err: Error) => {
  logger.error('Global Uncaught exception:', err)
})

process.on('unhandledRejection', (err: Error, promise) => {
  logger.error(
    'There are failed functions where promise is not captured：',
    err.message
  )
})
