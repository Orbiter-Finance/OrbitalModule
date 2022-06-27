import { ETHTokenType, ImmutableXClient } from '@imtbl/imx-sdk'
import { ethers, providers, Wallet } from 'ethers'
import { makerConfig } from '../../config'
import { errorLogger } from '../../util/logger'

export type Transaction = {
  blockNumber?: number
  timeStamp: number
  hash: string
  nonce: string
  blockHash: string
  transactionIndex: number
  from: string
  to: string
  value: string
  gas?: number
  gasPrice?: number
  isError?: number
  txreceipt_status: string
  input?: string
  contractAddress: string
  cumulativeGasUsed?: number
  gasUsed?: number
  confirmations: number
}

const CONTRACTS = {
  ropsten: {
    starkContractAddress: '0x4527BE8f31E2ebFbEF4fCADDb5a17447B27d2aef',
    registrationContractAddress: '0x6C21EC8DE44AE44D0992ec3e2d9f1aBb6207D864',
  },
  mainnet: {
    starkContractAddress: '0x5FDCCA53617f4d2b9134B29090C87D01058e27e9',
    registrationContractAddress: '0x72a06bf2a1CE5e39cBA06c0CAb824960B587d64c',
  },
}

const IMMUTABLEX_CLIENTS: { [key: string]: ImmutableXClient } = {}

export class IMXHelper {
  publicApiUrl = ''
  starkContractAddress = ''
  registrationContractAddress = ''

  constructor(chainId: number) {
    if (chainId == 8) {
      this.publicApiUrl = makerConfig.immutableX.api.endPoint
      this.starkContractAddress = CONTRACTS.mainnet.starkContractAddress
      this.registrationContractAddress =
        CONTRACTS.mainnet.registrationContractAddress
    }
    if (chainId == 88) {
      this.publicApiUrl = makerConfig.immutableX_test.api.endPoint
      this.starkContractAddress = CONTRACTS.ropsten.starkContractAddress
      this.registrationContractAddress =
        CONTRACTS.ropsten.registrationContractAddress
    }
  }

  /**
   *
   * @param  addressOrIndex
   * @returns
   */
  async getImmutableXClient(
    addressOrIndex: string | number | undefined = '',
    alwaysNew = false
  ) {
    const immutableXClientKey = String(addressOrIndex)

    if (IMMUTABLEX_CLIENTS[immutableXClientKey] && !alwaysNew) {
      return IMMUTABLEX_CLIENTS[immutableXClientKey]
    }

    if (!this.starkContractAddress) {
      throw new Error('Sorry, miss param [starkContractAddress]')
    }
    if (!this.registrationContractAddress) {
      throw new Error('Sorry, miss param [registrationContractAddress]')
    }

    let signer: ethers.Wallet | undefined = undefined
    if (addressOrIndex) {
      const provider = new providers.AlchemyProvider('ropsten')
      signer = new Wallet(makerConfig.privateKeys[String(addressOrIndex).toLowerCase()]).connect(
        provider
      )
    }

    return (IMMUTABLEX_CLIENTS[immutableXClientKey] =
      await ImmutableXClient.build({
        publicApiUrl: this.publicApiUrl,
        signer,
        starkContractAddress: this.starkContractAddress,
        registrationContractAddress: this.registrationContractAddress,
      }))
  }

  /**
   * @param user
   * @param s
   * @returns
   */
  async getBalanceBySymbol(user: string, s = 'ETH') {
    if (!user) {
      throw new Error('Sorry, miss param [user]')
    }
    if (!s) {
      throw new Error('Sorry, miss param [s]')
    }

    let balance = ethers.BigNumber.from(0)

    try {
      const imxc = await this.getImmutableXClient()
      const data = await imxc.listBalances({ user })

      if (!data.result) {
        return balance
      }

      for (const item of data.result) {
        if (item.symbol.toUpperCase() != s.toUpperCase()) {
          continue
        }

        balance = balance.add(item.balance)
      }
    } catch (err) {
      errorLogger.error('GetBalanceBySymbol failed: ' + err.message)
    }

    return balance
  }

  /**
   * @param user
   */
  async ensureUser(user: string) {
    if (!user) {
      throw new Error('Sorry, miss param [user]')
    }

    try {
      const imxClient = await this.getImmutableXClient()
      await imxClient.getUser({ user })
    } catch (err) {
      if (!err.message || !/account_not_found/i.test(err.message)) {
        throw err
      }

      const userClient = await this.getImmutableXClient(user)
      await userClient.registerImx({
        etherKey: userClient.address,
        starkPublicKey: userClient.starkPublicKey,
      })
    }
  }

  /**
   * IMX transfer => Eth transaction
   * @param transfer IMX transfer
   * @returns
   */
  toTransaction(transfer: any) {
    const timeStampMs = transfer.timestamp.getTime()
    const nonce = this.timestampToNonce(timeStampMs)

    // When it is ETH
    let contractAddress = transfer.token.data.token_address
    if (transfer.token.type == ETHTokenType.ETH) {
      contractAddress = '0x0000000000000000000000000000000000000000'
    }

    const transaction = {
      timeStamp: parseInt(String(timeStampMs / 1000)),
      hash: transfer.transaction_id,
      nonce,
      blockHash: '',
      transactionIndex: 0,
      from: transfer.user,
      to: transfer.receiver,
      value: transfer.token.data.quantity + '',
      txreceipt_status: transfer.status,
      contractAddress,
      confirmations: 0,
    }

    return transaction
  }

  /**
   * The api does not return the nonce value, timestamp(ms) last three number is the nonce
   *  (warnning: there is a possibility of conflict)
   * @param timestamp ms
   * @returns
   */
  timestampToNonce(timestamp: number | string) {
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
