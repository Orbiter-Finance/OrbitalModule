import BigNumber from 'bignumber.js'
import { plainToInstance } from 'class-transformer'
import { isEthereumAddress } from 'class-validator'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Context, DefaultState } from 'koa'
import KoaRouter from 'koa-router'
import { makerConfig } from '../config'
import { DydxHelper } from '../service/dydx/dydx_helper'
import * as serviceMaker from '../service/maker'
import { getLastStatus, getMakerPulls } from '../service/maker_pull'
import * as serviceMakerWealth from '../service/maker_wealth'
import { getAmountToSend, getMakerList } from '../util/maker'
import { CHAIN_INDEX } from '../util/maker/core'

// extend relativeTime
dayjs.extend(relativeTime)
export default function (router: KoaRouter<DefaultState, Context>) {
  router.get('maker', async ({ restful }) => {
    const chains = <{ chainId: number; chainName: string }[]>[]
    const pushChain = (chainId: number, chainName: string) => {
      const find = chains.find((item) => item.chainId == chainId)
      if (find) {
        return
      }

      chains.push({ chainId, chainName })
    }
    const makerList = await getMakerList()
    for (const item of makerList) {
      pushChain(item.c1ID, item.c1Name)
      pushChain(item.c2ID, item.c2Name)
    }

    const earliestMakrNode = await serviceMaker.getEarliestMakerNode()
    let earliestTime = 0
    if (earliestMakrNode) {
      earliestTime = new Date(earliestMakrNode.fromTimeStamp).getTime()
    } else {
      earliestTime = new Date().getTime()
    }

    restful.json({ earliestTime, chains })
  })

  router.get('maker/nodes', async ({ request, restful }) => {
    // parse query
    const params = plainToInstance(
      class {
        makerAddress: string
        fromChain?: number
        toChain?: number
        startTime?: number
        endTime?: number
        keyword?: string
        userAddress?: string
      },
      request.query
    )
    const list = await serviceMaker.getMakerNodes(
      params.makerAddress,
      params.fromChain,
      params.toChain,
      Number(params.startTime),
      Number(params.endTime),
      params.keyword,
      params.userAddress
    )

    // fill data
    for (const item of list) {
      item['fromChainName'] = CHAIN_INDEX[item.fromChain] || ''
      item['toChainName'] = CHAIN_INDEX[item.toChain] || ''

      // format tokenName and amounts
      const fromChainTokenInfo = await serviceMaker.getTokenInfo(
        Number(item.fromChain),
        item.txToken
      )
      item['txTokenName'] = fromChainTokenInfo.tokenName
      item['fromAmountFormat'] = 0
      if (fromChainTokenInfo.decimals > -1) {
        item['fromAmountFormat'] = new BigNumber(item['fromAmount']).dividedBy(
          10 ** fromChainTokenInfo.decimals
        )
      }

      // to amounts
      const toChainTokenInfo = await serviceMaker.getTokenInfo(
        Number(item.fromChain),
        item.txToken
      )
      item['toAmountFormat'] = 0
      if (toChainTokenInfo.decimals > -1) {
        item['toAmountFormat'] = new BigNumber(item['toAmount']).dividedBy(
          10 ** toChainTokenInfo.decimals
        )
      }

      // Trade duration
      item['tradeDuration'] = 0

      // Time duration、time ago
      const dayjsFrom = dayjs(item.fromTimeStamp)
      item['fromTimeStampAgo'] = dayjs().to(dayjsFrom)
      item['toTimeStampAgo'] = '-'
      if (item.toTimeStamp && item.toTimeStamp != '0') {
        const dayjsTo = dayjs(item.toTimeStamp)
        item['toTimeStampAgo'] = dayjs().to(dayjsTo)

        item['tradeDuration'] = dayjsTo.unix() - dayjsFrom.unix()
      }

      let needTo = {
        chainId: 0,
        amount: 0,
        decimals: 0,
        amountFormat: '',
        tokenAddress: '',
      }

      if (item.state == 1 || item.state == 20) {
        const _fromChain = Number(item.fromChain)
        needTo.chainId = Number(
          serviceMaker.getAmountFlag(_fromChain, item.fromAmount)
        )

        // find pool
        const pool = await serviceMaker.getTargetMakerPool(
          item.makerAddress,
          item.txToken,
          _fromChain,
          needTo.chainId
        )

        // if not find pool, don't do it
        if (pool) {
          needTo.tokenAddress =
            needTo.chainId == pool.c1ID ? pool.t1Address : pool.t2Address

          needTo.amount =
            getAmountToSend(
              _fromChain,
              needTo.chainId,
              item.fromAmount,
              pool,
              item.formNonce
            )?.tAmount || 0
          needTo.decimals = pool.precision
          needTo.amountFormat = new BigNumber(needTo.amount)
            .dividedBy(10 ** pool.precision)
            .toString()
        }
      }
      item['needTo'] = needTo

      // Parse to dydx txExt
      if (item.fromExt && (item.toChain == '11' || item.toChain == '511')) {
        const dydxHelper = new DydxHelper(Number(item.toChain))
        item.fromExt['dydxInfo'] = dydxHelper.splitStarkKeyPositionId(
          item.fromExt.value
        )
      }

      // Profit statistics
      // (fromAmount - toAmount) / token's rate - gasAmount/gasCurrency's rate
      item['profitUSD'] = (await serviceMaker.statisticsProfit(item)).toFixed(3)
    }

    restful.json(list)
  })

  router.get('maker/wealths', async ({ request, restful }) => {
    const makerAddress = String(request.query.makerAddress || '')

    // let rst = Core.memoryCache.get(
    //   `${serviceMakerWealth.CACHE_KEY_GET_WEALTHS}:${makerAddress}`
    // )
    // if (!rst) {
    //   rst = await serviceMakerWealth.getWealths(makerAddress)
    // }

    // No need to cache temporarily, get real-time
    const rst = await serviceMakerWealth.getWealths(makerAddress)

    restful.json(rst)
  })

  router.get('maker/get_last_status', async ({ restful }) => {
    const lastStatus = getLastStatus()

    restful.json(lastStatus)
  })

  router.get('maker/miss_private_key_addresses', async ({ restful }) => {
    const makerAddresses = await serviceMaker.getMakerAddresses()
    const addresses: string[] = []
    for (const item of makerAddresses) {
      if (makerConfig.privateKeys[item.toLowerCase()]) {
        continue
      }

      addresses.push(item)
    }
    const starknetL1MapL2 = process.env.NODE_ENV == 'development'
      ? makerConfig.starknetL1MapL2['georli-alpha']
      : makerConfig.starknetL1MapL2['mainnet-alpha']
    if (starknetL1MapL2) {
      for (const L1 in starknetL1MapL2) {
        addresses.push(starknetL1MapL2[L1])
      }
    }
    restful.json(addresses)
  })

  // set makerConfig.privateKeys
  router.post('maker/privatekeys', async ({ request, restful }) => {
    const { body } = request

    const makerAddresses: string[] = []
    for (const makerAddress in body) {
      if (Object.prototype.hasOwnProperty.call(body, makerAddress)) {
        if (!isEthereumAddress(makerAddress)) {
          continue
        }
        if (
          !body[makerAddress] ||
          makerConfig.privateKeys[makerAddress.toLowerCase()]
        ) {
          continue
        }

        makerAddresses.push(makerAddress)

        makerConfig.privateKeys[makerAddress.toLowerCase()] = body[makerAddress]
      }
    }

    restful.json(makerAddresses.join(','))
  })

  router.get('maker/pulls', async ({ request, restful }) => {
    // parse query
    const params = plainToInstance(
      class {
        makerAddress: string
        startTime?: number
        endTime?: number
        fromOrToMaker?: number
      },
      request.query
    )

    const list = await getMakerPulls(
      params.makerAddress,
      params.startTime,
      params.endTime,
      params.fromOrToMaker == 1
    )

    for (const item of list) {
      item['chainName'] = CHAIN_INDEX[item.chainId] || ''

      // amount format
      const chainTokenInfo = await serviceMaker.getTokenInfo(
        Number(item.chainId),
        item.tokenAddress
      )
      item['amountFormat'] = 0
      if (chainTokenInfo.decimals > -1) {
        item['amountFormat'] = new BigNumber(item.amount).dividedBy(
          10 ** chainTokenInfo.decimals
        )
      }

      // time ago
      item['txTimeAgo'] = '-'
      if (item.txTime.getTime() > 0) {
        item['txTimeAgo'] = dayjs().to(dayjs(item.txTime))
      }
    }

    restful.json(list)
  })
}
