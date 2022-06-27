import { BigNumber } from 'bignumber.js'
import schedule from 'node-schedule'
import { makerConfig } from '../config'
import * as coinbase from '../service/coinbase'
import * as serviceMaker from '../service/maker'
import { ServiceMakerPull } from '../service/maker_pull'
import * as serviceMakerWealth from '../service/maker_wealth'
import { doBalanceAlarm } from '../service/setting'
import { Core } from '../util/core'
import { accessLogger, errorLogger } from '../util/logger'
import { expanPool, getMakerList } from '../util/maker'
import { CHAIN_INDEX } from '../util/maker/core'
import { ScanChainMain } from '../chainCore'
import mainnetChains from '../chainCore/chains.json'
import testnetChains from '../chainCore/testnet.json'
import {
  getNewMarketList,
  groupWatchAddressByChain,
} from '../util/maker/new_maker'
const allChainsConfig = [...mainnetChains, ...testnetChains]
// import { doSms } from '../sms/smsSchinese'
class MJob {
  protected rule:
    | string
    | number
    | schedule.RecurrenceRule
    | schedule.RecurrenceSpecDateRange
    | schedule.RecurrenceSpecObjLit
    | Date
  protected callback?: () => any
  protected jobName?: string

  /**
   * @param rule
   * @param callback
   * @param completed
   */
  constructor(
    rule:
      | string
      | number
      | schedule.RecurrenceRule
      | schedule.RecurrenceSpecDateRange
      | schedule.RecurrenceSpecObjLit
      | Date,
    callback?: () => any,
    jobName?: string
  ) {
    this.rule = rule
    this.callback = callback
    this.jobName = jobName
  }

  public schedule(): schedule.Job {
    return schedule.scheduleJob(this.rule, async () => {
      try {
        this.callback && (await this.callback())
      } catch (error) {
        let message = `MJob.schedule error: ${error.message}, rule: ${this.rule}`
        if (this.jobName) {
          message += `, jobName: ${this.jobName}`
        }
        errorLogger.error(message)
      }
    })
  }
}

// Pessimism Lock Job
class MJobPessimism extends MJob {
  public schedule(): schedule.Job {
    let pessimismLock = false

    const _callback = this.callback

    this.callback = async () => {
      if (pessimismLock) {
        return
      }
      pessimismLock = true

      try {
        _callback && (await _callback())
      } catch (error) {
        throw error
      } finally {
        // Always release lock
        pessimismLock = false
      }
    }

    return super.schedule()
  }
}

export function jobGetWealths() {
  const callback = async () => {
    const makerAddresses = await serviceMaker.getMakerAddresses()
    for (const item of makerAddresses) {
      const wealths = await serviceMakerWealth.getWealths(item)

      Core.memoryCache.set(
        `${serviceMakerWealth.CACHE_KEY_GET_WEALTHS}:${item}`,
        wealths,
        100000
      )

      await serviceMakerWealth.saveWealths(wealths)
    }
  }

  new MJobPessimism('* */60 * * * *', callback, jobGetWealths.name).schedule()
}

