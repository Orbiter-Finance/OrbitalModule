import BigNumber from 'bignumber.js'
import {
  HashOrBlockNumber,
  IChain,
  IChainConfig,
  ITransaction,
  QueryTransactionsResponse,
  QueryTxFilterDydx,
  Token,
  Transaction,
  TransactionStatus,
} from '../types'
import {
  ApiKeyCredentials,
  DydxClient,
  TransferResponseObject,
} from '@dydxprotocol/v3-client'
import Web3 from 'web3'
import dayjs from 'dayjs'
import { equals, isEmpty } from '../utils'
export class Dydx implements IChain {
  private apiKeyCredentials: ApiKeyCredentials = {
    key: '',
    secret: '',
    passphrase: '',
  }

  constructor(public readonly chainConfig: IChainConfig) {
    if (!isEmpty(this.chainConfig.api.key)) {
      const keys: Array<string> = this.chainConfig.api.key?.split('.') || []
      this.apiKeyCredentials.key = keys[0]
      this.apiKeyCredentials.secret = keys[1]
      this.apiKeyCredentials.passphrase = keys[2]
    }
  }
  public async getTokenInfo(idOrAddrsss: string | number) {
    if (
      idOrAddrsss === 0 ||
      idOrAddrsss === '0' ||
      idOrAddrsss === '0x0000000000000000000000000000000000000000'
    ) {
      return this.chainConfig.nativeCurrency as Token
    }
    if (typeof idOrAddrsss === 'string') {
      // check local config
      const localToken = this.chainConfig.tokens.find((t) =>
        equals(t.address, idOrAddrsss)
      )
      if (localToken) {
        return localToken
      }
    }
    return null
  }
  public getDydxClient() {
    const apiKeyCredentials = this.apiKeyCredentials
    if (
      !apiKeyCredentials.key ||
      !apiKeyCredentials.secret ||
      !apiKeyCredentials.passphrase
    ) {
      throw new Error(
        'Wallet signature not configured key | secret | passphrase'
      )
    }
    const web3 = new Web3()
    return new DydxClient(this.chainConfig.api.url, {
      web3,
      apiKeyCredentials,
      apiTimeout: 3000,
      networkId: Number(this.chainConfig.networkId),
    })
  }

  async getLatestHeight(): Promise<number> {
    return 0
  }
  public async convertTxToEntity(data: any): Promise<Transaction | null> {
    if (!data) return data
    const { id, fromAddress, type, toAddress, status, createdAt, ...extra } =
      data
    const value = new BigNumber(
      equals(type, 'TRANSFER_IN') ? data.creditAmount : data.debitAmount
    )
    const symbol = equals(type, 'TRANSFER_IN')
      ? data.creditAsset
      : data.debitAsset
    const nonce = Dydx.timestampToNonce(new Date(createdAt).getTime())
    const token = await this.chainConfig.tokens.find((t) =>
      equals(String(symbol), t.symbol)
    )
    const tx = new Transaction({
      chainId: this.chainConfig.chainId,
      hash: id,
      nonce: Number(nonce),
      from: fromAddress || '',
      to: toAddress || '',
      blockNumber: 0,
      value,
      status: TransactionStatus.Fail,
      timestamp: dayjs(createdAt).unix(),
      fee: 0,
      feeToken: String(token?.symbol),
      tokenAddress: token?.address,
      extra,
      symbol,
    })
    if (equals(status, 'PENDING')) {
      tx.status = TransactionStatus.PENDING
    } else if (equals(status, 'CONFIRMED')) {
      tx.status = TransactionStatus.COMPLETE
    }
    return tx
  }
  getConfirmations(hashOrHeight: HashOrBlockNumber): Promise<number> {
    throw new Error('Method not implemented.')
  }
  calcConfirmations(
    targetHeight: number,
    latestHeight: number
  ): Promise<number> {
    throw new Error('Method not implemented.')
  }
  async getTransactionByHash(hash: string): Promise<ITransaction> {
    throw new Error('Method not implemented.')
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
  async getTransactions(
    _address: string,
    filter: Partial<QueryTxFilterDydx> = {}
  ): Promise<QueryTransactionsResponse> {
    const response: QueryTransactionsResponse = {
      txlist: [],
    }
    const dydxClient = this.getDydxClient()
    const transfers = await dydxClient.private
      .getTransfers({
        limit: filter.limit || 100,
        createdBeforeOrAt: dayjs(
          filter.createdBeforeOrAt || new Date()
        ).toISOString(),
      })
      .then(
        (result: { transfers: TransferResponseObject[] }) =>
          result.transfers || []
      )

    for (const row of transfers) {
      const tx = await this.convertTxToEntity(row)
      if (tx) {
        response.txlist.push(tx)
      }
    }
    return response
  }
  getTokenTransactions(
    address: string,
    tokenAddress: string,
    filter: Partial<QueryTxFilterDydx>
  ): Promise<QueryTransactionsResponse> {
    throw new Error('Method not implemented.')
  }
  async getBalance(address: string): Promise<BigNumber> {
    const dydxClient = this.getDydxClient()
    const { account } = await dydxClient.private.getAccount(address)
    return new BigNumber(account.freeCollateral)
  }
  public async getDecimals(): Promise<number> {
    return this.chainConfig.nativeCurrency.decimals
  }
  getTokenBalance(address: string, tokenAddress: string): Promise<BigNumber> {
    throw new Error('Method not implemented.')
  }
  async getTokenDecimals(tokenAddress: string): Promise<number> {
    const token = await this.getTokenInfo(tokenAddress)
    if (!token) {
      throw new Error(`${tokenAddress} Token Not Exists`)
    }
    if (token) {
      return Number(token.decimals)
    }
    return 0
  }
  async getTokenSymbol(tokenAddress: string): Promise<string> {
    const token = await this.getTokenInfo(tokenAddress)
    if (!token) {
      throw new Error(`${tokenAddress} Token Not Exists`)
    }
    return token && token.symbol
  }
}
