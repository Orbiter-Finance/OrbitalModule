import { AccountInfo, ExchangeAPI, UserAPI } from '@loopring-web/loopring-sdk'
import { PromisePool } from '@supercharge/promise-pool'
import axios from 'axios'
import BigNumber from 'bignumber.js'
import { Not, Repository } from 'typeorm'
import { ServiceError, ServiceErrorCodes } from '../error/service'
import { MakerNode } from '../model/maker_node'
import { MakerPull } from '../model/maker_pull'
import { dateFormatNormal, equalsIgnoreCase, isEthTokenAddress } from '../util'
import { Core } from '../util/core'
import { CrossAddress } from '../util/cross_address'
import { accessLogger, errorLogger } from '../util/logger'
import { getAmountToSend } from '../util/maker'
import { CHAIN_INDEX } from '../util/maker/core'
import { DydxHelper } from './dydx/dydx_helper'
import { IMXHelper } from './immutablex/imx_helper'
import {
  getAmountFlag,
  getTargetMakerPool,
  makeTransactionID,
  newMakeTransactionID,
} from './maker'
import { getMakerPullStart } from './setting'
import BobaService from './boba/boba_service'
import { ITransaction, TransactionStatus } from '../chainCore/src/types'
import { equals, getChainByChainId } from '../chainCore/src/utils'
import logger from '../chainCore/src/utils/logger'

const repositoryMakerNode = (): Repository<MakerNode> => {
  return Core.db.getRepository(MakerNode)
}
const repositoryMakerPull = (): Repository<MakerPull> => {
  return Core.db.getRepository(MakerPull)
}
//====only for zksync2 by web3 ======
// const zk2ContractInfo = {}
// const zk2BlockNumberInfo: any = {}
// let zk2Web3;
//=========================

/**
 * save maker_pull
 * @param makerPull
 * @param checkField txBlock or txHash(default)
 * @returns false: if exist
 */
async function savePull(
  makerPull: MakerPull,
  checkField: keyof MakerPull = 'txHash'
): Promise<boolean> {
  // chainId && makerAddress && tokenAddress unique
  const findConditions = {
    chainId: makerPull.chainId,
    makerAddress: makerPull.makerAddress,
    tokenAddress: makerPull.tokenAddress,
    [checkField]: makerPull[checkField],
  }
  const his = await repositoryMakerPull().findOne(findConditions)
  if (his) {
    await repositoryMakerPull().update({ id: his.id }, makerPull)
  } else {
    await repositoryMakerPull().insert(makerPull)
  }

  return true
}

/**
 * @param makerAddress
 * @param startTime
 * @param endTime
 * @param fromOrToMaker false: maker <<< to, true: maker >>> from
 */
export async function getMakerPulls(
  makerAddress: string,
  startTime = 0,
  endTime = 0,
  fromOrToMaker = false
): Promise<MakerPull[]> {
  if (!makerAddress) {
    throw new ServiceError(
      'Sorry, params makerAddress miss',
      ServiceErrorCodes['arguments invalid']
    )
  }

  const ALIAS_MP = 'mp'
  const ALIAS_MN = 'mn'

  // QueryBuilder
  const queryBuilder = repositoryMakerPull().createQueryBuilder(ALIAS_MP)

  // select subQuery
  const selectSubSelect = repositoryMakerNode()
    .createQueryBuilder(ALIAS_MN)
    .select('toTx')
    .where(`${ALIAS_MN}.makerAddress = :makerAddress`, { makerAddress })
    .limit(1)
  if (fromOrToMaker) {
    selectSubSelect.andWhere(`${ALIAS_MN}.toTx=${ALIAS_MP}.txHash`)
  } else {
    selectSubSelect.andWhere(`${ALIAS_MN}.formTx=${ALIAS_MP}.txHash`)
  }
  queryBuilder.addSelect('(' + selectSubSelect.getQuery() + ')', 'target_tx')

  // where
  queryBuilder.where(`${ALIAS_MP}.makerAddress = :makerAddress`, {
    makerAddress,
  })
  // queryBuilder.andWhere(`${ALIAS_MP}.amount_flag != '0'`)
  queryBuilder.andWhere(
    `${ALIAS_MP}.${
      fromOrToMaker ? 'fromAddress' : 'toAddress'
    } = :makerAddress`,
    { makerAddress }
  )

  // conversion、query
  startTime = Number(startTime)
  endTime = Number(endTime)
  if (startTime) {
    queryBuilder.andWhere(`${ALIAS_MP}.txTime >= :startTime`, {
      startTime: dateFormatNormal(startTime),
    })
  }
  if (endTime) {
    queryBuilder.andWhere(`${ALIAS_MP}.txTime <= :endTime`, {
      endTime: dateFormatNormal(endTime),
    })
  }

  // order by
  queryBuilder.addOrderBy(`${ALIAS_MP}.txTime`, 'DESC')

  const list = await queryBuilder.getRawMany()
  // clear
  const newList: any[] = []
  for (const item of list) {
    newList.push({
      chainId: item.mp_chainId,
      makerAddress: item.mp_makerAddress,
      tokenAddress: item.mp_tokenAddress,
      amount: item.mp_amount,
      amount_flag: item.mp_amount_flag,
      nonce: item.mp_nonce,
      fromAddress: item.mp_fromAddress,
      toAddress: item.mp_toAddress,
      txHash: item.mp_txHash,
      txTime: item.mp_txTime,
      tx_status: item.mp_tx_status,
      target_tx: item.target_tx,
    })
  }

  return newList
}

/**
 * zksync token <-> tokenId
 * ex: { "0x1123": 2}
 */
const ZKSYNC_TOKEN_MAP = {}

/**
 * when confirmations >= it, tx was finalized
 */
const FINALIZED_CONFIRMATIONS = 3

/**
 * last MakerPull and pull count
 */
class MakerPullLastData {
  makerPull: MakerPull | undefined = undefined
  pullCount = 0
  roundTotal = 0 // When it is zero(0) full update, else incremental update
  startPoint = 0 //only for zkspace
}
const LAST_PULL_COUNT_MAX = 3
const ETHERSCAN_LAST: { [key: string]: MakerPullLastData } = {}
const ARBITRUM_LAST: { [key: string]: MakerPullLastData } = {}
const POLYGON_LAST: { [key: string]: MakerPullLastData } = {}
const METIS_LAST: { [key: string]: MakerPullLastData } = {}
const ZKSYNC_LAST: { [key: string]: MakerPullLastData } = {}
const OPTIMISM_LAST: { [key: string]: MakerPullLastData } = {}
const IMMUTABLEX_USER_LAST: { [key: string]: MakerPullLastData } = {}
const IMMUTABLEX_RECEIVER_LAST: { [key: string]: MakerPullLastData } = {}
const LOOPRING_LAST: { [key: string]: MakerPullLastData } = {}
const DYDX_LAST: { [key: string]: MakerPullLastData } = {}
const BOBA_LAST: { [key: string]: MakerPullLastData } = {}
const ZKSPACE_LAST: { [key: string]: MakerPullLastData } = {}
const ZKSYNC2_LAST: { [key: string]: MakerPullLastData } = {}

