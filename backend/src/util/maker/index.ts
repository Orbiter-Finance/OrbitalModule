import { createAlchemyWeb3 } from '@alch/alchemy-web3'
import {
  AccountInfo,
  ChainId,
  ConnectorNames,
  ExchangeAPI,
  generateKeyPair,
  GlobalAPI,
  UserAPI,
} from '@loopring-web/loopring-sdk'
import axios from 'axios'
import BigNumber from 'bignumber.js'
import dayjs from 'dayjs'
import { getSelectorFromName } from 'starknet/dist/utils/stark'
import { Repository } from 'typeorm'
import Web3 from 'web3'
import { isEthTokenAddress, sleep } from '..'
import { makerConfig } from '../../config'
import { MakerNode } from '../../model/maker_node'
import { MakerNodeTodo } from '../../model/maker_node_todo'
import { MakerZkHash } from '../../model/maker_zk_hash'
import { BobaListen } from '../../service/boba/boba_listen'
import { factoryIMXListen } from '../../service/immutablex/imx_listen'
import { OpListen } from '../../service/optimistic/op_listen'
import OptimisticWS from '../../service/optimistic/ws'
import {
  getL1AddressByL2,
  getL2AddressByL1,
  getNetworkIdByChainId,
  getProviderByChainId,
  getStarknetAccount,
  saveMappingL1AndL2,
} from '../../service/starknet/helper'
import zkspace_help from '../../service/zkspace/zkspace_help'
import { Core } from '../core'
import { CrossAddress, CrossAddressExt } from '../cross_address'
import { accessLogger, errorLogger } from '../logger'
import * as orbiterCore from './core'
import { EthListen } from './eth_listen'
import { makerList, makerListHistory } from './maker_list'
import send from './send'
import { factoryStarknetListen } from './starknet_listen'
const PrivateKeyProvider = require('truffle-privatekey-provider')

const zkTokenInfo: any[] = []
const matchHashList: any[] = [] // Intercept multiple receive
let loopringStartTime: {} = {}
let loopringLastHash: string = ''
let accountInfo: AccountInfo
let lpKey: string

let zksLastTimeStamp: {} = {}

const repositoryMakerNode = (): Repository<MakerNode> => {
  return Core.db.getRepository(MakerNode)
}
const repositoryMakerNodeTodo = (): Repository<MakerNodeTodo> => {
  return Core.db.getRepository(MakerNodeTodo)
}
const repositoryMakerZkHash = (): Repository<MakerZkHash> => {
  return Core.db.getRepository(MakerZkHash)
}

const starknetMakers: { [key: string]: string } = {}
async function deployStarknetMaker(makerInfo: any, chainId: number) {
  if (chainId != 4 && chainId != 44) {
    return
  }

  const { makerAddress } = makerInfo

  try {
    if (typeof starknetMakers[makerAddress] === 'undefined') {
      starknetMakers[makerAddress] = ''

      const networkId = getNetworkIdByChainId(chainId)
      const account = await getStarknetAccount(makerAddress, networkId)
      accessLogger.info(`Deploying starknet, l1: ${makerAddress}`)

      while (true) {
        try {
          const provider = getProviderByChainId(chainId)
          const resp = await provider.callContract({
            contract_address: account.starknetAddress,
            entry_point_selector: getSelectorFromName('get_nonce'),
          })

          if (typeof resp.result?.[0] !== 'undefined') {
            accessLogger.info(
              `🎉Deployed starknet, l1: ${makerAddress}, starknet: ${account.starknetAddress}`
            )
            starknetMakers[makerAddress] = account.starknetAddress

            // Save L1 <=> L2
            saveMappingL1AndL2(makerAddress, networkId)

            break
          }
        } catch (err) {}

        await sleep(1000)
      }
    }

    // When deploying, wait it
    if (starknetMakers[makerAddress] === '') {
      while (true) {
        if (starknetMakers[makerAddress]) {
          break
        }

        await sleep(1000)
      }
    }
  } catch (err) {
    delete starknetMakers[makerAddress]
    errorLogger.error('Deploy starknet maker error: ' + err.message)
  }
}

export async function startMaker(makerInfo: any) {
  if (!makerInfo.t1Address || !makerInfo.t2Address) {
    return
  }

  await deployStarknetMaker(makerInfo, makerInfo.c1ID)
  await deployStarknetMaker(makerInfo, makerInfo.c2ID)

  watchPool(makerInfo)
}

export async function getMakerList() {
  return makerList
}

export async function getAllMakerList() {
  return makerList.concat(makerListHistory)
}

export function expanPool(pool) {
  return {
    pool1: {
      makerAddress: pool.makerAddress,
      c1ID: pool.c1ID,
      c2ID: pool.c2ID,
      c1Name: pool.c1Name,
      c2Name: pool.c2Name,
      t1Address: pool.t1Address,
      t2Address: pool.t2Address,
      tName: pool.tName,
      minPrice: pool.c1MinPrice,
      maxPrice: pool.c1MaxPrice,
      precision: pool.precision,
      avalibleDeposit: pool.c1AvalibleDeposit,
      tradingFee: pool.c1TradingFee,
      gasFee: pool.c1GasFee,
      avalibleTimes: pool.c1AvalibleTimes,
    },
    pool2: {
      makerAddress: pool.makerAddress,
      c1ID: pool.c1ID,
      c2ID: pool.c2ID,
      c1Name: pool.c1Name,
      c2Name: pool.c2Name,
      t1Address: pool.t1Address,
      t2Address: pool.t2Address,
      tName: pool.tName,
      minPrice: pool.c2MinPrice,
      maxPrice: pool.c2MaxPrice,
      precision: pool.precision,
      avalibleDeposit: pool.c2AvalibleDeposit,
      tradingFee: pool.c2TradingFee,
      gasFee: pool.c2GasFee,
      avalibleTimes: pool.c2AvalibleTimes,
    },
  }
}

function watchPool(pool) {
  const expan = expanPool(pool)
  // accessLogger.info('userpool1 =', expan.pool1)
  // accessLogger.info('userpool2 =', expan.pool2)

  watchTransfers(expan.pool1, 0)
  watchTransfers(expan.pool2, 1)
}

/*
  pool
  state    0 / 1   listen C1 /  listen C2
 */
