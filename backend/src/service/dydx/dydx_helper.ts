import {
  AccountResponseObject,
  ApiKeyCredentials,
  DydxClient,
  SigningMethod,
  TransferResponseObject,
} from '@dydxprotocol/v3-client'
import { getAccountId } from '@dydxprotocol/v3-client/build/src/lib/db'
import BigNumber from 'bignumber.js'
import { ethers, utils } from 'ethers'
import Web3 from 'web3'
import { makerConfig } from '../../config'
import { equalsIgnoreCase } from '../../util'

const DYDX_MAKERS = {
  // Testnet
  '0x694434EC84b7A8Ad8eFc57327ddD0A428e23f8D5': {
    starkKey:
      '04e69175389829db733f41ae75e7ba59ea2b2849690c734fcd291c94d6ec6017',
    positionId: '60620',
  },

  // Mainnet
  '0x41d3D33156aE7c62c094AAe2995003aE63f587B3': {
    starkKey: '',
    positionId: '',
  },
}

const DYDX_CLIENTS = {}
const DYDX_ACCOUNTS = {}
const DYDX_API_KEY_CREDENTIALS: { [key: string]: ApiKeyCredentials } = {}

export class DydxHelper {
  static makerTrx = new Map<string, TransferResponseObject[]>()
  static makerAccount = new Map<string, AccountResponseObject>()
  private chainId: number
  private networkId: number
  private host: string
  private web3?: Web3 = undefined
  private signingMethod?: SigningMethod

  /**
   * @param chainId
   * @param web3
   * @param signingMethod TypedData | MetaMask
   */
  constructor(
    chainId: number,
    web3?: Web3,
    signingMethod = SigningMethod.TypedData
  ) {
    if (chainId == 11) {
      this.networkId = 1
      this.host = makerConfig.dydx.api.endPoint
    }
    if (chainId == 511) {
      this.networkId = 3
      this.host = makerConfig.dydx_test.api.endPoint
    }

    this.chainId = chainId
    this.web3 = web3
    this.signingMethod = signingMethod
  }

  /**
   * @param ethereumAddress
   * @param alwaysNew
   * @param alwaysDeriveStarkKey
   * @returns
   */
  async getDydxClient(
    ethereumAddress = '',
    alwaysNew = false,
    alwaysDeriveStarkKey = false
  ): Promise<DydxClient> {
    const dydxClientKey = String(ethereumAddress)
    const clientOld = DYDX_CLIENTS[dydxClientKey]

    if (clientOld && !alwaysNew) {
      if (alwaysDeriveStarkKey && ethereumAddress) {
        // Reset DyDxClient.private, It will new when use
        clientOld._private = null

        clientOld.starkPrivateKey = await clientOld.onboarding.deriveStarkKey(
          ethereumAddress,
          this.signingMethod
        )
      }

      return clientOld
    }

    if (!this.host) {
      throw new Error('Sorry, miss param [host]')
    }
    // if (!this.web3) {
    //   throw new Error('Sorry, miss param [web3]')
    // }

    const client = <any>new DydxClient(this.host, {
      networkId: this.networkId,
      web3: this.web3,
    })
    if (ethereumAddress && this.web3) {
      const userExists = await client.public.doesUserExistWithAddress(
        ethereumAddress
      )

      if (userExists.exists) {
        if (alwaysDeriveStarkKey) {
          client.starkPrivateKey = await client.onboarding.deriveStarkKey(
            ethereumAddress,
            this.signingMethod
          )
        }

        const apiCredentials =
          await client.onboarding.recoverDefaultApiCredentials(
            ethereumAddress,
            this.signingMethod
          )
        client.apiKeyCredentials = apiCredentials
      } else {
        const keyPair = await client.onboarding.deriveStarkKey(
          ethereumAddress,
          this.signingMethod
        )
        client.starkPrivateKey = keyPair

        const user = await client.onboarding.createUser(
          {
            starkKey: keyPair.publicKey,
            starkKeyYCoordinate: keyPair.publicKeyYCoordinate,
          },
          ethereumAddress,
          undefined,
          this.signingMethod
        )
        client.apiKeyCredentials = user.apiKey
      }
    }

    return (DYDX_CLIENTS[dydxClientKey] = client)
  }

  /**
   * @param ethereumAddress
   * @param ensureUser
   * @returns
   */
  async getBalanceUsdc(
    ethereumAddress: string,
    ensureUser = true
  ): Promise<ethers.BigNumber> {
    if (!ethereumAddress) {
      throw new Error('Sorry, miss param [user]')
    }

    let balance = ethers.BigNumber.from(0)

    try {
      const account = DydxHelper.makerAccount.get(
        ethereumAddress.toLocaleLowerCase()
      )
      if (account) {
        balance = balance.add(Number(account.freeCollateral) * 10 ** 6)
      }
    } catch (err) {
      console.warn('GetBalanceUsdc failed: ' + err.message)
    }

    return balance
  }