export function getLastStatus() {
  return {
    LAST_PULL_COUNT_MAX,
    ETHERSCAN_LAST,
    ARBITRUM_LAST,
    POLYGON_LAST,
    METIS_LAST,
    ZKSYNC_LAST,
    OPTIMISM_LAST,
    IMMUTABLEX_USER_LAST,
    IMMUTABLEX_RECEIVER_LAST,
    LOOPRING_LAST,
    DYDX_LAST,
    ZKSPACE_LAST,
    BOBA_LAST,
    ZKSYNC2_LAST,
  }
}
const SERVICE_MAKER_PULL_TIMEOUT = 16000
export class ServiceMakerPull {
  private static compareDataPromise = Promise.resolve()

  private chainId: number
  private makerAddress: string
  private tokenAddress: string
  private tokenSymbol: string // for makerList[x].tName

  /**
   * Reset compareDataPromise
   */
  public static resetCompareDataPromise() {
    ServiceMakerPull.compareDataPromise = Promise.resolve()
  }

  /**
   * @param chainId
   * @param makerAddress
   * @param tokenAddress
   * @param tokenSymbol
   */
  constructor(
    chainId: number,
    makerAddress: string,
    tokenAddress: string,
    tokenSymbol: string
  ) {
    this.chainId = chainId
    this.makerAddress = makerAddress
    this.tokenAddress = tokenAddress
    this.tokenSymbol = tokenSymbol
  }

  /**
   * get last maker_pull
   * @param last
   */
  private async getLastMakerPull(last: MakerPullLastData) {
    const makerPullStart = await getMakerPullStart()
    const nowTime = new Date().getTime()
    // 1. if last's pullCount >= max pullCount, the last makerPull invalid
    // 2. if roundTotal > 0 and makerPull.txTime before some time, the last makerPull invalid(Incremental update)
    let lastMakePull: MakerPull | undefined
    let startTime = nowTime - makerPullStart.totalPull
    if (last.roundTotal > 0) {
      startTime = nowTime - makerPullStart.incrementPull
    }
    if (
      last.pullCount >= LAST_PULL_COUNT_MAX ||
      (last.makerPull && startTime > last.makerPull.txTime.getTime())
    ) {
      // update last data
      last.makerPull = undefined
      last.pullCount = 0
      last.startPoint = 0 //only for zkspace
      last.roundTotal++
      // if (this.chainId == 14 || this.chainId == 514) {
      //   zk2BlockNumberInfo[this.tokenAddress.toLowerCase()] = undefined//only for zk2 by web3
      // }
    } else {
      lastMakePull = last.makerPull
    }
    return {
      lastMakePull,
      totalPull: makerPullStart.totalPull,
      incrementPull: makerPullStart.incrementPull,
    }
  }

  /**
   * @param makerPull
   * @returns
   */
  private async compareData(makerPull: MakerPull) {
    // to lower
    const makerAddress = makerPull.makerAddress.toLowerCase()
    const fromAddress = makerPull.fromAddress.toLowerCase()
    const toAddress = makerPull.toAddress.toLowerCase()
    // if maker out
    if (fromAddress == makerAddress) {
      const targetMP = await repositoryMakerPull().findOne({
        makerAddress: makerAddress, //  same makerAddress
        fromAddress: makerPull.toAddress,
        toAddress: fromAddress,
        amount_flag: String(makerPull.chainId),
        nonce: makerPull.amount_flag,
        tx_status: Not('rejected'),
      })
      if (targetMP) {
        const transactionID = makeTransactionID(
          targetMP.fromAddress,
          targetMP.chainId,
          targetMP.nonce
        )
        await repositoryMakerNode().update(
          {
            transactionID,
            needToAmount: makerPull.amount,
          },
          {
            toTx: makerPull.txHash,
            toAmount: makerPull.amount,
            toTimeStamp: dateFormatNormal(makerPull.txTime),
            gasCurrency: makerPull.gasCurrency,
            gasAmount: makerPull.gasAmount,
            state: targetMP.tx_status == 'finalized' ? 3 : 2,
          }
        )
      }
    }

    // if into maker
    if (toAddress == makerAddress) {
      // when amount_flag not in CHAIN_INDEX, it cann't identify toChain
      if (!CHAIN_INDEX[makerPull.amount_flag]) {
        return
      }

      // find pool and calculate needToAmount
      const targetMakerPool: any = await getTargetMakerPool(
        this.makerAddress,
        this.tokenAddress,
        makerPull.chainId,
        Number(makerPull.amount_flag),
        makerPull.txTime
      )
      let transactionID = ''
      let needToAmount = '0'
      let mpTokenAddress = ''
      if (targetMakerPool) {
        needToAmount =
          getAmountToSend(
            makerPull.chainId,
            Number(makerPull.amount_flag),
            makerPull.amount,
            targetMakerPool,
            makerPull.nonce
          )?.tAmount || '0'
        mpTokenAddress =
          targetMakerPool.c1ID == makerPull.chainId
            ? targetMakerPool.t2Address
            : targetMakerPool.t1Address
        transactionID = makeTransactionID(
          makerPull.fromAddress,
          makerPull.chainId,
          makerPull.nonce
        )
      }

      // match data from maker_pull
      const _mp = await repositoryMakerPull().findOne({
        chainId: Number(makerPull.amount_flag),
        makerAddress: this.makerAddress,
        tokenAddress: mpTokenAddress,
        fromAddress: makerPull.makerAddress,
        toAddress: fromAddress,
        amount: needToAmount,
        amount_flag: makerPull.nonce,
        tx_status: Not('rejected'),
      })
      const otherData = {
        state: makerPull.tx_status == 'finalized' ? 1 : 0,
      }
      if (_mp) {
        otherData['toTx'] = _mp.txHash
        otherData['toAmount'] = _mp.amount
        otherData['toTimeStamp'] = dateFormatNormal(_mp.txTime)
        otherData['gasCurrency'] = _mp.gasCurrency
        otherData['gasAmount'] = _mp.gasAmount
        otherData['state'] = _mp.tx_status == 'finalized' ? 3 : 2
      }
      try {
        const makerNode = await repositoryMakerNode().findOne({ transactionID })
        // update or insert
        if (makerNode) {
          await repositoryMakerNode().update({ transactionID }, otherData)
        } else {
          await repositoryMakerNode().insert({
            transactionID,
            makerAddress: makerPull.makerAddress,
            userAddress: fromAddress,
            fromChain: String(makerPull.chainId),
            toChain: makerPull.amount_flag,
            formTx: makerPull.txHash,
            fromAmount: makerPull.amount,
            formNonce: makerPull.nonce,
            needToAmount,
            fromTimeStamp: dateFormatNormal(makerPull.txTime),
            txToken: makerPull.tokenAddress,
            fromExt: makerPull.txExt,
            ...otherData,
          })
        }
      } catch (e) {
        // When run concurrently, insert will try transactionID exist error
        errorLogger.error(e)
      }
    }
  }
  /**
   * @param new makerPull
   * @returns
   */
  private async newCompareData(makerPull: MakerPull) {
    // to lower
    const makerAddress = makerPull.makerAddress.toLowerCase()
    const fromAddress = makerPull.fromAddress.toLowerCase()
    const toAddress = makerPull.toAddress.toLowerCase()
    // if maker out
    const originTx: ITransaction = JSON.parse(makerPull.data)
    if (fromAddress == makerAddress) {
      const targetMP = await repositoryMakerPull().findOne(
        {
          makerAddress: makerAddress, //  same makerAddress
          fromAddress: toAddress,
          toAddress: fromAddress,
          amount_flag: String(makerPull.chainId),
          nonce: makerPull.amount_flag,
          tx_status: Not('rejected'),
        },
        {
          order: {
            txTime: 'DESC',
          },
        }
      )
      if (targetMP) {
        const transactionID = newMakeTransactionID(
          targetMP.fromAddress,
          targetMP.chainId,
          targetMP.nonce,
          originTx.symbol
        )
        await repositoryMakerNode().update(
          {
            transactionID,
            needToAmount: makerPull.amount,
          },
          {
            toTx: makerPull.txHash,
            toAmount: makerPull.amount,
            toTimeStamp: dateFormatNormal(makerPull.txTime),
            gasCurrency: makerPull.gasCurrency,
            gasAmount: makerPull.gasAmount,
            state: targetMP.tx_status == 'finalized' ? 3 : 2,
          }
        )
      } else {
        logger.error(
          `Collection transaction, user transfer targetMP  not found:id:${makerPull.id},chainId:${makerPull.chainId},amount_flag:${makerPull.amount_flag},txHash${makerPull.txHash}`
        )
      }
    }
    // if into maker
    if (toAddress == makerAddress) {
      // when amount_flag not in CHAIN_INDEX, it cann't identify toChain
      if (!CHAIN_INDEX[makerPull.amount_flag]) {
        return
      }

      const transactionID = newMakeTransactionID(
        makerPull.fromAddress,
        makerPull.chainId,
        makerPull.nonce,
        originTx.symbol
      )
      // find pool and calculate needToAmount
      const targetMakerPool = await getTargetMakerPool(
        makerAddress,
        makerPull.tokenAddress,
        makerPull.chainId,
        Number(makerPull.amount_flag),
        makerPull.txTime
      )
      let needToAmount = '0'
      if (targetMakerPool) {
        needToAmount =
          getAmountToSend(
            makerPull.chainId,
            Number(makerPull.amount_flag),
            makerPull.amount,
            targetMakerPool,
            makerPull.nonce
          )?.tAmount || '0'
      }

      // match data from maker_pull
      const _mp = await repositoryMakerPull().findOne({
        chainId: Number(makerPull.amount_flag),
        makerAddress: makerAddress,
        fromAddress: makerPull.makerAddress,
        toAddress: fromAddress,
        amount: needToAmount,
        amount_flag: makerPull.nonce,
        tx_status: Not('rejected'),
      })
      const otherData = {
        state: makerPull.tx_status == 'finalized' ? 1 : 0,
      }
      if (_mp) {
        otherData['toTx'] = _mp.txHash
        otherData['toAmount'] = _mp.amount
        otherData['toTimeStamp'] = dateFormatNormal(_mp.txTime)
        otherData['gasCurrency'] = _mp.gasCurrency
        otherData['gasAmount'] = _mp.gasAmount
        otherData['state'] = _mp.tx_status == 'finalized' ? 3 : 2
      }
      try {
        const makerNode = await repositoryMakerNode().findOne({ transactionID })
        // update or insert
        if (makerNode) {
          await repositoryMakerNode().update({ transactionID }, otherData)
        } else {
          await repositoryMakerNode().insert({
            transactionID,
            makerAddress: makerPull.makerAddress,
            userAddress: fromAddress,
            fromChain: String(makerPull.chainId),
            toChain: makerPull.amount_flag,
            formTx: makerPull.txHash,
            fromAmount: makerPull.amount,
            formNonce: makerPull.nonce,
            needToAmount,
            fromTimeStamp: dateFormatNormal(makerPull.txTime),
            txToken: makerPull.tokenAddress,
            fromExt: makerPull.txExt,
            ...otherData,
          })
        }
      } catch (e) {
        // When run concurrently, insert will try transactionID exist error
        errorLogger.error(e)
      }
    }
  }
  /**
   * @param makerPull
   */
  private async singleCompareData(makerPull: MakerPull) {
    // Todo: Single compareData has "stuck still" bug. Execute synchronously first
    // await (ServiceMakerPull.compareDataPromise =
    //   ServiceMakerPull.compareDataPromise
    //     .catch(() => {
    //       // Catch prev promise error.
    //     })
    //     .then(() => this.compareData(makerPull)))
    return this.compareData(makerPull)
  }