async function watchTransfers(pool, state) {
  // check
  if (!makerConfig[pool.c1Name]) {
    accessLogger.warn(`Miss [${pool.c1Name}] maker config!`)
    return
  }
  if (!makerConfig[pool.c2Name]) {
    accessLogger.warn(`Miss [${pool.c2Name}] maker config!`)
    return
  }

  // Instantiate web3 with WebSocketProvider
  const makerAddress = pool.makerAddress
  let api = state ? makerConfig[pool.c2Name].api : makerConfig[pool.c1Name].api
  let wsEndPoint = state
    ? makerConfig[pool.c2Name].wsEndPoint
    : makerConfig[pool.c1Name].wsEndPoint
  let httpEndPoint = state
    ? makerConfig[pool.c2Name].httpEndPoint
    : makerConfig[pool.c1Name].httpEndPoint
  let tokenAddress = state ? pool.t2Address : pool.t1Address
  let fromChainID = state ? pool.c2ID : pool.c1ID
  let toChainID = state ? pool.c1ID : pool.c2ID

  // zk || zk_test
  if (fromChainID == 3 || fromChainID == 33) {
    const zkTokenInfoUrl = httpEndPoint + '/tokens/' + tokenAddress
    axios
      .get(zkTokenInfoUrl)
      .then(function (response) {
        if (response.status === 200) {
          var respData = response.data
          if (respData.status === 'success') {
            zkTokenInfo.push(respData.result)
            accessLogger.info('zkTokenInfo =', zkTokenInfo)
          } else {
            // error
          }
        } else {
          // error
        }
      })
      .catch(function (error) {
        errorLogger.error('error =', error)
      })

    confirmZKTransaction(httpEndPoint, pool, tokenAddress, state)
    return
  }

  // checkData
  const checkData = (amount: string, transactionHash: string) => {
    const ptext = orbiterCore.getPTextFromTAmount(fromChainID, amount)
    if (ptext.state === false) {
      return false
    }
    const pText = ptext.pText
    let validPText = (9000 + Number(toChainID)).toString()
    const realAmount = orbiterCore.getRAmountFromTAmount(fromChainID, amount)
    if (realAmount.state === false) {
      return false
    }
    const rAmount = <any>realAmount.rAmount
    if (
      new BigNumber(rAmount).comparedTo(
        new BigNumber(pool.maxPrice)
          .plus(new BigNumber(pool.tradingFee))
          .multipliedBy(new BigNumber(10 ** pool.precision))
      ) === 1 ||
      new BigNumber(rAmount).comparedTo(
        new BigNumber(pool.minPrice)
          .plus(new BigNumber(pool.tradingFee))
          .multipliedBy(new BigNumber(10 ** pool.precision))
      ) === -1 ||
      pText !== validPText
    ) {
      return false
    } else {
      if (matchHashList.indexOf(transactionHash) > -1) {
        accessLogger.info('event.transactionHash exist: ' + transactionHash)
        return false
      }
      matchHashList.push(transactionHash)

      // Initiate transaction confirmation
      accessLogger.info('match one transaction >>> ', transactionHash)

      return true
    }
  }

  // starknet || starknet_test
  if (fromChainID == 4 || fromChainID == 44) {
    const _api = state
      ? makerConfig[pool.c2Name].api
      : makerConfig[pool.c1Name].api
    const networkId = getNetworkIdByChainId(fromChainID)
    getL2AddressByL1(makerAddress, networkId)
      .then((starknetAddressMaker) => {
        accessLogger.info('Starknet transfer listen: ' + starknetAddressMaker)

        const skl = factoryStarknetListen(_api)
        skl.transfer(
          {
            to: starknetAddressMaker,
          },
          {
            onConfirmation: (transaction) => {
              if (!transaction.hash) {
                return
              }

              if (
                checkData(transaction.value + '', transaction.hash) === true
              ) {
                confirmSNTransaction(pool, state, transaction)
              }
            },
          }
        )
      })
      .catch((err) => {
        errorLogger.error('GetL2AddressByL1 faild: ' + err.message)
      })
    return
  }

  // immutablex || immutablex_test
  if (fromChainID == 8 || fromChainID == 88) {
    accessLogger.info(
      `Immutablex transfer listen: ${makerAddress}, toChainId: ${toChainID}`
    )
    const imxListen = factoryIMXListen(fromChainID, makerAddress)
    imxListen.transfer(
      { to: makerAddress },
      {
        onConfirmation: (transaction: any) => {
          if (!transaction.hash) {
            return
          }

          if (checkData(transaction.value + '', transaction.hash) === true) {
            confirmIMXTransaction(pool, state, transaction)
          }
        },
      }
    )
    return
  }

  // loopring || loopring_test
  if (fromChainID == 9 || fromChainID == 99) {
    try {
      confirmLPTransaction(pool, tokenAddress, state)
    } catch (error) {
      console.log('error =', error)
      throw 'getLPTransactionDataError'
    }
    return
  }

  // dydx || dydx_test (Can't transfer out now!)
  if (fromChainID == 11 || fromChainID == 511) {
    return
  }

  // zkspace || zkspace_test
  if (fromChainID == 12 || fromChainID == 512) {
    try {
      confirmZKSTransaction(pool, tokenAddress, state)
    } catch (error) {
      console.log('error =', error)
      throw 'getZKSTransactionDataError'
    }
    return
  }

  const web3 = createAlchemyWeb3(wsEndPoint)
  // boba
  if (fromChainID == 13 || fromChainID === 513) {
    let startBlockNumber = 0
    new BobaListen(api, makerAddress, 'txlist', wsEndPoint, async () => {
      if (startBlockNumber) {
        return startBlockNumber + ''
      } else {
        // Current block number +1, to prevent restart too fast!!!
        startBlockNumber = (await web3.eth.getBlockNumber()) + 1
        return startBlockNumber + ''
      }
    }).transfer(
      { to: makerAddress },
      {
        onConfirmation: async (transaction) => {
          if (!transaction.hash) {
            return
          }
          startBlockNumber = transaction.blockNumber
          if (checkData(transaction.value + '', transaction.hash) === true) {
            confirmFromTransaction(pool, state, transaction.hash, 1)
          }
        },
      }
    )
    return
  }
  // op ws scan block patch
  if (fromChainID === 7 || fromChainID === 77) {
    let startBlockNumber = 0
    new OpListen(api, makerAddress, 'txlist', async () => {
      if (startBlockNumber) {
        return startBlockNumber + ''
      } else {
        // Current block number +1, to prevent restart too fast!!!
        startBlockNumber = (await web3.eth.getBlockNumber()) + 1
        return startBlockNumber + ''
      }
    }).transfer(
      { to: makerAddress },
      {
        onConfirmation: async (transaction) => {
          if (!transaction.hash) {
            return
          }
          startBlockNumber = transaction.blockNumber
          if (checkData(transaction.value + '', transaction.hash) === true) {
            confirmFromTransaction(pool, state, transaction.hash)
          }
        },
      }
    )
  }

  if (fromChainID == 13 || fromChainID === 513) {
    let startBlockNumber = 0
    new BobaListen(api, makerAddress, 'txlist', wsEndPoint, async () => {
      if (startBlockNumber) {
        return startBlockNumber + ''
      } else {
        // Current block number +1, to prevent restart too fast!!!
        startBlockNumber = (await web3.eth.getBlockNumber()) + 1
        return startBlockNumber + ''
      }
    }).transfer(
      { to: makerAddress },
      {
        onConfirmation: async (transaction) => {
          if (!transaction.hash) {
            return
          }
          startBlockNumber = transaction.blockNumber
          if (checkData(transaction.value + '', transaction.hash) === true) {
            confirmFromTransaction(pool, state, transaction.hash, 1)
          }
        },
      }
    )
    return
  }

  const isPolygon = fromChainID == 6 || fromChainID == 66
  const isMetis = fromChainID == 10 || fromChainID == 510
  if (isEthTokenAddress(tokenAddress)) {
    let startBlockNumber = 0
    new EthListen(
      api,
      makerAddress,
      isPolygon || isMetis ? 'tokentx' : 'txlist',
      async () => {
        if (startBlockNumber) {
          return startBlockNumber + ''
        } else {
          // Current block number +1, to prevent restart too fast!!!
          startBlockNumber = (await web3.eth.getBlockNumber()) + 1
          return startBlockNumber + ''
        }
      }
    ).transfer(
      { to: makerAddress },
      {
        onConfirmation: async (transaction) => {
          if (!transaction.hash) {
            return
          }
          startBlockNumber = transaction.blockNumber
          if (checkData(transaction.value + '', transaction.hash) === true) {
            confirmFromTransaction(pool, state, transaction.hash)
          }
        },
      }
    )
  } else {
    // Instantiate token contract object with JSON ABI and address
    const tokenContract = new web3.eth.Contract(
      <any>makerConfig.ABI,
      tokenAddress
    )

    // Generate filter options
    const options = { filter: { to: makerAddress }, fromBlock: 'latest' }

    // Subscribe to Transfer events matching filter criteria
    tokenContract.events
      .Transfer(options, (error, event) => {
        if (error) {
          errorLogger.error('wsEndPoint =', wsEndPoint)
          errorLogger.error(error)
          return
        }

        if (event.returnValues.to === makerAddress) {
          if (
            checkData(event.returnValues.value, event.transactionHash) === true
          ) {
            confirmFromTransaction(pool, state, event.transactionHash)
          }
        } else {
          accessLogger.info('over')
        }
      })
      .on('connected', (subscriptionId: string) => {
        accessLogger.info(
          'contract subscriptionId =',
          subscriptionId,
          ' time =',
          getTime()
        )
      })
  }
}

