import { BigNumber } from 'bignumber.js'
import { Repository } from 'typeorm'
import { equals, padStart } from 'orbiter-chaincore/src/utils/core'
import { makerConfig } from '../config'
import { ServiceError, ServiceErrorCodes } from '../error/service'
import { MakerNode } from '../model/maker_node'
import { MakerNodeTodo } from '../model/maker_node_todo'
import { dateFormatNormal, equalsIgnoreCase } from '../util'
import { Core } from '../util/core'
import { accessLogger } from '../util/logger'
import {
  expanPool,
  getAllMakerList,
  getMakerList,
  sendTransaction,
} from '../util/maker'
import { CHAIN_INDEX, getPTextFromTAmount } from '../util/maker/core'
import { exchangeToUsd } from './coinbase'

const repositoryMakerNode = (): Repository<MakerNode> => {
  return Core.db.getRepository(MakerNode)
}
const repositoryMakerNodeTodo = (): Repository<MakerNodeTodo> => {
  return Core.db.getRepository(MakerNodeTodo)
}

/**
 * @param chainId
 * @param amount
 * @returns
 */
export function getAmountFlag(
  chainId: string | number,
  amount: string | number
): string {
  const rst = getPTextFromTAmount(chainId, amount)
  if (!rst.state) {
    return '0'
  }
  return (Number(rst.pText) % 9000) + ''
}

/**
 * Get maker's addresses
 * @returns
 */
export async function getMakerAddresses() {
  const makerList = await getMakerList()

  const makerAddresses: string[] = []
  for (const item of makerList) {
    if (makerAddresses.indexOf(item.makerAddress) > -1) {
      continue
    }
    makerAddresses.push(item.makerAddress)
  }

  return makerAddresses
}

const GAS_PRICE_PAID_RATE = { arbitrum: 0.8 } // arbitrum Transaction Fee = gasUsed * gasPrice * 0.8 (general)
export async function statisticsProfit(
  makerNode: MakerNode
): Promise<BigNumber> {
  let fromToCurrency = ''
  let fromToPrecision = 0
  let gasPrecision = 18 // gas default is eth, zksync is token

  const makerList = await getMakerList()
  for (const item of makerList) {
    let makerAddress =item.makerAddress;
    if (['4','44'].includes(makerNode.fromChain)) {
      const addrMap = makerConfig.starknetL1MapL2[makerNode.toChain =='44' ? 'georli-alpha':'mainnet-alpha'];
      for(let L1Addr in addrMap) {
        if (equals(L1Addr, makerAddress)) {
          makerAddress = addrMap[L1Addr];
        }
      }
    }
  
    if (!equalsIgnoreCase(makerAddress, makerNode.makerAddress)) {
        continue
    }

    if (
      equalsIgnoreCase(item.t1Address, makerNode.txToken) ||
      equalsIgnoreCase(item.t2Address, makerNode.txToken)
    ) {
      fromToCurrency = item.tName
      fromToPrecision = item.precision
    }

    if (equalsIgnoreCase(item.tName, makerNode.gasCurrency)) {
      gasPrecision = item.precision
    }
  }

  if (fromToCurrency && Number(makerNode.toAmount) > 0) {
    const fromMinusToUsd = await exchangeToUsd(
      new BigNumber(makerNode.fromAmount)
        .minus(makerNode.toAmount)
        .dividedBy(10 ** fromToPrecision),
      fromToCurrency
    )

    let gasPricePaidRate = 1
    if (GAS_PRICE_PAID_RATE[CHAIN_INDEX[makerNode.toChain]]) {
      gasPricePaidRate = GAS_PRICE_PAID_RATE[CHAIN_INDEX[makerNode.toChain]]
    }
    const gasAmountUsd = await exchangeToUsd(
      new BigNumber(makerNode.gasAmount)
        .multipliedBy(gasPricePaidRate)
        .dividedBy(10 ** gasPrecision),
      makerNode.gasCurrency
    )

    return fromMinusToUsd.minus(gasAmountUsd || 0)
  } else {
    return new BigNumber(0)
  }
}

/**
 * get Earliest by fromTimeStamp
 * @returns
 */
export async function getEarliestMakerNode(): Promise<MakerNode | undefined> {
  return repositoryMakerNode().findOne({ order: { fromTimeStamp: 'ASC' } })
}

/**
 * get token's info
 * @param chainId
 * @param tokenAddress
 * @returns
 */
type GET_TOKEN_INFO_RETURN = {
  decimals: number // default: -1, when not found
  tokenName: string
}
export async function getTokenInfo(
  chainId: number,
  tokenAddress: string
): Promise<GET_TOKEN_INFO_RETURN> {
  let decimals = -1
  let tokenName = ''

  const makerList = await getMakerList()
  for (const item of makerList) {
    if (
      (item.c1ID == chainId || item.c2ID == chainId) &&
      (equalsIgnoreCase(item.t1Address, tokenAddress) ||
        equalsIgnoreCase(item.t2Address, tokenAddress))
    ) {
      decimals = item.precision
      tokenName = item.tName
      break
    }
  }

  return { decimals, tokenName }
}

/**
 * make transactionID
 * @param fromAddress
 * @param chainId
 * @param nonce
 */
export function makeTransactionID(
  fromAddress: string,
  chainId: number,
  nonce: string
) {
  return `${fromAddress.toLowerCase()}${chainId}${nonce}`
}
export function newMakeTransactionID(
  fromAddress: string,
  fromChainId: number | string,
  fromTxNonce: string | number,
  symbol: string | undefined
) {
  return `${fromAddress}${padStart(String(fromChainId), 4, '00')}${
    symbol || 'NULL'
  }${fromTxNonce}`.toLowerCase()
}