  /**
   * @param promiseMethods
   */
  private async doPromisePool(promiseMethods: (() => Promise<unknown>)[]) {
    await PromisePool.for(promiseMethods)
      .withConcurrency(10)
      .process(async (item) => await item())
  }

  /**
   * @param input
   */
  private getTxExtFromInput(input: string) {
    if (input.length > 138) {
      const inputData = CrossAddress.safeParseTransferERC20Input(input)
      if (inputData && inputData.ext) {
        return inputData.ext
      }
    }

    return undefined
  }

  /**
   * @param transaction
   * @param api
   * @returns
   */
  private async ensureTransactionInput(
    transaction: { hash: string; input: string },
    api: { endPoint: string; key: string }
  ) {
    if (!equalsIgnoreCase(transaction.input, 'deprecated')) {
      return
    }

    try {
      const resp = await axios.get(api.endPoint, {
        params: {
          apiKey: api.key,
          module: 'proxy',
          action: 'eth_getTransactionByHash',
          txhash: transaction.hash,
        },
        timeout: SERVICE_MAKER_PULL_TIMEOUT,
      })

      // Set input
      transaction.input = resp.data.result?.input || transaction.input
    } catch (err) {
      errorLogger.error(
        `proxy.eth_getTransactionByHash failed. hash:${
          transaction.hash
        }, api: ${JSON.stringify(api)}, error: ${err.message}.`
      )
    }
  }