function confirmZKTransaction(httpEndPoint, pool, tokenAddress, state) {
  let isFirst = true
  const ticker = async () => {
    const makerAddress = pool.makerAddress
    let fromChainID = state ? pool.c2ID : pool.c1ID
    let toChainID = state ? pool.c1ID : pool.c2ID
    let toChain = state ? pool.c1Name : pool.c2Name
    let validPText = (9000 + Number(toChainID)).toString()

    let lastHash = ''
    try {
      const makerZkHash = await repositoryMakerZkHash().findOne(
        {
          makerAddress,
          validPText: validPText,
          tokenAddress,
        },
        { select: ['id', 'txhash'] }
      )
      if (makerZkHash) {
        lastHash = makerZkHash.txhash
      }
    } catch (error) {
      errorLogger.error('isHaveZkHashError =', error)
    }
    var zkInfoParams = {
      from: lastHash ? lastHash : 'latest',
      limit: 100,
      direction: 'newer',
    }
    const url = httpEndPoint + '/accounts/' + makerAddress + '/transactions'
    axios
      .get(url, {
        params: zkInfoParams,
      })
      .then(async function (response) {
        if (response.status === 200) {
          var respData = response.data
          if (respData.status === 'success') {
            if (respData.result.list.length !== 0) {
              for (
                let index = 0;
                index < respData.result.list.length;
                index++
              ) {
                const element = respData.result.list[index]
                if (
                  element.failReason === null &&
                  element.op.type === 'Transfer' &&
                  (element.status === 'committed' ||
                    element.status === 'finalized')
                ) {
                  let tokenID = getZKTokenID(tokenAddress)

                  const ptext = orbiterCore.getPTextFromTAmount(
                    fromChainID,
                    element.op.amount
                  )
                  if (ptext.state === false) {
                    continue
                  }
                  const pText = ptext.pText

                  const realAmount = orbiterCore.getRAmountFromTAmount(
                    fromChainID,
                    element.op.amount
                  )
                  if (realAmount.state === false) {
                    continue
                  }
                  const rAmount = <any>realAmount.rAmount
                  if (
                    new BigNumber(rAmount).comparedTo(
                      new BigNumber(pool.maxPrice)
                        .plus(new BigNumber(pool.tradingFee))
                        .multipliedBy(new BigNumber(10 ** pool.precision))
                    ) === 1 ||
                    new BigNumber(rAmount).comparedTo(
                      new BigNumber(pool.minPrice)
                        .plus(new BigNumber(pool.tradingFee))
                        .multipliedBy(new BigNumber(10 ** pool.precision))
                    ) === -1 ||
                    pText !== validPText
                  ) {
                    // donothing
                  } else {
                    if (
                      element.txHash !== lastHash &&
                      element.op.type === 'Transfer' &&
                      element.op.to.toLowerCase() ===
                        makerAddress.toLowerCase() &&
                      element.op.token === tokenID &&
                      pText === validPText
                    ) {
                      if (matchHashList.indexOf(element.txHash) > -1) {
                        accessLogger.info(
                          'zkEvent.transactionHash exist: ' + element.txHash
                        )
                        continue
                      }
                      matchHashList.push(element.txHash)
                      accessLogger.info('element =', element)
                      accessLogger.info('match one transaction')
                      let nonce = element.op.nonce
                      accessLogger.info(
                        'Transaction with hash ' +
                          element.txHash +
                          ' nonce ' +
                          nonce +
                          ' has found'
                      )
                      var transactionID =
                        element.op.from.toLowerCase() + fromChainID + nonce
                      let makerNode: MakerNode | undefined
                      try {
                        makerNode = await repositoryMakerNode().findOne(
                          { transactionID: transactionID },
                          { select: ['id'] }
                        )
                      } catch (error) {
                        errorLogger.error('zk_isHaveSqlError =', error)
                        continue
                      }
                      if (!makerNode && !isFirst) {
                        accessLogger.info('newTransacioonID =', transactionID)
                        await repositoryMakerNode()
                          .insert({
                            transactionID: transactionID,
                            userAddress: element.op.from,
                            makerAddress,
                            fromChain: fromChainID,
                            toChain: toChainID,
                            formTx: element.txHash,
                            fromTimeStamp: orbiterCore.transferTimeStampToTime(
                              element.createdAt ? element.createdAt : '0'
                            ),
                            fromAmount: element.op.amount,
                            formNonce: element.op.nonce,
                            txToken: tokenAddress,
                            state: 1,
                          })
                          .then(async () => {
                            const toTokenAddress = state
                              ? pool.t1Address
                              : pool.t2Address
                            sendTransaction(
                              makerAddress,
                              transactionID,
                              fromChainID,
                              toChainID,
                              toChain,
                              toTokenAddress,
                              element.op.amount,
                              element.op.from,
                              pool,
                              element.op.nonce
                            )
                          })
                          .catch((error) => {
                            errorLogger.error('newTransactionSqlError =', error)
                            return
                          })
                      }
                    }
                  }
                  if (index === respData.result.list.length - 1) {
                    if (lastHash && element.txHash !== lastHash) {
                      try {
                        await repositoryMakerZkHash().update(
                          {
                            makerAddress,
                            validPText: validPText,
                            tokenAddress,
                          },
                          { txhash: element.txHash }
                        )
                        accessLogger.info('update success')
                      } catch (error) {
                        if (error) {
                          errorLogger.error('updateHashError =', error)
                        }
                      }
                    }
                    if (!lastHash) {
                      try {
                        const rst = await repositoryMakerZkHash().insert({
                          makerAddress,
                          validPText: validPText,
                          tokenAddress,
                          txhash: element.txHash,
                        })
                        accessLogger.info('newHashResult =', rst)
                      } catch (error) {
                        //error
                        // errorLogger.error('newHashSqlError =', error)
                      }
                    }
                  }
                }
              }
            }
          } else {
            errorLogger.error('error1 =', respData)
          }
        } else {
          errorLogger.error('error2 =', respData)
        }
        isFirst = false
      })
      .catch(function (error) {
        errorLogger.error('error3 = getZKTransactionListError', error)
      })
  }

  setInterval(ticker, 10 * 1000)
}

