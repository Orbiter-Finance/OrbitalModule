import chains from '../chain'
import { getChainByInternalId } from '../utils/chains'
import BasetWatch from './base.watch'
import ArbitrumWatch from './arbitrum.watch'
import BobaWatch from './boba.watch'
import ZKSyncWatch from './zksync.watch'
import ZKSpaceWatch from './zkspace.watch'
import DydxWatch from './dydx.watch'
import MetisWatch from './metis.watch'
import PolygonWatch from './polygon.watch'
import OptimismWatch from './optimism.watch'
import EthereumWatch from './ethereum.watch'
import { IChainConfig } from '../types'
import ZKSync2Watch from './zksync2.watcht'
import LoopringWatch from './loopring.watch'
import ImmutableXWatch from './immutableX.watch'
import StarknetWatch from './starknet.watch'

export class ChainFactory {
  static createWatchChainByIntranetId(
    intranetChainId: IChainConfig['internalId']
  ): BasetWatch {
    let watchChain: BasetWatch | null
    const chainConfig = getChainByInternalId(intranetChainId)
    if (!chainConfig) {
      throw new Error(
        `Internal public Chain ID profile not found ${intranetChainId}`
      )
    }
    switch (chainConfig.internalId) {
      case '1':
      case '5':
        watchChain = new EthereumWatch(new chains.EthereumChain(chainConfig))
        break
      case '2':
      case '22':
        watchChain = new ArbitrumWatch(new chains.ArbitrumChain(chainConfig))
        break
      case '3':
      case '33':
        watchChain = new ZKSyncWatch(new chains.ZKSyncChain(chainConfig))
        break
      case '4':
      case '44':
        watchChain = new StarknetWatch(new chains.StartknetChain(chainConfig))
        break
      case '6':
      case '66':
        watchChain = new PolygonWatch(new chains.PolygonChain(chainConfig))
        break
      case '7':
      case '77':
        watchChain = new OptimismWatch(new chains.OptimismChain(chainConfig))
        break
      case '8':
      case '88':
        watchChain = new ImmutableXWatch(
          new chains.ImmutableXChain(chainConfig)
        )
        break
      case '9':
      case '99':
        watchChain = new LoopringWatch(new chains.LoopringChain(chainConfig))
        break
      case '10':
      case '510':
        watchChain = new MetisWatch(new chains.MetisChain(chainConfig))
        break
      case '11':
      case '511':
        watchChain = new DydxWatch(new chains.DydxChain(chainConfig))
        break
      case '12':
      case '512':
        watchChain = new ZKSpaceWatch(new chains.ZKSpaceChain(chainConfig))
        break
      case '13':
      case '513':
        watchChain = new BobaWatch(new chains.BobaChain(chainConfig))
        break
      case '14':
      case '514':
        watchChain = new ZKSync2Watch(new chains.ZKSync2Chain(chainConfig))
        break
      default:
        throw new Error(`Public chain id not found ${intranetChainId}`)
    }
    return watchChain
  }
}