  /**
   * pull etherscan
   * @param api
   */
  async etherscan(api: { endPoint: string; key: string }) {
    const makerPullLastKey = `${this.makerAddress}:${this.tokenAddress}`
    let makerPullLastData = ETHERSCAN_LAST[makerPullLastKey]
    if (!makerPullLastData) {
      makerPullLastData = new MakerPullLastData()
    }
    let { lastMakePull } = await this.getLastMakerPull(makerPullLastData)
    // when endblock is empty, will end latest
    const startblock = ''
    const endblock = lastMakePull ? lastMakePull.txBlock : ''
    const resp = await axios.get(api.endPoint, {
      params: {
        apiKey: api.key,
        module: 'account',
        action: isEthTokenAddress(this.tokenAddress) ? 'txlist' : 'tokentx',
        address: this.makerAddress,
        page: 1,
        offset: 100,
        startblock,
        endblock,
        sort: 'desc',
      },
      timeout: SERVICE_MAKER_PULL_TIMEOUT,
    })

    // check data
    const { data } = resp
    if (data.status != '1' || !data.result || data.result.length <= 0) {
      accessLogger.warn(
        'Get etherscan tokentx/txlist faild: ' + JSON.stringify(data)
      )
      return
    }

    const promiseMethods: (() => Promise<unknown>)[] = []
    for (const item of data.result) {
      // contractAddress = 0x0...0
      let contractAddress = item.contractAddress
      if (isEthTokenAddress(this.tokenAddress) && !item.contractAddress) {
        contractAddress = this.tokenAddress
      }

      // checks
      if (!equalsIgnoreCase(contractAddress, this.tokenAddress)) {
        continue
      }

      const amount_flag = getAmountFlag(this.chainId, item.value)

      // ensureTransactionInput
      if (
        equalsIgnoreCase(item.to, this.makerAddress) &&
        (amount_flag == '11' || amount_flag == '511')
      ) {
        await this.ensureTransactionInput(item, api)
      }

      // save
      const makerPull = (lastMakePull = <MakerPull>{
        chainId: this.chainId,
        makerAddress: this.makerAddress,
        tokenAddress: contractAddress,
        data: JSON.stringify(item),
        amount: item.value,
        amount_flag,
        nonce: item.nonce,
        fromAddress: item.from,
        toAddress: item.to,
        txBlock: item.blockNumber,
        txHash: item.hash,
        txExt: item.input && this.getTxExtFromInput(item.input),
        txTime: new Date(item.timeStamp * 1000),
        gasCurrency: 'ETH',
        gasAmount: new BigNumber(item.gasUsed)
          .multipliedBy(item.gasPrice)
          .toString(),
        tx_status:
          item.confirmations >= FINALIZED_CONFIRMATIONS
            ? 'finalized'
            : 'committed',
      })

      promiseMethods.push(async () => {
        await savePull(makerPull)

        // compare
        await this.singleCompareData(makerPull)
      })
    }

    await this.doPromisePool(promiseMethods)

    // set ETHERSCAN_LAST
    if (lastMakePull?.txBlock == makerPullLastData.makerPull?.txBlock) {
      makerPullLastData.pullCount++
    }
    makerPullLastData.makerPull = lastMakePull
    ETHERSCAN_LAST[makerPullLastKey] = makerPullLastData
  }

  /**
   * pull arbitrum
   * @param api
   */
  async arbitrum(api: { endPoint: string; key: string }) {
    const makerPullLastKey = `${this.makerAddress}:${this.tokenAddress}`
    let makerPullLastData = ARBITRUM_LAST[makerPullLastKey]
    if (!makerPullLastData) {
      makerPullLastData = new MakerPullLastData()
    }
    let { lastMakePull } = await this.getLastMakerPull(makerPullLastData)

    // when endblock is empty, will end latest
    const startblock = ''
    const endblock = lastMakePull ? lastMakePull.txBlock : ''

    const resp = await axios.get(api.endPoint, {
      params: {
        // apiKey: api.key,
        module: 'account',
        action: isEthTokenAddress(this.tokenAddress) ? 'txlist' : 'tokentx',
        address: this.makerAddress,
        page: 1,
        offset: 100,
        startblock,
        endblock,
        sort: 'desc',
      },
      timeout: SERVICE_MAKER_PULL_TIMEOUT,
    })

    // check data
    const { data } = resp
    if (data.status != '1' || !data.result || data.result.length <= 0) {
      accessLogger.warn(
        'Get arbitrum tokentx/txlist faild: ' + JSON.stringify(data)
      )
      return
    }

    const promiseMethods: (() => Promise<unknown>)[] = []
    for (const item of data.result) {
      // contractAddress = 0x0...0
      let contractAddress = item.contractAddress
      if (isEthTokenAddress(this.tokenAddress) && !item.contractAddress) {
        contractAddress = this.tokenAddress
      }

      // checks
      if (!equalsIgnoreCase(contractAddress, this.tokenAddress)) {
        continue
      }

      const amount_flag = getAmountFlag(this.chainId, item.value)

      // ensureTransactionInput
      if (
        equalsIgnoreCase(item.to, this.makerAddress) &&
        (amount_flag == '11' || amount_flag == '511')
      ) {
        await this.ensureTransactionInput(item, api)
      }

      // save
      const makerPull = (lastMakePull = <MakerPull>{
        chainId: this.chainId,
        makerAddress: this.makerAddress,
        tokenAddress: contractAddress,
        data: JSON.stringify(item),
        amount: item.value,
        amount_flag,
        nonce: item.nonce,
        fromAddress: item.from,
        toAddress: item.to,
        txBlock: item.blockNumber,
        txHash: item.hash,
        txExt: this.getTxExtFromInput(item.input),
        txTime: new Date(item.timeStamp * 1000),
        gasCurrency: 'ETH',
        gasAmount: new BigNumber(item.gasUsed)
          .multipliedBy(item.gasPrice)
          .toString(),
        tx_status:
          item.confirmations >= FINALIZED_CONFIRMATIONS
            ? 'finalized'
            : 'committed',
      })

      promiseMethods.push(async () => {
        await savePull(makerPull)

        // compare
        await this.singleCompareData(makerPull)
      })
    }

    await this.doPromisePool(promiseMethods)

    // set ARBITRUM_LAST
    if (lastMakePull?.txBlock == makerPullLastData.makerPull?.txBlock) {
      makerPullLastData.pullCount++
    }
    makerPullLastData.makerPull = lastMakePull
    ARBITRUM_LAST[makerPullLastKey] = makerPullLastData
  }

  /**
   * pull polygon
   * @param api
   */
  async polygon(api: { endPoint: string; key: string }) {
    const makerPullLastKey = `${this.makerAddress}:${this.tokenAddress}`
    let makerPullLastData = POLYGON_LAST[makerPullLastKey]
    if (!makerPullLastData) {
      makerPullLastData = new MakerPullLastData()
    }
    let { lastMakePull } = await this.getLastMakerPull(makerPullLastData)

    // when endblock is empty, will end latest
    const startblock = ''
    const endblock = lastMakePull ? lastMakePull.txBlock : ''

    const resp = await axios.get(api.endPoint, {
      params: {
        apikey: api.key,
        module: 'account',
        action: isEthTokenAddress(this.tokenAddress) ? 'txlist' : 'tokentx',
        address: this.makerAddress,
        page: 1,
        offset: 100,
        startblock,
        endblock,
        sort: 'desc',
      },
      timeout: SERVICE_MAKER_PULL_TIMEOUT,
    })

    // check data
    const { data } = resp
    if (data.status != '1' || !data.result || data.result.length <= 0) {
      accessLogger.warn(
        'Get polygon tokentx/txlist faild: ' + JSON.stringify(data)
      )
      return
    }

    const promiseMethods: (() => Promise<unknown>)[] = []
    for (const item of data.result) {
      // contractAddress = 0x0...0
      let contractAddress = item.contractAddress
      if (isEthTokenAddress(this.tokenAddress) && !item.contractAddress) {
        contractAddress = this.tokenAddress
      }

      // checks
      if (!equalsIgnoreCase(contractAddress, this.tokenAddress)) {
        continue
      }

      const amount_flag = getAmountFlag(this.chainId, item.value)

      // ensureTransactionInput
      if (
        equalsIgnoreCase(item.to, this.makerAddress) &&
        (amount_flag == '11' || amount_flag == '511')
      ) {
        await this.ensureTransactionInput(item, api)
      }

      // save
      const makerPull = (lastMakePull = <MakerPull>{
        chainId: this.chainId,
        makerAddress: this.makerAddress,
        tokenAddress: contractAddress,
        data: JSON.stringify(item),
        amount: item.value,
        amount_flag,
        nonce: item.nonce,
        fromAddress: item.from,
        toAddress: item.to,
        txBlock: item.blockNumber,
        txHash: item.hash,
        txExt: this.getTxExtFromInput(item.input),
        txTime: new Date(item.timeStamp * 1000),
        gasCurrency: 'MATIC',
        gasAmount: new BigNumber(item.gasUsed)
          .multipliedBy(item.gasPrice)
          .toString(),
        tx_status:
          item.confirmations >= FINALIZED_CONFIRMATIONS
            ? 'finalized'
            : 'committed',
      })

      promiseMethods.push(async () => {
        await savePull(makerPull)

        // compare
        await this.singleCompareData(makerPull)
      })
    }

    await this.doPromisePool(promiseMethods)

    // set POLYGON_LAST
    if (lastMakePull?.txBlock == makerPullLastData.makerPull?.txBlock) {
      makerPullLastData.pullCount++
    }
    makerPullLastData.makerPull = lastMakePull
    POLYGON_LAST[makerPullLastKey] = makerPullLastData
  }