async function checkLoopringAccountKey(makerAddress, fromChainID) {
  let netWorkID = fromChainID == 9 ? 1 : 5
  const exchangeApi = new ExchangeAPI({ chainId: netWorkID })
  const userApi = new UserAPI({ chainId: netWorkID })
  let GetAccountRequest = {
    owner: makerAddress,
  }
  if (!accountInfo) {
    let AccountResult = await exchangeApi.getAccount(GetAccountRequest)

    if (AccountResult.accInfo && AccountResult.raw_data) {
      accountInfo = AccountResult.accInfo
    } else {
      throw Error('account unlocked')
    }
  }
  if (!lpKey) {
    const { exchangeInfo } = await exchangeApi.getExchangeInfo()
    const provider = new PrivateKeyProvider(
      makerConfig.privateKeys[makerAddress],
      fromChainID == 9
        ? makerConfig['mainnet'].httpEndPoint
        : 'https://eth-goerli.alchemyapi.io/v2/fXI4wf4tOxNXZynELm9FIC_LXDuMGEfc'
    )
    try {
      const localWeb3 = new Web3(provider)
      let options = {
        web3: localWeb3,
        address: makerAddress,
        keySeed:
          accountInfo.keySeed && accountInfo.keySeed !== ''
            ? accountInfo.keySeed
            : GlobalAPI.KEY_MESSAGE.replace(
                '${exchangeAddress}',
                exchangeInfo.exchangeAddress
              ).replace('${nonce}', (accountInfo.nonce - 1).toString()),
        walletType: ConnectorNames.WalletLink,
        chainId: fromChainID == 99 ? ChainId.GOERLI : ChainId.MAINNET,
      }
      const eddsaKey = await generateKeyPair(options)
      let GetUserApiKeyRequest = {
        accountId: accountInfo.accountId,
      }
      const { apiKey } = await userApi.getUserApiKey(
        GetUserApiKeyRequest,
        eddsaKey.sk
      )
      lpKey = apiKey
      if (!apiKey) {
        throw Error('Get Loopring ApiKey Error')
      }
    } catch (err) {
      throw err
    } finally {
      // Stop web3-provider-engine. Prevent data from being pulled all the time
      provider.engine.stop()
    }
  }
}

function confirmLPTransaction(pool, tokenAddress, state) {
  const ticker = async () => {
    try {
      const makerAddress = pool.makerAddress
      let fromChainID = state ? pool.c2ID : pool.c1ID
      let toChainID = state ? pool.c1ID : pool.c2ID
      let toChain = state ? pool.c1Name : pool.c2Name
      let validPText = (9000 + Number(toChainID)).toString()
      if (!loopringStartTime[toChain]) {
        loopringStartTime[toChain] = new Date().getTime()
      }
      let netWorkID = fromChainID == 9 ? 1 : 5
      const userApi = new UserAPI({ chainId: netWorkID })
      try {
        await checkLoopringAccountKey(makerAddress, fromChainID)
      } catch (error) {
        errorLogger.error('checkLoopringAccountKeyError =', error)
      }
      const GetUserTransferListRequest = {
        accountId: accountInfo?.accountId,
        start: loopringStartTime[toChain],
        end: 99999999999999,
        status: 'processed',
        limit: 50,
        tokenSymbol: 'ETH',
        transferTypes: 'transfer',
      }
      const LPTransferResult = await userApi.getUserTransferList(
        GetUserTransferListRequest,
        lpKey
      )
      if (
        LPTransferResult.totalNum !== 0 &&
        LPTransferResult.userTransfers?.length !== 0
      ) {
        let transacionts = LPTransferResult.userTransfers.reverse()
        for (let index = 0; index < transacionts.length; index++) {
          const lpTransaction = transacionts[index]
          if (loopringStartTime[toChain] < lpTransaction.timestamp) {
            loopringStartTime[toChain] = lpTransaction.timestamp + 1
            accessLogger.info(
              'loopringStartTime[',
              toChain,
              '] =',
              loopringStartTime[toChain]
            )
          }
          if (
            lpTransaction.status == 'processed' &&
            lpTransaction.txType == 'TRANSFER' &&
            lpTransaction.receiverAddress.toLowerCase() ==
              makerAddress.toLowerCase() &&
            lpTransaction.symbol == 'ETH' &&
            lpTransaction.hash !== loopringLastHash
          ) {
            const pText = lpTransaction.memo
            const rAmount = lpTransaction.amount
            if (
              new BigNumber(rAmount).comparedTo(
                new BigNumber(pool.maxPrice)
                  .plus(new BigNumber(pool.tradingFee))
                  .multipliedBy(new BigNumber(10 ** pool.precision))
              ) === 1 ||
              new BigNumber(rAmount).comparedTo(
                new BigNumber(pool.minPrice)
                  .plus(new BigNumber(pool.tradingFee))
                  .multipliedBy(new BigNumber(10 ** pool.precision))
              ) === -1 ||
              pText !== validPText
            ) {
              // donothing
            } else {
              if (pText == validPText) {
                if (matchHashList.indexOf(lpTransaction.hash) > -1) {
                  accessLogger.info(
                    'loopEvent.transactionHash exist: ' + lpTransaction.hash
                  )
                  continue
                }
                matchHashList.push(lpTransaction.hash)
                loopringLastHash = lpTransaction.hash
                accessLogger.info('element =', lpTransaction)
                accessLogger.info('match one transaction')
                let nonce = (lpTransaction['storageInfo'].storageId - 1) / 2
                accessLogger.info(
                  'Transaction with hash ' +
                    lpTransaction.hash +
                    ' storageID ' +
                    (nonce * 2 + 1) +
                    ' has found'
                )
                var transactionID =
                  lpTransaction.senderAddress.toLowerCase() +
                  fromChainID +
                  nonce
                let makerNode: MakerNode | undefined
                try {
                  makerNode = await repositoryMakerNode().findOne(
                    { transactionID: transactionID },
                    { select: ['id'] }
                  )
                } catch (error) {
                  errorLogger.error('lp_isHaveSqlError =', error)
                  break
                }
                if (!makerNode) {
                  accessLogger.info('newTransacioonID =', transactionID)
                  await repositoryMakerNode()
                    .insert({
                      transactionID: transactionID,
                      userAddress: lpTransaction.senderAddress,
                      makerAddress,
                      fromChain: fromChainID,
                      toChain: toChainID,
                      formTx: lpTransaction.hash,
                      fromTimeStamp: orbiterCore.transferTimeStampToTime(
                        lpTransaction.timestamp ? lpTransaction.timestamp : '0'
                      ),
                      fromAmount: lpTransaction.amount,
                      formNonce: nonce + '',
                      txToken: tokenAddress,
                      state: 1,
                    })
                    .then(async () => {
                      const toTokenAddress = state
                        ? pool.t1Address
                        : pool.t2Address
                      sendTransaction(
                        makerAddress,
                        transactionID,
                        fromChainID,
                        toChainID,
                        toChain,
                        toTokenAddress,
                        lpTransaction.amount,
                        lpTransaction.senderAddress,
                        pool,
                        nonce
                      )
                    })
                    .catch((error) => {
                      errorLogger.error('newTransactionSqlError =', error)
                      return
                    })
                }
              }
            }
          }
        }
      }
    } catch (error) {
      errorLogger.error('loopringError =', error)
    }
  }
  setInterval(ticker, 10 * 1000)
}

