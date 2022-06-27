import { Arbitrum } from './arbitrum.service'
import { Boba } from './boba.service'
import { Dydx } from './dydx.service'
import { Ethereum } from './ethereum.service'
import { ImmutableX } from './immutableX.service'
import { Loopring } from './loopring.service'
import { Metis } from './metis.service'
import { Optimism } from './optimism.service'
import { Polygon } from './polygon.service'
import { Startknet } from './starknet.service'
import { ZKSpace } from './zkspace.service'
import { ZKSync } from './zksync.service'
import { ZKSync2 } from './zksync2.service'
export default {
  ArbitrumChain: Arbitrum,
  BobaChain: Boba,
  DydxChain: Dydx,
  EthereumChain: Ethereum,
  MetisChain: Metis,
  OptimismChain: Optimism,
  PolygonChain: Polygon,
  ZKSpaceChain: ZKSpace,
  ZKSyncChain: ZKSync,
  ZKSync2Chain: ZKSync2,
  ImmutableXChain: ImmutableX,
  LoopringChain: Loopring,
  StartknetChain: Startknet
}