  /**
   * pull zksync
   * @param api
   */
  async zkSync(api: { endPoint: string; key: string }) {
    // if tokenAddress not in zksyncTokenMap, get it
    if (!ZKSYNC_TOKEN_MAP[this.tokenAddress]) {
      const respData = (
        await axios.get(`${api.endPoint}\/tokens\/${this.tokenAddress}`, {
          timeout: SERVICE_MAKER_PULL_TIMEOUT,
        })
      ).data
      if (respData.result?.address == this.tokenAddress) {
        ZKSYNC_TOKEN_MAP[this.tokenAddress] = respData.result?.id
      }
    }

    const makerPullLastKey = `${this.makerAddress}:${this.tokenAddress}`
    let makerPullLastData = ZKSYNC_LAST[makerPullLastKey]
    if (!makerPullLastData) {
      makerPullLastData = new MakerPullLastData()
    }
    let { lastMakePull } = await this.getLastMakerPull(makerPullLastData)

    const resp = await axios.get(
      `${api.endPoint}/accounts/${this.makerAddress}/transactions`,
      {
        params: {
          from: lastMakePull ? lastMakePull.txHash : 'latest',
          limit: 100,
          direction: 'older',
        },
      }
    )
    // parse data
    const { data } = resp
    if (data.status != 'success' || !data.result?.list) {
      return
    }
    if (data.result.list.length <= 0) {
      return
    }

    const transactions = data.result.list
    const promiseMethods: (() => Promise<unknown>)[] = []
    for (const item of transactions) {
      const _op = item.op
      if (!_op) {
        continue
      }

      // filter _op.type!=Transfer
      if (_op.type != 'Transfer') {
        continue
      }

      // check token
      if (_op.token != ZKSYNC_TOKEN_MAP[this.tokenAddress]) {
        continue
      }

      let tx_status = item.status
      if (tx_status == 'committed') {
        // zksync finalized's status so slow, when status=committed, set tx_status = 'finalized'
        tx_status = 'finalized'
      }

      const amount_flag = getAmountFlag(this.chainId, _op.amount)
      // save
      const makerPull = (lastMakePull = <MakerPull>{
        chainId: this.chainId,
        makerAddress: this.makerAddress,
        tokenAddress: this.tokenAddress,
        data: JSON.stringify(item),
        amount: _op.amount,
        amount_flag,
        nonce: _op.nonce,
        fromAddress: _op.from,
        toAddress: _op.to,
        txBlock: item.blockNumber,
        txHash: item.txHash,
        txTime: new Date(item.createdAt),
        gasCurrency: this.tokenSymbol,
        gasAmount: _op.fee || '',
        tx_status,
      })

      promiseMethods.push(async () => {
        await savePull(makerPull)

        // skip compare if failReason != null or status == 'Rejected'
        if (item.failReason != null || tx_status == 'rejected') {
          return
        }

        // compare
        await this.singleCompareData(makerPull)
      })
    }

    await this.doPromisePool(promiseMethods)

    // set ZKSYNC_LAST
    if (lastMakePull?.txHash == makerPullLastData.makerPull?.txHash) {
      makerPullLastData.pullCount++
    }
    makerPullLastData.makerPull = lastMakePull
    ZKSYNC_LAST[makerPullLastKey] = makerPullLastData
  }

  /**
   * pull optimism
   * @prarm api
   */
  async optimism(api: { endPoint: string; key: string }) {
    const makerPullLastKey = `${this.makerAddress}:${this.tokenAddress}`
    let makerPullLastData = OPTIMISM_LAST[makerPullLastKey]
    if (!makerPullLastData) {
      makerPullLastData = new MakerPullLastData()
    }
    let { lastMakePull } = await this.getLastMakerPull(makerPullLastData)

    // when endblock is empty, will end latest
    const startblock = ''
    const endblock = lastMakePull ? lastMakePull.txBlock : ''

    const resp = await axios.get(api.endPoint, {
      params: {
        // apiKey: api.key,
        module: 'account',
        action: isEthTokenAddress(this.tokenAddress) ? 'txlist' : 'tokentx',
        address: this.makerAddress,
        page: 1,
        offset: 100,
        startblock,
        endblock,
        sort: 'desc',
      },
      timeout: SERVICE_MAKER_PULL_TIMEOUT,
    })

    // check data
    const { data } = resp
    if (data.status != '1' || !data.result || data.result.length <= 0) {
      accessLogger.warn(
        'Get optimistc tokentx/txlist faild: ' + JSON.stringify(data)
      )
      return
    }

    const promiseMethods: (() => Promise<unknown>)[] = []
    for (const item of data.result) {
      // contractAddress = 0x0...0
      let contractAddress = item.contractAddress
      if (isEthTokenAddress(this.tokenAddress) && !item.contractAddress) {
        contractAddress = this.tokenAddress
      }

      // checks
      if (!equalsIgnoreCase(contractAddress, this.tokenAddress)) {
        continue
      }

      const amount_flag = getAmountFlag(this.chainId, item.value)

      // ensureTransactionInput
      if (
        equalsIgnoreCase(item.to, this.makerAddress) &&
        (amount_flag == '11' || amount_flag == '511')
      ) {
        await this.ensureTransactionInput(item, api)
      }

      // save
      const makerPull = (lastMakePull = <MakerPull>{
        chainId: this.chainId,
        makerAddress: this.makerAddress,
        tokenAddress: contractAddress,
        data: JSON.stringify(item),
        amount: item.value,
        amount_flag,
        nonce: item.nonce,
        fromAddress: item.from,
        toAddress: item.to,
        txBlock: item.blockNumber,
        txHash: item.hash,
        txExt: this.getTxExtFromInput(item.input),
        txTime: new Date(item.timeStamp * 1000),
        gasCurrency: 'ETH',
        gasAmount: new BigNumber(item.gasUsed)
          .multipliedBy(item.gasPrice)
          .toString(),
        tx_status:
          item.confirmations >= FINALIZED_CONFIRMATIONS
            ? 'finalized'
            : 'committed',
      })

      promiseMethods.push(async () => {
        await savePull(makerPull)

        // compare
        await this.singleCompareData(makerPull)
      })
    }

    await this.doPromisePool(promiseMethods)

    // set OPTIMISM_LAST
    if (lastMakePull?.txBlock == makerPullLastData.makerPull?.txBlock) {
      makerPullLastData.pullCount++
    }
    makerPullLastData.makerPull = lastMakePull
    OPTIMISM_LAST[makerPullLastKey] = makerPullLastData
  }