function confirmZKSTransaction(pool, tokenAddress, state) {
  let startPoint = 0
  let allZksList: any[] = []
  const ticker = async () => {
    try {
      const makerAddress = pool.makerAddress
      let fromChainID = state ? pool.c2ID : pool.c1ID
      let fromChain = state ? pool.c2Name : pool.c1Name
      let toChainID = state ? pool.c1ID : pool.c2ID
      let toChain = state ? pool.c1Name : pool.c2Name
      const url = `${makerConfig[fromChain].httpEndPoint}/txs?types=Transfer&address=${makerAddress}&token=0&start=${startPoint}&limit=50`
      try {
        let zksResponse = await axios.get(url)
        if (
          zksResponse.status === 200 &&
          zksResponse.data &&
          zksResponse.data.success
        ) {
          var respData = zksResponse.data
          let originZksList = respData.data.data.reverse()
          if (originZksList[0] && !zksLastTimeStamp[toChain]) {
            zksLastTimeStamp[toChain] =
              originZksList[originZksList.length - 1].created_at
            accessLogger.info(
              `new_zksLastTimeStamp[${toChain}] =${zksLastTimeStamp[toChain]}`
            )
          }
          let zksList: any[] = []
          allZksList.push(...originZksList)
          let firstTxTime = originZksList[0].created_at
            ? originZksList[0].created_at
            : 0
            ? originZksList[0].created_at
            : 0
          let whileTag = true
          while (whileTag) {
            if (
              zksLastTimeStamp[toChain] < firstTxTime &&
              originZksList.length == 50
            ) {
              startPoint = startPoint + 50
              const moreUrl = `${makerConfig[fromChain].httpEndPoint}/txs?types=Transfer&address=${makerAddress}&token=0&start=${startPoint}&limit=50`
              let moreZksResponse = await axios.get(moreUrl)
              if (
                moreZksResponse.status === 200 &&
                moreZksResponse.data &&
                moreZksResponse.data.success
              ) {
                var moreRespData = moreZksResponse.data
                let moreOriginZksList = moreRespData.data.data.reverse()
                firstTxTime = moreOriginZksList[0].created_at
                allZksList.unshift(...moreOriginZksList)
              }
              continue
            } else if (startPoint) {
              //to the last new txs and catch all new tx
              startPoint = 0
              whileTag = false
            } else {
              // new is not fullA
              whileTag = false
            }
          }
          zksList = allZksList
          allZksList = []
          for (let zksTransaction of zksList) {
            if (zksLastTimeStamp[toChain] < zksTransaction.created_at) {
              zksLastTimeStamp[toChain] = zksTransaction.created_at
              accessLogger.info(
                'zksLastTimeStamp[',
                toChain,
                '] =',
                zksLastTimeStamp[toChain]
              )
            } else {
              continue
            }
            if (
              (zksTransaction.status == 'verified' ||
                zksTransaction.status == 'pending') &&
              zksTransaction.tx_type == 'Transfer' &&
              zksTransaction.token.symbol == 'ETH' &&
              zksTransaction.to.toLowerCase() == makerAddress.toLowerCase()
            ) {
              const amount = new BigNumber(zksTransaction.amount).multipliedBy(
                new BigNumber(10 ** pool.precision)
              )
              const transactionHash = zksTransaction.tx_hash
              const ptext = orbiterCore.getPTextFromTAmount(fromChainID, amount)
              if (ptext.state === false) {
                continue
              }
              const pText = ptext.pText
              let validPText = (9000 + Number(toChainID)).toString()
              const realAmount = orbiterCore.getRAmountFromTAmount(
                fromChainID,
                amount
              )
              if (realAmount.state === false) {
                continue
              }
              const rAmount = <any>realAmount.rAmount
              if (
                new BigNumber(rAmount).comparedTo(
                  new BigNumber(pool.maxPrice)
                    .plus(new BigNumber(pool.tradingFee))
                    .multipliedBy(new BigNumber(10 ** pool.precision))
                ) === 1 ||
                new BigNumber(rAmount).comparedTo(
                  new BigNumber(pool.minPrice)
                    .plus(new BigNumber(pool.tradingFee))
                    .multipliedBy(new BigNumber(10 ** pool.precision))
                ) === -1 ||
                pText !== validPText
              ) {
                continue
              } else {
                if (pText == validPText) {
                  if (matchHashList.indexOf(transactionHash) > -1) {
                    accessLogger.info(
                      'zks.matchHashList.transactionHash exist: ' +
                        transactionHash
                    )
                    continue
                  }
                  matchHashList.push(transactionHash)
                  // Initiate transaction confirmation
                  accessLogger.info(
                    'match one zks.transaction >>> ',
                    transactionHash
                  )
                  let nonce = zksTransaction.nonce
                  accessLogger.info(
                    'zks.Transaction with hash ' +
                      transactionHash +
                      ' storageID ' +
                      nonce +
                      ' has found'
                  )
                  var transactionID =
                    zksTransaction.from.toLowerCase() + fromChainID + nonce
                  let makerNode: MakerNode | undefined
                  try {
                    makerNode = await repositoryMakerNode().findOne(
                      { transactionID: transactionID },
                      { select: ['id'] }
                    )
                  } catch (error) {
                    errorLogger.error('zks_isHaveSqlError =', error)
                    break
                  }
                  if (!makerNode) {
                    accessLogger.info('zks.newTransacioonID =', transactionID)
                    await repositoryMakerNode()
                      .insert({
                        transactionID: transactionID,
                        userAddress: zksTransaction.from,
                        makerAddress,
                        fromChain: fromChainID,
                        toChain: toChainID,
                        formTx: transactionHash,
                        fromTimeStamp: orbiterCore.transferTimeStampToTime(
                          zksTransaction.created_at
                            ? zksTransaction.created_at
                            : '0'
                        ),
                        fromAmount: amount + '',
                        formNonce: nonce + '',
                        txToken: tokenAddress,
                        state: 1,
                      })
                      .then(async () => {
                        const toTokenAddress = state
                          ? pool.t1Address
                          : pool.t2Address
                        sendTransaction(
                          makerAddress,
                          transactionID,
                          fromChainID,
                          toChainID,
                          toChain,
                          toTokenAddress,
                          amount + '',
                          zksTransaction.from,
                          pool,
                          nonce
                        )
                      })
                      .catch((error) => {
                        errorLogger.error('newTransactionSqlError =', error)
                        return
                      })
                  }
                }
              }
            }
          }
        } else {
          errorLogger.error('zksTxListError1 = NetWorkError')
        }
      } catch (error) {
        errorLogger.error('zksTxListError2 =', error)
      }
    } catch (error) {
      errorLogger.error('zkspaceError =', error)
    }
  }
  setInterval(ticker, 10 * 1000)
}

async function confirmSNTransaction(pool: any, state: any, transaction: any) {
  const makerAddress = pool.makerAddress
  const toChain = state ? pool.c1Name : pool.c2Name
  const tokenAddress = state ? pool.t2Address : pool.t1Address
  const toChainID = state ? pool.c1ID : pool.c2ID
  const fromChainID = state ? pool.c2ID : pool.c1ID
  const { hash, from, nonce, timeStamp, value, txreceipt_status } = transaction

  accessLogger.info(
    'Starknet Transaction with hash ' + hash + ', status: ' + txreceipt_status
  )
  const networkId = getNetworkIdByChainId(fromChainID)
  let fromL1Address = ''
  try {
    fromL1Address = await getL1AddressByL2(from, networkId)
  } catch (err) {}

  // check
  if (!fromL1Address) {
    return
  }

  const transactionID = fromL1Address.toLowerCase() + fromChainID + nonce

  let makerNode: MakerNode | undefined
  try {
    makerNode = await repositoryMakerNode().findOne({
      transactionID: transactionID,
    })
  } catch (error) {
    errorLogger.error('isHaveSqlError =', error)
    return
  }

  if (!makerNode) {
    try {
      await repositoryMakerNode().insert({
        transactionID: transactionID,
        userAddress: fromL1Address,
        makerAddress,
        fromChain: fromChainID,
        toChain: toChainID,
        formTx: hash,
        fromTimeStamp: orbiterCore.transferTimeStampToTime(timeStamp || '0'),
        fromAmount: value,
        formNonce: nonce,
        txToken: tokenAddress,
        state: 0,
      })
      accessLogger.info('add success')
    } catch (error) {
      errorLogger.error('newTransactionSqlError =', error)
    }
  }

  accessLogger.info(
    'Transaction with hash ' + hash + ' has been successfully confirmed'
  )
  accessLogger.info(
    'updateFromSql =',
    `state = 1 WHERE transactionID = '${transactionID}'`
  )
  try {
    await repositoryMakerNode().update(
      { transactionID: transactionID },
      { state: 1 }
    )
    accessLogger.info('update success')
  } catch (error) {
    errorLogger.error('updateFromError =', error)
    return
  }

  const toTokenAddress = state ? pool.t1Address : pool.t2Address

  sendTransaction(
    makerAddress,
    transactionID,
    fromChainID,
    toChainID,
    toChain,
    toTokenAddress,
    value,
    fromL1Address,
    pool,
    nonce
  )
}