  /**
   * @param ethereumAddress
   * @param alwaysNew
   * @returns
   */
  async getAccount(
    ethereumAddress: string,
    alwaysNew = false
  ): Promise<AccountResponseObject> {
    const dydxAccountKey = String(ethereumAddress)

    if (DYDX_ACCOUNTS[dydxAccountKey] && !alwaysNew) {
      return DYDX_ACCOUNTS[dydxAccountKey]
    }

    const dydxClient = await this.getDydxClient(ethereumAddress)
    const { account } = await dydxClient.private.getAccount(ethereumAddress)

    return (DYDX_ACCOUNTS[dydxAccountKey] = account)
  }

  /**
   * @param ethereumAddress
   * @returns
   */
  getAccountId(ethereumAddress: string) {
    return getAccountId({ address: ethereumAddress })
  }

  /**
   * @param ethereumAddress
   * @returns
   */
  getMakerInfo(ethereumAddress: string): {
    starkKey: string
    positionId: string
  } {
    const info = DYDX_MAKERS[ethereumAddress]
    if (!info) {
      throw new Error(`Sorry, miss DYDX_MAKERS: ${ethereumAddress}`)
    }
    return info
  }

  /**
   * @param starkKey ex: 0x0367e161e41f692fc96ee22a8ab313d71bbd310617df4a02675bcfc87a3b708f
   * @param positionId ex: 58011
   * @returns 0x...
   */
  conactStarkKeyPositionId(starkKey: string, positionId: string) {
    let positionIdStr = Number(positionId).toString(16)
    if (positionIdStr.length % 2 !== 0) {
      positionIdStr = `0${positionIdStr}`
    }
    return `${starkKey}${positionIdStr}`
  }

  /**
   * @param data 0x...
   * @returns
   */
  splitStarkKeyPositionId(data: string) {
    const starkKey = utils.hexDataSlice(data, 0, 32)
    const positionId = parseInt(utils.hexDataSlice(data, 32), 16)
    return { starkKey, positionId: String(positionId) }
  }

  /**
   * @param ethereumAddress 0x...
   * @returns
   */
  generateClientId(ethereumAddress: string) {
    const time = new Date().getTime()
    const rand = parseInt(Math.random() * 899 + 100 + '')
    let sourceStr = `${ethereumAddress}${time}${rand}`
    if (sourceStr.length % 2 != 0) {
      sourceStr += '0'
    }
    sourceStr = sourceStr.replace(/^0x/i, '')

    return Buffer.from(sourceStr, 'hex').toString('base64')
  }

  /**
   * @param clientId base64 string
   * @returns 0x...
   */
  getEthereumAddressFromClientId(clientId: string) {
    const sourceStr = Buffer.from(clientId, 'base64').toString('hex')
    return utils.hexDataSlice('0x' + sourceStr, 0, 20)
  }

  /**
   * @param ethereumAddress
   * @param apiKeyCredentials
   */
  static setApiKeyCredentials(
    ethereumAddress: string,
    apiKeyCredentials: ApiKeyCredentials
  ) {
    DYDX_API_KEY_CREDENTIALS[ethereumAddress] = apiKeyCredentials
  }

  /**
   * @param ethereumAddress
   * @returns
   */
  static getApiKeyCredentials(
    ethereumAddress: string
  ): ApiKeyCredentials | undefined {
    return DYDX_API_KEY_CREDENTIALS[ethereumAddress]
  }

  /**
   * DYDX transfer => Eth transaction
   * @param transfer dYdX transfer
   * @param ethereumAddress 0x...
   * @returns
   */
  static toTransaction(
    transfer: TransferResponseObject,
    ethereumAddress: string
  ) {
    const timeStampMs = new Date(transfer.createdAt).getTime()
    const nonce = DydxHelper.timestampToNonce(timeStampMs)

    const isTransferIn = equalsIgnoreCase('TRANSFER_IN', transfer.type)
    const isTransferOut = equalsIgnoreCase('TRANSFER_OUT', transfer.type)

    const transaction = {
      timeStamp: parseInt(timeStampMs / 1000 + ''),
      hash: transfer.id,
      nonce,
      blockHash: '',
      transactionIndex: 0,
      from: '',
      to: '',
      value: new BigNumber(
        isTransferIn ? transfer.creditAmount : transfer.debitAmount
      )
        .multipliedBy(10 ** 6)
        .toString(), // Only usdc
      txreceipt_status: transfer.status,
      contractAddress: '', // Only usdc
      confirmations: 0,
      symbol: isTransferIn ? transfer.creditAsset : transfer.debitAsset
    }

    if (isTransferIn) {
      transaction.to = ethereumAddress
    }
    if (isTransferOut) {
      transaction.from = ethereumAddress
    }

    return transaction
  }

  /**
   * The api does not return the nonce value, timestamp(ms) last three number is the nonce
   *  (warnning: there is a possibility of conflict)
   * @param  timestamp ms
   * @returns
   */
  static timestampToNonce(timestamp: number | string) {
    let nonce = 0

    if (timestamp) {
      timestamp = String(timestamp)
      const match = timestamp.match(/(\d{3})$/i)
      if (match && match.length > 1) {
        nonce = Number(match[1]) || 0
      }

      if (nonce > 900) {
        nonce = nonce - 100
      }
    }

    return nonce + ''
  }
}