  /**
   * pull immutableX
   * @prarm api
   */
  async immutableX(api: { endPoint: string; key: string }) {
    const imxHelper = new IMXHelper(this.chainId)
    const imxClient = await imxHelper.getImmutableXClient()
    const makerPullLastKey = `${this.makerAddress}:${this.tokenAddress}`

    const fetchList = async (user?: string, receiver?: string) => {
      let makerPullLastData = IMMUTABLEX_USER_LAST[makerPullLastKey]
      if (receiver) {
        makerPullLastData = IMMUTABLEX_RECEIVER_LAST[makerPullLastKey]
      }

      if (!makerPullLastData) {
        makerPullLastData = new MakerPullLastData()
      }
      let { lastMakePull } = await this.getLastMakerPull(makerPullLastData)

      const resp = await imxClient.getTransfers({
        user,
        receiver,
        cursor: lastMakePull?.['currentCursor'] || '',
        direction: <any>'desc',
        page_size: 100,
      })
      if (!resp?.result) {
        return
      }

      if (resp.result.length > 0) {
        const promiseMethods: (() => Promise<unknown>)[] = []
        for (const item of resp.result) {
          const transaction = imxHelper.toTransaction(item)

          if (equalsIgnoreCase(transaction.txreceipt_status, 'rejected')) {
            continue
          }

          const amount_flag = getAmountFlag(this.chainId, transaction.value)

          let tx_status = transaction.txreceipt_status
          if (
            tx_status == 'success' ||
            tx_status == 'confirmed' ||
            tx_status == 'accepted'
          ) {
            tx_status = 'finalized'
          }

          // save
          const makerPull = (lastMakePull = <MakerPull>{
            chainId: this.chainId,
            makerAddress: this.makerAddress,
            tokenAddress: transaction.contractAddress,
            data: JSON.stringify(item),
            amount: transaction.value,
            amount_flag,
            nonce: transaction.nonce,
            fromAddress: transaction.from,
            toAddress: transaction.to,
            txBlock: transaction.blockHash,
            txHash: String(transaction.hash),
            txTime: new Date(transaction.timeStamp * 1000),
            gasCurrency: 'ETH',
            gasAmount: '0',
            tx_status,
          })

          promiseMethods.push(async () => {
            await savePull(makerPull)

            // compare
            await this.singleCompareData(makerPull)
          })
        }

        await this.doPromisePool(promiseMethods)
      } else {
        // When result.length <= 0. The end!
        lastMakePull = undefined
      }

      // set IMMUTABLEX_USER_LAST/IMMUTABLEX_RECEIVER_LAST
      if (lastMakePull?.txHash == makerPullLastData.makerPull?.txHash) {
        makerPullLastData.pullCount++
      }
      makerPullLastData.makerPull = lastMakePull
      if (makerPullLastData.makerPull) {
        makerPullLastData.makerPull['currentCursor'] = resp.cursor
      }

      if (user) {
        IMMUTABLEX_USER_LAST[makerPullLastKey] = makerPullLastData
      }
      if (receiver) {
        IMMUTABLEX_RECEIVER_LAST[makerPullLastKey] = makerPullLastData
      }
    }

    await fetchList(this.makerAddress)
    await fetchList(undefined, this.makerAddress)
  }

  /**
   * pull loopring
   * @prarm api
   */
  async loopring(api: { endPoint: string; key: string }) {
    const makerPullLastKey = `${this.makerAddress}:${this.tokenAddress}`
    let makerPullLastData = LOOPRING_LAST[makerPullLastKey]
    if (!makerPullLastData) {
      makerPullLastData = new MakerPullLastData()
    }
    let { lastMakePull } = await this.getLastMakerPull(makerPullLastData)
    let netWorkID = this.chainId == 9 ? 1 : 5
    const exchangeApi = new ExchangeAPI({ chainId: netWorkID })
    const userApi = new UserAPI({ chainId: netWorkID })
    let accountInfo: AccountInfo
    let GetAccountRequest = {
      owner: this.makerAddress,
    }
    let AccountResult = await exchangeApi.getAccount(GetAccountRequest)
    if (!AccountResult.accInfo || !AccountResult.raw_data) {
      errorLogger.error('account unlocked')
      return
    }
    accountInfo = AccountResult.accInfo
    let apiKey = api.key
    const GetUserTransferListRequest = {
      accountId: accountInfo.accountId,
      start: 0,
      end: lastMakePull ? lastMakePull.txTime.getTime() : 9999999999999,
      status: 'processed,received',
      limit: 50,
      transferTypes: 'transfer',
    }
    let LPTransferResult: any
    try {
      LPTransferResult = await userApi.getUserTransferList(
        GetUserTransferListRequest,
        apiKey
      )
    } catch (error) {
      accessLogger.warn('Get loopring txlist faild: ', error)
    }
    // parse data
    if (!LPTransferResult.totalNum || !LPTransferResult.userTransfers?.length) {
      return
    }

    const promiseMethods: (() => Promise<unknown>)[] = []
    for (const lpTransaction of LPTransferResult.userTransfers) {
      if (lpTransaction.status != 'processed') {
        continue
      }
      if (lpTransaction.txType != 'TRANSFER') {
        continue
      }
      if (lpTransaction.symbol != 'ETH') {
        continue
      }
      if (!lpTransaction.memo || lpTransaction.memo == '') {
        continue
      }
      const amount_flag = (<any>lpTransaction.memo % 9000) + ''
      let nonce = (lpTransaction['storageInfo'].storageId - 1) / 2 + ''

      const makerPull = (lastMakePull = <MakerPull>{
        chainId: this.chainId,
        makerAddress: this.makerAddress,
        tokenAddress: this.tokenAddress,
        data: JSON.stringify(lpTransaction),
        amount: lpTransaction.amount,
        amount_flag,
        nonce: nonce,
        fromAddress: lpTransaction.senderAddress,
        toAddress: lpTransaction.receiverAddress,
        txBlock: lpTransaction['blockId']
          ? lpTransaction['blockId'] + '-' + lpTransaction['indexInBlock']
          : '0', //it looks like 4480-4 not 4476
        txHash: lpTransaction.hash,
        txTime: new Date(lpTransaction.timestamp),
        gasCurrency: lpTransaction.feeTokenSymbol,
        gasAmount: lpTransaction.feeAmount || '',
        tx_status:
          lpTransaction.status == 'processed' ||
          lpTransaction.status == 'received'
            ? 'finalized'
            : 'committed',
      })

      promiseMethods.push(async () => {
        await savePull(makerPull)
        await this.singleCompareData(makerPull)
      })
    }

    await this.doPromisePool(promiseMethods)
    // set LOOPRING_LAST
    if (lastMakePull?.txHash == makerPullLastData.makerPull?.txHash) {
      makerPullLastData.pullCount++
    }
    makerPullLastData.makerPull = lastMakePull
    LOOPRING_LAST[makerPullLastKey] = makerPullLastData
  }