async function confirmIMXTransaction(pool: any, state: any, transaction: any) {
  const makerAddress = pool.makerAddress
  const toChain = state ? pool.c1Name : pool.c2Name
  const tokenAddress = state ? pool.t2Address : pool.t1Address
  const toChainID = state ? pool.c1ID : pool.c2ID
  const fromChainID = state ? pool.c2ID : pool.c1ID
  const { hash, from, nonce, timeStamp, value, txreceipt_status } = transaction

  accessLogger.info(
    'ImmutableX Transaction with hash ' + hash + ', status: ' + txreceipt_status
  )

  const transactionID = from.toLowerCase() + fromChainID + nonce

  let makerNode: MakerNode | undefined
  try {
    makerNode = await repositoryMakerNode().findOne({
      transactionID: transactionID,
    })
  } catch (error) {
    errorLogger.error('isHaveSqlError =', error)
    return
  }

  if (!makerNode) {
    try {
      await repositoryMakerNode().insert({
        transactionID: transactionID,
        userAddress: from,
        makerAddress,
        fromChain: fromChainID,
        toChain: toChainID,
        formTx: hash,
        fromTimeStamp: orbiterCore.transferTimeStampToTime(timeStamp || '0'),
        fromAmount: value,
        formNonce: nonce,
        txToken: tokenAddress,
        state: 0,
      })
      accessLogger.info('add success')
    } catch (error) {
      errorLogger.error('newTransactionSqlError =', error)
    }
  }

  accessLogger.info(
    'Transaction with hash ' + hash + ' has been successfully confirmed'
  )
  accessLogger.info(
    'updateFromSql =',
    `state = 1 WHERE transactionID = '${transactionID}'`
  )
  try {
    await repositoryMakerNode().update(
      { transactionID: transactionID },
      { state: 1 }
    )
    accessLogger.info('update success')
  } catch (error) {
    errorLogger.error('updateFromError =', error)
    return
  }

  const toTokenAddress = state ? pool.t1Address : pool.t2Address

  sendTransaction(
    makerAddress,
    transactionID,
    fromChainID,
    toChainID,
    toChain,
    toTokenAddress,
    value,
    from,
    pool,
    nonce
  )
}

function confirmFromTransaction(
  pool,
  state,
  txHash,
  confirmations = 3,
  isFirst = true
) {
  accessLogger.info('confirmFromTransaction =', getTime())

  const ticker = async () => {
    const makerAddress = pool.makerAddress
    var fromChain = state ? pool.c2Name : pool.c1Name
    var toChain = state ? pool.c1Name : pool.c2Name
    var tokenAddress = state ? pool.t2Address : pool.t1Address
    var toChainID = state ? pool.c1ID : pool.c2ID
    var fromChainID = state ? pool.c2ID : pool.c1ID
    const trxConfirmations = await getConfirmations(fromChain, txHash)

    // TODO
    if (!trxConfirmations) {
      return confirmFromTransaction(pool, state, txHash, confirmations, isFirst)
    }
    var trx = trxConfirmations.trx

    accessLogger.info(
      'Transaction with hash ' +
        txHash +
        ' has ' +
        trxConfirmations.confirmations +
        ' confirmation(s)'
    )
    var transactionID = trx.from.toLowerCase() + fromChainID + trx.nonce

    // ERC20's transfer input length is 138(include 0x), when the length > 138, it is cross address transfer
    let amountStr = '0'
    let transferExt: CrossAddressExt | undefined = undefined
    if (trx.input.length <= 138) {
      if (isEthTokenAddress(tokenAddress)) {
        amountStr = Web3.utils.hexToNumberString(Web3.utils.toHex(trx.value))
      } else {
        const amountHex = '0x' + trx.input.slice(74)
        amountStr = Web3.utils.hexToNumberString(amountHex)
      }
    } else {
      // Parse input data
      const inputData = CrossAddress.parseTransferERC20Input(trx.input)
      amountStr = inputData.amount.toNumber() + ''
      transferExt = inputData.ext
    }

    let makerNode: MakerNode | undefined
    try {
      makerNode = await repositoryMakerNode().findOne({
        transactionID: transactionID,
      })

      // When polygon newHash replace oldHash, return it
      // ex: 0x552efd239d3d3a45f15cbcfe476f5661c7133c6899f7fa259614e9411700b477 => 0xa834060e5c5374b4470b7942eeba81fd96ef7bc123cee317a13010d6af16665a
      // Warnning!!!: Because of the existence of this code, dashboard and maker cannot be turned on at the same time
      if (makerNode && isFirst) {
        accessLogger.info('TransactionID was exist: ' + transactionID)
        return
      }
    } catch (error) {
      errorLogger.error('isHaveSqlError =', error)
      return
    }
    if (!makerNode) {
      var info = <any>{}
      try {
        let fromWeb3
        if (fromChain === 'metis' || fromChain === 'metis_test') {
          fromWeb3 = new Web3(makerConfig[fromChain].httpEndPoint)
        } else {
          fromWeb3 = createAlchemyWeb3(makerConfig[fromChain].httpEndPoint)
        }
        info = await fromWeb3.eth.getBlock(trx.blockNumber)
      } catch (error) {
        errorLogger.error('getBlockError =', error)
      }

      try {
        await repositoryMakerNode().insert({
          transactionID: transactionID,
          userAddress: trx.from,
          makerAddress,
          fromChain: fromChainID,
          toChain: toChainID,
          formTx: trx.hash,
          fromTimeStamp: orbiterCore.transferTimeStampToTime(
            info.timestamp ? info.timestamp : '0'
          ),
          fromAmount: amountStr,
          formNonce: trx.nonce,
          fromExt: transferExt,
          txToken: tokenAddress,
          state: 0,
        })
        accessLogger.info('add success')
      } catch (error) {
        errorLogger.error('newTransactionSqlError =', error)
      }
    }
    if (trxConfirmations.confirmations >= confirmations) {
      accessLogger.info(
        'Transaction with hash ' + txHash + ' has been successfully confirmed'
      )
      accessLogger.info(
        'updateFromSql =',
        `state = 1 WHERE transactionID = '${transactionID}'`
      )
      try {
        await repositoryMakerNode().update(
          { transactionID: transactionID },
          { state: 1 }
        )
        accessLogger.info('update success')
      } catch (error) {
        errorLogger.error('updateFromError =', error)
        return
      }

      const toTokenAddress = state ? pool.t1Address : pool.t2Address
      let toAddress = trx.from
      if (transferExt?.value) {
        // When transferExt has value, fromAddress is transferExt.value
        toAddress = transferExt.value
      }
      sendTransaction(
        makerAddress,
        transactionID,
        fromChainID,
        toChainID,
        toChain,
        toTokenAddress,
        amountStr,
        toAddress,
        pool,
        trx.nonce,
        0,
        trx.from
      )
      return
    }
    return confirmFromTransaction(pool, state, txHash, confirmations, false)
  }

  setTimeout(ticker, 8 * 1000)
}