/**
 * Get maker nodes
 * @param makerAddress
 * @param fromChain 0: All
 * @param toChain 0: All
 * @param startTime start time
 * @param endTime end time
 * @param keyword transactionID | user | fromTx | toTx
 * @param userAddress user's address
 * @returns
 */
export async function getMakerNodes(
  makerAddress: string,
  fromChain = 0,
  toChain = 0,
  startTime = 0,
  endTime = 0,
  keyword = '',
  userAddress = ''
): Promise<MakerNode[]> {
  if (!makerAddress) {
    throw new ServiceError(
      'Sorry, params makerAddress miss',
      ServiceErrorCodes['arguments invalid']
    )
  }

  // Clean keyword
  if (
    equalsIgnoreCase(keyword, '0x') ||
    equalsIgnoreCase(keyword, makerAddress)
  ) {
    keyword = ''
  }

  // QueryBuilder
  const queryBuilder = repositoryMakerNode().createQueryBuilder()

  // where
  // When keyword is no empty, only use keyword
  queryBuilder.where('makerAddress = :makerAddress', {
    makerAddress,
  })
  const starknetL1MapL2 =
    makerConfig.starknetL1MapL2[
      process.env.NODE_ENV == 'development' ? 'georli-alpha' : 'mainnet-alpha'
    ]
  if (starknetL1MapL2[makerAddress.toLowerCase()]) {
    queryBuilder.where(
      'makerAddress in(:makerAddress)',
      { makerAddress: [starknetL1MapL2[makerAddress.toLowerCase()],makerAddress]}
    )
  }
  if (keyword) {
    queryBuilder.andWhere(
      'transactionID like :kw or userAddress like :kw or formTx like :kw or toTx like :kw',
      { kw: `%${keyword}%` }
    )
  } else {
    if (fromChain > 0) {
      queryBuilder.andWhere('fromChain = :fromChain', { fromChain })
    }
    if (toChain > 0) {
      queryBuilder.andWhere('toChain = :toChain', { toChain })
    }
    if (startTime) {
      queryBuilder.andWhere('fromTimeStamp >= :startTime', {
        startTime: dateFormatNormal(startTime),
      })
    }
    if (endTime) {
      queryBuilder.andWhere('fromTimeStamp <= :endTime', {
        endTime: dateFormatNormal(endTime),
      })
    }
    if (userAddress) {
      queryBuilder.andWhere('userAddress = :userAddress', { userAddress })
    }
  }

  // order by
  queryBuilder
    .addOrderBy('fromTimeStamp', 'DESC')
    .addOrderBy('toTimeStamp', 'DESC')

  const list = await queryBuilder.getMany()

  console.warn('list: ', list.length)

  return list
}

/**
 * Get target maker pool
 * @param makerAddress
 * @param tokenAddress
 * @param fromChainId
 * @param toChainId
 * @param transactionTime
 * @returns
 */
export async function getTargetMakerPool(
  makerAddress: string,
  tokenAddress: string,
  fromChainId: number,
  toChainId: number,
  transactionTime?: Date
) {
  if (!transactionTime) {
    transactionTime = new Date()
  }
  const transactionTimeStramp = parseInt(transactionTime.getTime() / 1000 + '')
  for (const maker of await getAllMakerList()) {
    const { pool1, pool2 } = expanPool(maker)
    if (
      pool1.makerAddress.toLowerCase() == makerAddress.toLowerCase() &&
      (equalsIgnoreCase(pool1.t1Address, tokenAddress) ||
        equalsIgnoreCase(pool1.t2Address, tokenAddress)) &&
      pool1.c1ID == fromChainId &&
      pool1.c2ID == toChainId &&
      transactionTimeStramp >= pool1.avalibleTimes[0].startTime &&
      transactionTimeStramp <= pool1.avalibleTimes[0].endTime
    ) {
      return pool1
    }
    if (
      pool2.makerAddress.toLowerCase() == makerAddress.toLowerCase() &&
      (equalsIgnoreCase(pool1.t1Address, tokenAddress) ||
        equalsIgnoreCase(pool1.t2Address, tokenAddress)) &&
      pool2.c2ID == fromChainId &&
      pool2.c1ID == toChainId &&
      transactionTimeStramp >= pool2.avalibleTimes[0].startTime &&
      transactionTimeStramp <= pool2.avalibleTimes[0].endTime
    ) {
      return pool2
    }
  }
  return undefined
}

export async function runTodo(makerAddress: string) {
  // find: do_current < do_max and state = 0
  const todos = await repositoryMakerNodeTodo()
    .createQueryBuilder()
    .where('makerAddress=:makerAddress and do_current < do_max AND state = 0', {
      makerAddress,
    })
    .getMany()

  for (const todo of todos) {
    const data = todo.data ? JSON.parse(todo.data) : {}
    // now only do sendTransaction
    if (todo.do_state === 20) {
      const {
        transactionID,
        fromChainID,
        toChainID,
        toChain,
        tokenAddress,
        amountStr,
        fromAddress,
        pool,
        nonce,
        result_nonce,
      } = data
      accessLogger.info(`runTodo item: transactionID=${transactionID}`)

      // only retry result_nonce > 0
      if (result_nonce > 0) {
        // do_current insert or update logic in sendTransaction
        await sendTransaction(
          todo.makerAddress,
          transactionID,
          fromChainID,
          toChainID,
          toChain,
          tokenAddress,
          amountStr,
          fromAddress,
          pool,
          nonce,
          result_nonce
        )
      }
    }
  }
}