  /**
   * pull metis
   * @param api
   */
  async metis(api: { endPoint: string; key: string }) {
    const makerPullLastKey = `${this.makerAddress}:${this.tokenAddress}`
    let makerPullLastData = METIS_LAST[makerPullLastKey]
    if (!makerPullLastData) {
      makerPullLastData = new MakerPullLastData()
    }

    let { lastMakePull } = await this.getLastMakerPull(makerPullLastData)

    // when endblock is empty, will end latest
    const startblock = ''
    const endblock = lastMakePull ? lastMakePull.txBlock : ''

    const resp = await axios.get(api.endPoint, {
      params: {
        apikey: api.key,
        module: 'account',
        action: isEthTokenAddress(this.tokenAddress) ? 'txlist' : 'tokentx',
        address: this.makerAddress,
        page: 1,
        offset: 100,
        startblock,
        endblock,
        sort: 'desc',
      },
      timeout: SERVICE_MAKER_PULL_TIMEOUT,
    })

    // check data
    const { data } = resp
    if (data.status != '1' || !data.result) {
      accessLogger.warn(
        'Get metis tokentx/txlist faild: ' + JSON.stringify(data)
      )
      return
    }
    const promiseMethods: (() => Promise<unknown>)[] = []
    for (const item of data.result) {
      // contractAddress = 0x0...0
      let contractAddress = item.contractAddress
      if (isEthTokenAddress(this.tokenAddress) && !item.contractAddress) {
        contractAddress = this.tokenAddress
      }

      // checks
      if (!equalsIgnoreCase(contractAddress, this.tokenAddress)) {
        continue
      }

      const amount_flag = getAmountFlag(this.chainId, item.value)

      // ensureTransactionInput
      if (
        equalsIgnoreCase(item.to, this.makerAddress) &&
        (amount_flag == '11' || amount_flag == '511')
      ) {
        await this.ensureTransactionInput(item, api)
      }

      // save
      const makerPull = (lastMakePull = <MakerPull>{
        chainId: this.chainId,
        makerAddress: this.makerAddress,
        tokenAddress: contractAddress,
        data: JSON.stringify(item),
        amount: item.value,
        amount_flag,
        nonce: item.nonce,
        fromAddress: item.from,
        toAddress: item.to,
        txBlock: item.blockNumber,
        txHash: item.hash,
        txExt: this.getTxExtFromInput(item.input),
        txTime: new Date(item.timeStamp * 1000),
        gasCurrency: 'METIS',
        gasAmount: new BigNumber(item.gasUsed)
          .multipliedBy(item.gasPrice)
          .toString(),
        tx_status:
          item.confirmations >= FINALIZED_CONFIRMATIONS
            ? 'finalized'
            : 'committed',
      })

      promiseMethods.push(async () => {
        await savePull(makerPull)

        // compare
        await this.singleCompareData(makerPull)
      })
    }

    await this.doPromisePool(promiseMethods)

    // set METIS_LAST
    if (lastMakePull?.txBlock == makerPullLastData.makerPull?.txBlock) {
      makerPullLastData.pullCount++
    }
    makerPullLastData.makerPull = lastMakePull
    METIS_LAST[makerPullLastKey] = makerPullLastData
  }