function confirmToTransaction(
  ChainID,
  Chain,
  txHash,
  transactionID,
  confirmations = 3
) {
  accessLogger.info('confirmToTransaction =', getTime())
  setTimeout(async () => {
    const trxConfirmations = await getConfirmations(Chain, txHash)
    if (!trxConfirmations) {
      return confirmToTransaction(
        ChainID,
        Chain,
        txHash,
        transactionID,
        confirmations
      )
    }
    accessLogger.info(
      'Transaction with hash ' +
        txHash +
        ' has ' +
        trxConfirmations.confirmations +
        ' confirmation(s)'
    )

    if (trxConfirmations.confirmations >= confirmations) {
      let info = <any>{}
      try {
        let toWeb3
        if (Chain === 'metis' || Chain === 'metis_test') {
          //no use alchemy provider
          toWeb3 = new Web3(makerConfig[Chain].httpEndPoint)
        } else {
          toWeb3 = createAlchemyWeb3(makerConfig[Chain].httpEndPoint)
        }

        info = await toWeb3.eth.getBlock(trxConfirmations.trx.blockNumber)
      } catch (error) {
        errorLogger.error('getBlockError =', error)
      }
      var timestamp = orbiterCore.transferTimeStampToTime(
        info.timestamp ? info.timestamp : '0'
      )

      accessLogger.info(
        'Transaction with hash ' + txHash + ' has been successfully confirmed'
      )
      accessLogger.info(
        'update maker_node =',
        `state = 3, toTimeStamp = '${timestamp}' WHERE transactionID = '${transactionID}'`
      )
      try {
        await repositoryMakerNode().update(
          { transactionID: transactionID },
          { toTimeStamp: timestamp, state: 3 }
        )
        accessLogger.info('update success')
      } catch (error) {
        errorLogger.error('updateToSqlError =', error)
        return
      }
      return
    }
    return confirmToTransaction(
      ChainID,
      Chain,
      txHash,
      transactionID,
      confirmations
    )
  }, 8 * 1000)
}

function confirmToZKTransaction(syncProvider, txID, transactionID = undefined) {
  accessLogger.info('confirmToZKTransaction =', getTime())
  setTimeout(async () => {
    let transferReceipt: any
    try {
      transferReceipt = await syncProvider.getTxReceipt(txID)
    } catch (err) {
      errorLogger.error('zkSync getTxReceipt failed: ' + err.message)
      return confirmToZKTransaction(syncProvider, txID)
    }

    accessLogger.info(
      'transactionID =',
      transactionID,
      'transferReceipt =',
      transferReceipt
    )

    if (
      transferReceipt.executed &&
      transferReceipt.success &&
      !transferReceipt.failReason
    ) {
      accessLogger.info({ transferReceipt })
      accessLogger.info(
        'zk_Transaction with hash ' + txID + ' has been successfully confirmed'
      )
      accessLogger.info(
        'update maker_node =',
        `state = 3 WHERE transactionID = '${transactionID}'`
      )
      try {
        await repositoryMakerNode().update(
          { transactionID: transactionID },
          { state: 3 }
        )
      } catch (error) {
        errorLogger.error('updateToSqlError =', error)
      }
      return
    }

    // When failReason, don't try again
    if (!transferReceipt.success && transferReceipt.failReason) {
      return
    }

    return confirmToZKTransaction(syncProvider, txID)
  }, 8 * 1000)
}

function confirmToLPTransaction(
  txID: string,
  transactionID: string,
  toChainId: number,
  makerAddress: string
) {
  accessLogger.info('confirmToLPTransaction =', getTime())
  setTimeout(async () => {
    try {
      await checkLoopringAccountKey(makerAddress, toChainId)
      const GetUserTransferListRequest = {
        accountId: accountInfo.accountId,
        hashes: txID,
      }
      let netWorkID = toChainId == 9 ? 1 : 5
      const userApi = new UserAPI({ chainId: netWorkID })
      const LPTransferResult = await userApi.getUserTransferList(
        GetUserTransferListRequest,
        lpKey
      )
      if (
        LPTransferResult.totalNum === 1 &&
        LPTransferResult.userTransfers?.length === 1
      ) {
        let lpTransaction = LPTransferResult.userTransfers[0]
        if (
          lpTransaction.status == 'processed' &&
          lpTransaction.txType == 'TRANSFER' &&
          lpTransaction.symbol == 'ETH'
        ) {
          accessLogger.info({ lpTransaction })
          accessLogger.info(
            'lp_Transaction with hash ' +
              txID +
              ' has been successfully confirmed'
          )
          var timestamp = orbiterCore.transferTimeStampToTime(
            lpTransaction.timestamp ? lpTransaction.timestamp : '0'
          )
          accessLogger.info(
            'update maker_node =',
            `state = 3, toTimeStamp = '${timestamp}' WHERE transactionID = '${transactionID}'`
          )
          try {
            await repositoryMakerNode().update(
              { transactionID: transactionID },
              { state: 3 }
            )
          } catch (error) {
            errorLogger.error('updateToSqlError =', error)
          }
          return
        }
      }
    } catch (err) {
      errorLogger.error('loopring getTxReceipt failed: ' + err.message)
      return confirmToLPTransaction(
        txID,
        transactionID,
        toChainId,
        makerAddress
      )
    }
    return confirmToLPTransaction(txID, transactionID, toChainId, makerAddress)
  }, 8 * 1000)
}

async function confirmToSNTransaction(
  txID: string,
  transactionID: string,
  chainId: number
) {
  accessLogger.info('confirmToSNTransaction =', getTime())
  while (true) {
    try {
      const provider = getProviderByChainId(chainId)
      const transaction = await provider.getTransaction(txID)
      accessLogger.info(
        'sn_transaction =',
        JSON.stringify({ status: transaction.status, txID })
      )

      // When reject
      if (transaction.status == 'REJECTED') {
        break
      }

      if (
        transaction.status == 'ACCEPTED_ON_L1' ||
        transaction.status == 'ACCEPTED_ON_L2'
      ) {
        accessLogger.info(
          'sn_Transaction with hash ' +
            txID +
            ' has been successfully confirmed'
        )
        accessLogger.info(
          'update maker_node =',
          `state = 3 WHERE transactionID = '${transactionID}'`
        )
        await repositoryMakerNode().update(
          { transactionID: transactionID },
          { state: 3 }
        )
        break
      }
    } catch (err) {
      errorLogger.error('sn_getTransaction failed: ', err.message)
    }

    await sleep(8 * 1000)
  }
}

function confirmToZKSTransaction(
  txID: string,
  transactionID: string,
  toChainId: number,
  makerAddress: string
) {
  accessLogger.info('confirmToZKSTransaction =', getTime())
  setTimeout(async () => {
    let transferReceipt: any
    const normalTxId = txID.replace('sync-tx:', '0x')
    try {
      transferReceipt = await zkspace_help.getZKSpaceTransactionData(
        toChainId,
        normalTxId
      )
    } catch (err) {
      errorLogger.error('zks getTxReceipt failed: ' + err.message)
      return confirmToZKSTransaction(
        txID,
        transactionID,
        toChainId,
        makerAddress
      )
    }
    accessLogger.info(
      'transactionID =',
      transactionID,
      'transferReceipt =',
      transferReceipt
    )

    if (
      transferReceipt.success === true &&
      transferReceipt.data.success === true &&
      transferReceipt.data.tx_type === 'Transfer' &&
      (transferReceipt.data.status === 'verified' ||
        transferReceipt.data.status === 'pending')
    ) {
      accessLogger.info({ transferReceipt })
      accessLogger.info(
        'zks_Transaction with hash ' + txID + ' has been successfully confirmed'
      )
      accessLogger.info(
        'update maker_node =',
        `state = 3 WHERE transactionID = '${transactionID}'`
      )
      try {
        await repositoryMakerNode().update(
          { transactionID: transactionID },
          { state: 3 }
        )
      } catch (error) {
        errorLogger.error('updateToSqlError =', error)
      }
      return
    }
    // When failReason, don't try again
    if (
      !transferReceipt.success ||
      !transferReceipt.data.success ||
      transferReceipt.data.fail_reason
    ) {
      return
    }

    return confirmToZKSTransaction(txID, transactionID, toChainId, makerAddress)
  }, 8 * 1000)
}