export function jobMakerPull() {
  const startPull = async (
    toChain: number,
    makerAddress: string,
    tokenAddress: string,
    tokenSymbol: string
  ) => {
    try {
      const serviceMakerPull = new ServiceMakerPull(
        toChain,
        makerAddress,
        tokenAddress,
        tokenSymbol
      )

      switch (CHAIN_INDEX[toChain]) {
        // case 'eth':
        //   let apiEth = makerConfig.mainnet.api
        //   if (toChain == 4 || toChain == 5) {
        //     apiEth = makerConfig.rinkeby.api
        //   }
        //   await serviceMakerPull.etherscan(apiEth)
        //   break
        // case 'arbitrum':
        //   let apiArbitrum = makerConfig.arbitrum.api
        //   if (toChain == 22) {
        //     apiArbitrum = makerConfig.arbitrum_test.api
        //   }
        //   await serviceMakerPull.arbitrum(apiArbitrum)
        //   break
        // case 'polygon':
        //   let apiPolygon = makerConfig.polygon.api
        //   if (toChain == 66) {
        //     apiPolygon = makerConfig.polygon_test.api
        //   }
        //   await serviceMakerPull.polygon(apiPolygon)
        //   break
        // case 'zksync':
        //   let apiZksync = makerConfig.zksync.api
        //   if (toChain == 33) {
        //     apiZksync = makerConfig.zksync_test.api
        //   }
        //   await serviceMakerPull.zkSync(apiZksync)
        //   break
        // case 'optimism':
        //   let apiOptimism = makerConfig.optimism.api
        //   if (toChain == 77) {
        //     apiOptimism = makerConfig.optimism_test.api
        //   }
        //   await serviceMakerPull.optimism(apiOptimism)
        //   break
        // case 'immutablex':
        //   let apiImmutableX = makerConfig.immutableX.api
        //   if (toChain == 88) {
        //     apiImmutableX = makerConfig.immutableX_test.api
        //   }
        //   await serviceMakerPull.immutableX(apiImmutableX)
        //   break
        // case 'loopring':
        //   let apiLoopring = makerConfig.loopring.api
        //   if (toChain == 99) {
        //     apiLoopring = makerConfig.loopring_test.api
        //   }
        //   await serviceMakerPull.loopring(apiLoopring)
        //   break
        // case 'metis':
        //   let apiMetis = makerConfig.metis.api
        //   if (toChain == 510) {
        //     apiMetis = makerConfig.metis_test.api
        //   }
        //   await serviceMakerPull.metis(apiMetis)
        //   break
        case 'dydx':
          let apiDydx = makerConfig.dydx.api
          if (toChain == 511) {
            apiDydx = makerConfig.dydx_test.api
          }
          await serviceMakerPull.dydx(apiDydx)
          break
        // case 'boba':
        //   const network =
        //     toChain === 13 ? makerConfig.boba : makerConfig.boba_test
        //   await serviceMakerPull.boba(network.api, network.wsEndPoint)
        //   break
        // case 'zkspace':
        //   let apiZkspace = makerConfig.zkspace.api
        //   if (toChain == 512) {
        //     apiZkspace = makerConfig.zkspace_test.api
        //   }
        //   await serviceMakerPull.zkspace(apiZkspace)
        //   break
      }
    } catch (error) {
      errorLogger.error(
        `jobMakerPull.startPull: ${error.message}, toChainId: ${toChain}, tokenAddress: ${tokenAddress}`
      )
    }
  }

  const callback = async () => {
    const makerList = await getMakerList()
    for (const item of makerList) {
      const { pool1, pool2 } = expanPool(item)
      await startPull(
        pool1.c1ID,
        pool1.makerAddress,
        pool1.t1Address,
        pool1.tName
      )
      await startPull(
        pool2.c2ID,
        pool2.makerAddress,
        pool2.t2Address,
        pool2.tName
      )
    }
  }

  new MJobPessimism('*/10 * * * * *', callback, jobMakerPull.name).schedule()
}

const jobMakerNodeTodoMakerAddresses: string[] = []
export function jobMakerNodeTodo(makerAddress: string) {
  // Prevent multiple makerAddress
  if (jobMakerNodeTodoMakerAddresses.indexOf(makerAddress) > -1) {
    return
  }
  jobMakerNodeTodoMakerAddresses.push(makerAddress)

  const callback = async () => {
    await serviceMaker.runTodo(makerAddress)
  }

  new MJobPessimism(
    '*/10 * * * * *',
    callback,
    jobMakerNodeTodo.name
  ).schedule()
}

export function jobCacheCoinbase() {
  const callback = async () => {
    await coinbase.cacheExchangeRates()
  }

  new MJobPessimism(
    '*/10 * * * * *',
    callback,
    jobCacheCoinbase.name
  ).schedule()
}

export function jobBalanceAlarm() {
  const callback = async () => {
    await doBalanceAlarm.do()
  }

  new MJobPessimism('*/10 * * * * *', callback, jobBalanceAlarm.name).schedule()
}

export async function startNewDashboardPull() {
  const makerList = await getNewMarketList()
  const convertMakerList = groupWatchAddressByChain(makerList)
  const scanChain = new ScanChainMain(allChainsConfig as any)
  const serviceMakerPull = new ServiceMakerPull(0, '', '', '')
  for (const intranetId in convertMakerList) {
    scanChain.mq.subscribe(`${intranetId}:txlist`, async (result) => {
      return await serviceMakerPull.handleNewScanChainTrx(result, makerList)
    })
    scanChain.startScanChain(intranetId, convertMakerList[intranetId])
  }
}