  /**
   * pull dydx
   * @pararm api
   */
  async dydx(api: { endPoint: string; key: string }) {
    const dydxHelper = new DydxHelper(this.chainId)

    const makerPullLastKey = `${this.makerAddress}:${this.tokenAddress}`

    let makerPullLastData = DYDX_LAST[makerPullLastKey]

    if (!makerPullLastData) {
      makerPullLastData = new MakerPullLastData()
    }
    let { lastMakePull } = await this.getLastMakerPull(makerPullLastData)

    let createdBeforeOrAt: string | undefined
    if (lastMakePull?.txTime) {
      createdBeforeOrAt = lastMakePull.txTime.toISOString()
    }
    const transfers = DydxHelper.makerTrx
      .get(this.makerAddress.toLowerCase())
      ?.reverse()
    if (transfers && transfers.length > 0) {
      const promiseMethods: (() => Promise<unknown>)[] = []
      for (const item of transfers) {
        const transaction = DydxHelper.toTransaction(item, this.makerAddress)
        if (equalsIgnoreCase(transaction.txreceipt_status, 'rejected')) {
          continue
        }
        const amount_flag = getAmountFlag(this.chainId, transaction.value)

        let tx_status = transaction.txreceipt_status
        if (tx_status == 'CONFIRMED') {
          tx_status = 'finalized'
        }

        // Parse userAddress from clientId
        let toAddress = transaction.to
        if (
          !toAddress &&
          item.clientId &&
          equalsIgnoreCase(item.type, 'TRANSFER_OUT')
        ) {
          try {
            const ethereumAddress = dydxHelper.getEthereumAddressFromClientId(
              item.clientId
            )
            if (ethereumAddress) {
              toAddress = ethereumAddress
            }
          } catch (err) {
            errorLogger.error(
              `GetEthereumAddressFromClientId faild: ${err.message}`
            )
          }
        }
        item['symbol'] = transaction.symbol;
        // save
        const makerPull = (lastMakePull = <MakerPull>{
          chainId: this.chainId,
          makerAddress: this.makerAddress,
          tokenAddress: this.tokenAddress, // Only usdc now!
          data: JSON.stringify(item),
          amount: transaction.value,
          amount_flag,
          nonce: transaction.nonce,
          fromAddress: transaction.from,
          toAddress,
          txBlock: transaction.blockHash,
          txHash: String(transaction.hash),
          txTime: new Date(transaction.timeStamp * 1000),
          gasCurrency: 'ETH',
          gasAmount: '0',
          tx_status,
        })
        promiseMethods.push(async () => {
          await savePull(makerPull)
          if (makerPull.tx_status != 'rejected') {
            await this.newCompareData(makerPull)
          }
        })
      }

      await this.doPromisePool(promiseMethods)
      DydxHelper.makerTrx.delete(this.makerAddress)
    } else {
      // When transfers.length <= 0. The end!
      lastMakePull = undefined
    }
    makerPullLastData.makerPull = lastMakePull
    DYDX_LAST[makerPullLastKey] = makerPullLastData
  }
  /**
   * pull zkspace
   * @param api
   */
  async zkspace(api: { endPoint: string; key: string }) {
    const makerPullLastKey = `${this.makerAddress}:${this.tokenAddress}`
    let makerPullLastData = ZKSPACE_LAST[makerPullLastKey]
    if (!makerPullLastData) {
      makerPullLastData = new MakerPullLastData()
    }
    let { lastMakePull } = await this.getLastMakerPull(makerPullLastData)
    const url = `${api.endPoint}/txs?types=Transfer&address=${this.makerAddress}&start=${makerPullLastData.startPoint}&limit=50`
    let zksResponse: any
    try {
      zksResponse = await axios.get(url)
    } catch (error) {
      accessLogger.warn('Get zkspace txlist faild: ', error.messages)
    }

    if (
      zksResponse.status === 200 &&
      zksResponse.statusText === 'OK' &&
      zksResponse.data.success
    ) {
      let respData = zksResponse.data
      let zksList = respData?.data?.data
      if (!zksList || zksList.length == 0) {
        return
      }
      makerPullLastData.startPoint =
        zksList.length == 50 ? makerPullLastData.startPoint + 50 : 0
      const promiseMethods: (() => Promise<unknown>)[] = []

      for (let zksTransaction of zksList) {
        if (
          (zksTransaction.status != 'verified' &&
            zksTransaction.status != 'pending') ||
          zksTransaction.tx_type != 'Transfer' ||
          !zksTransaction.success ||
          zksTransaction.fail_reason != ''
        ) {
          continue
        }
        const amount_flag = getAmountFlag(
          this.chainId,
          new BigNumber(zksTransaction.amount)
            .multipliedBy(new BigNumber(10 ** 18))
            .toString()
        )
        const makerPull = (lastMakePull = <MakerPull>{
          chainId: this.chainId,
          makerAddress: this.makerAddress,
          tokenAddress: this.tokenAddress,
          data: JSON.stringify(zksTransaction),
          amount: new BigNumber(zksTransaction.amount)
            .multipliedBy(new BigNumber(10 ** 18))
            .toString(),
          amount_flag,
          nonce: zksTransaction.nonce,
          fromAddress: zksTransaction.from,
          toAddress: zksTransaction.to,
          txBlock: zksTransaction['block_number'],
          txHash: zksTransaction.tx_hash,
          txTime: new Date(zksTransaction.created_at * 1000),
          gasCurrency: zksTransaction.token.symbol,
          gasAmount: zksTransaction.fee || '',
          tx_status:
            zksTransaction.status == 'verified' ||
            zksTransaction.status == 'pending'
              ? 'finalized'
              : 'committed',
        })
        promiseMethods.push(async () => {
          await savePull(makerPull)
          await this.singleCompareData(makerPull)
        })
      }
      await this.doPromisePool(promiseMethods)

      // set ZKSPACE_LAST
      if (lastMakePull?.txBlock == makerPullLastData.makerPull?.txBlock) {
        makerPullLastData.pullCount++
      }
      makerPullLastData.makerPull = lastMakePull
      ZKSPACE_LAST[makerPullLastKey] = makerPullLastData
    }
  }
  /**
   * pull boba
   * @param api
   */
  async boba(api: { endPoint: string; key: string }, wsEndPoint: string) {
    const makerPullLastKey = `${this.makerAddress}:${this.tokenAddress}`
    let makerPullLastData = BOBA_LAST[makerPullLastKey]
    if (!makerPullLastData) {
      makerPullLastData = new MakerPullLastData()
    }
    let { lastMakePull } = await this.getLastMakerPull(makerPullLastData)
    // when endblock is empty, will end latest
    const startblock = ''
    const endblock = lastMakePull ? lastMakePull.txBlock : ''
    const bobaService = new BobaService(wsEndPoint, api.endPoint)
    const result = await bobaService.getTransactionByAddress(
      this.makerAddress,
      startblock,
      endblock
    )
    if (!result || !Array.isArray(result)) {
      return
    }
    const promiseMethods: (() => Promise<unknown>)[] = []
    for (const item of result) {
      // contractAddress = 0x0...0
      let contractAddress = item.contractAddress
      if (isEthTokenAddress(this.tokenAddress) && !item.contractAddress) {
        contractAddress = this.tokenAddress
      }

      // checks
      if (!equalsIgnoreCase(contractAddress, this.tokenAddress)) {
        continue
      }

      const amount_flag = getAmountFlag(this.chainId, item.value)

      // save
      const makerPull = (lastMakePull = <MakerPull>{
        chainId: this.chainId,
        makerAddress: this.makerAddress,
        tokenAddress: contractAddress,
        data: JSON.stringify(item),
        amount: item.value,
        amount_flag,
        nonce: item.nonce,
        fromAddress: item.from,
        toAddress: item.to,
        txBlock: item.blockNumber,
        txHash: item.hash,
        txTime: new Date(item.timeStamp * 1000),
        gasCurrency: 'ETH',
        gasAmount: new BigNumber(item.gasUsed)
          .multipliedBy(item.gasPrice)
          .toString(),
        tx_status:
          item.confirmations >= FINALIZED_CONFIRMATIONS
            ? 'finalized'
            : 'committed',
      })

      promiseMethods.push(async () => {
        await savePull(makerPull)

        // compare
        await this.singleCompareData(makerPull)
      })
    }

    await this.doPromisePool(promiseMethods)

    // set BOBA_LAST
    if (lastMakePull?.txBlock == makerPullLastData.makerPull?.txBlock) {
      makerPullLastData.pullCount++
    }
    makerPullLastData.makerPull = lastMakePull
    BOBA_LAST[makerPullLastKey] = makerPullLastData
  }

  async handleNewScanChainTrx(
    txlist: Array<ITransaction>,
    makerList: Array<any>
  ) {
    const promiseMethods: (() => Promise<unknown>)[] = []
    for (const tx of txlist) {
      if (tx.value.lte(0)) {
        accessLogger.error(
          'Transaction amount is incorrect, please check：',
          JSON.stringify(tx)
        )
        continue
      }
      let makerAddress = ''
      if (makerList.find((row) => equals(row.makerAddress, tx.from))) {
        makerAddress = tx.from
      } else if (makerList.find((row) => equals(row.makerAddress, tx.to))) {
        makerAddress = tx.to
      }
      const chainConfig = await getChainByChainId(tx.chainId)
      const value = tx.value.toString()
      let amount_flag = getAmountFlag(Number(chainConfig.internalId), value)
      let txExt: any = null
      if (amount_flag == '11' || amount_flag == '511') {
        txExt = this.getTxExtFromInput(String(tx.input))
      }

      // market list
      const backTx = JSON.stringify(tx)
      const makerPull: any = {
        chainId: Number(chainConfig.internalId),
        makerAddress: makerAddress,
        tokenAddress: tx.tokenAddress,
        data: backTx,
        amount: value,
        amount_flag,
        nonce: String(tx.nonce),
        fromAddress: tx.from,
        toAddress: tx.to,
        txBlock: String(tx.blockNumber),
        txHash: tx.hash,
        txExt,
        txTime: new Date(tx.timestamp * 1000),
        gasCurrency: tx.feeToken,
        gasAmount: String(tx.fee),
        tx_status: 'rejected',
      }
      if ([9, 99].includes(Number(makerPull.chainId)) && tx.extra) {
        makerPull.amount_flag = (<any>tx.extra.memo % 9000) + ''
      }
      if (tx.status === TransactionStatus.COMPLETE) {
        makerPull.tx_status = 'finalized'
      } else if (tx.status === TransactionStatus.PENDING) {
        makerPull.tx_status = 'committed'
      } else if (tx.status === TransactionStatus.Fail) {
        makerPull.tx_status = 'rejected'
      }
      if (
        [3, 33, 8, 88, 12, 512].includes(makerPull.chainId) &&
        tx.status === TransactionStatus.PENDING
      ) {
        makerPull.tx_status = 'finalized'
      }

      accessLogger.info('Processing transactions：', JSON.stringify(makerPull))
      //
      promiseMethods.push(async () => {
        await savePull(makerPull)
        // compare
        if (makerPull.tx_status != 'rejected') {
          await this.newCompareData(makerPull)
        }
      })
    }
    await PromisePool.for(promiseMethods)
      .withConcurrency(10)
      .process(async (item) => await item())
    //
    return txlist.map((tx) => tx.hash)
  }
}