async function getConfirmations(fromChain, txHash): Promise<any> {
  accessLogger.info('getConfirmations =', getTime())
  try {
    let web3
    if (fromChain === 'metis' || fromChain === 'metis_test') {
      //no use alchemy provider
      web3 = new Web3(makerConfig[fromChain].httpEndPoint)
    } else {
      web3 = createAlchemyWeb3(makerConfig[fromChain].httpEndPoint)
    }
    const trx = await web3.eth.getTransaction(txHash)
    const currentBlock = await web3.eth.getBlockNumber()

    if (!trx) {
      return trx
    }
    return trx.blockNumber === null
      ? { confirmations: 0, trx: trx }
      : { confirmations: currentBlock - trx.blockNumber + 1, trx: trx }
  } catch (error) {
    errorLogger.error(error)
  }
}

function getZKTokenID(tokenAddress) {
  if (!zkTokenInfo.length) {
    return null
  } else {
    for (let index = 0; index < zkTokenInfo.length; index++) {
      const tokenInfo = zkTokenInfo[index]
      if (tokenInfo.address === tokenAddress) {
        return tokenInfo.id
      }
    }
  }
}

function getTime() {
  const time = dayjs().format('YYYY-MM-DD HH:mm:ss')
  return time
}

/**
 * Get return amount
 * @param fromChainID
 * @param toChainID
 * @param amountStr
 * @param pool
 * @param nonce
 * @returns
 */
export function getAmountToSend(
  fromChainID: number,
  toChainID: number,
  amountStr: string,
  pool: { precision: number; tradingFee: number; gasFee: number },
  nonce: string | number
) {
  const realAmount = orbiterCore.getRAmountFromTAmount(fromChainID, amountStr)
  if (!realAmount.state) {
    errorLogger.error(realAmount.error)
    return
  }
  const rAmount = <any>realAmount.rAmount
  if (nonce > 8999) {
    errorLogger.error('nonce too high, not allowed')
    return
  }
  var nonceStr = orbiterCore.pTextFormatZero(nonce)
  var readyAmount = orbiterCore.getToAmountFromUserAmount(
    new BigNumber(rAmount).dividedBy(new BigNumber(10 ** pool.precision)),
    pool,
    true
  )

  return orbiterCore.getTAmountFromRAmount(toChainID, readyAmount, nonceStr)
}

/**
 *
 * @param makerAddress
 * @param transactionID
 * @param fromChainID
 * @param toChainID
 * @param toChain
 * @param tokenAddress
 * @param amountStr
 * @param toAddress
 * @param pool
 * @param nonce
 * @param result_nonce
 * @param ownerAddress // Cross address ownerAddress
 * @returns
 */
export async function sendTransaction(
  makerAddress: string,
  transactionID,
  fromChainID,
  toChainID,
  toChain,
  tokenAddress,
  amountStr,
  toAddress,
  pool,
  nonce,
  result_nonce = 0,
  ownerAddress = ''
) {
  const amountToSend = getAmountToSend(
    fromChainID,
    toChainID,
    amountStr,
    pool,
    nonce
  )
  if (!amountToSend) {
    return
  }
  if (!amountToSend.state) {
    errorLogger.error(amountToSend.error)
    return
  }
  const tAmount = amountToSend.tAmount
  accessLogger.info('amountToSend =', tAmount)
  accessLogger.info('toChain =', toChain)
  accessLogger.info(
    `makerAddress=${makerAddress}&toAddress=${toAddress}&toChain=${toChain}&toChainID=${toChainID}`
  )
  await send(
    makerAddress,
    toAddress,
    toChain,
    toChainID,
    getZKTokenID(tokenAddress),
    tokenAddress,
    tAmount,
    result_nonce,
    fromChainID,
    nonce,
    ownerAddress
  ).then(async (response) => {
    accessLogger.info('response =', response)
    if (!response.code) {
      var txID = response.txid
      accessLogger.info(
        `update maker_node: state = 2, toTx = '${txID}', toAmount = ${tAmount} where transactionID=${transactionID}`
      )
      try {
        await repositoryMakerNode().update(
          { transactionID: transactionID },
          {
            toTx: txID,
            toAmount: tAmount,
            state: 2,
          }
        )
        accessLogger.info('update success')
      } catch (error) {
        errorLogger.error('updateToSqlError =', error)
        return
      }
      if (response.zkProvider && (toChainID === 3 || toChainID === 33)) {
        let syncProvider = response.zkProvider
        confirmToZKTransaction(syncProvider, txID, transactionID)
      } else if (toChainID === 4 || toChainID === 44) {
        confirmToSNTransaction(txID, transactionID, toChainID)
      } else if (toChainID === 8 || toChainID === 88) {
        console.warn({ toChainID, toChain, txID, transactionID })
        // confirmToSNTransaction(txID, transactionID, toChainID)
      } else if (toChainID === 9 || toChainID === 99) {
        confirmToLPTransaction(txID, transactionID, toChainID, makerAddress)
      } else if (toChainID === 11 || toChainID === 511) {
        accessLogger.info(
          `dYdX transfer succceed. txID: ${txID}, transactionID: ${transactionID}`
        )
        // confirmToSNTransaction(txID, transactionID, toChainID)
      } else if (toChainID === 12 || toChainID === 512) {
        if (txID.indexOf('sync-tx:') != -1) {
          txID = txID.replace('sync-tx:', '0x')
        }
        confirmToZKSTransaction(txID, transactionID, toChainID, makerAddress)
      } else {
        confirmToTransaction(toChainID, toChain, txID, transactionID)
      }

      // update todo
      await repositoryMakerNodeTodo().update({ transactionID }, { state: 1 })
    } else {
      errorLogger.error(
        'updateError maker_node =',
        `state = 20 WHERE transactionID = '${transactionID}'`
      )
      try {
        await repositoryMakerNode().update(
          { transactionID: transactionID },
          { state: 20 }
        )
        accessLogger.info('update success')

        // todo need result_nonce
        // if (response.result_nonce > 0) {
        //   // insert or update todo
        //   const todo = await repositoryMakerNodeTodo().findOne({
        //     transactionID,
        //   })
        //   if (todo) {
        //     await repositoryMakerNodeTodo().increment(
        //       { transactionID },
        //       'do_current',
        //       1
        //     )
        //   } else {
        //     await repositoryMakerNodeTodo().insert({
        //       transactionID,
        //       makerAddress,
        //       data: JSON.stringify({
        //         transactionID,
        //         fromChainID,
        //         toChainID,
        //         toChain,
        //         tokenAddress,
        //         amountStr,
        //         fromAddress,
        //         pool,
        //         nonce,
        //         result_nonce: response.result_nonce,
        //       }),
        //       do_state: 20,
        //     })
        //   }
        // }
      } catch (error) {
        errorLogger.error('updateErrorSqlError =', error)
        return
      }
      let alert = 'Send Transaction Error ' + transactionID
      try {
        // doSms(alert)
      } catch (error) {
        errorLogger.error('sendTransactionErrorMessage =', error)
      }
    }
  })
}
