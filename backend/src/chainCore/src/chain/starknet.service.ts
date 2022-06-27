import BigNumber from 'bignumber.js'
import * as starknet from 'starknet'
import { Uint256 } from 'starknet/dist/utils/uint256'
import StarknetTokenABI from '../abi/Starknet_Token.json'
import {
  IChain,
  IChainConfig,
  QueryTransactionsResponse,
  QueryTxFilter,
  Token,
  Transaction,
} from '../types'
import { equals } from '../utils'

export class Startknet implements IChain {
  public provider: starknet.Provider
  constructor(public readonly chainConfig: IChainConfig) {
    this.provider = new starknet.Provider({
      network: <any>this.chainConfig.network,
    })
  }
  public async getTokenInfo(idOrAddrsss: string | number) {
    if (
      idOrAddrsss === 0 ||
      idOrAddrsss === '0' ||
      idOrAddrsss === '0x0000000000000000000000000000000000000000'
    ) {
      return this.chainConfig.nativeCurrency as Token
    }
    const localToken = this.chainConfig.tokens.find((t) =>
      equals(t.address, String(idOrAddrsss))
    )
    if (localToken) {
      return localToken
    }
    return null
  }
  async getLatestHeight(): Promise<number> {
    const block = await this.provider.getBlock()
    return block.block_number
  }
  getTransactionByHash(hash: string): Promise<Transaction | null> {
    throw new Error('Method not implemented.')
  }
  getTransactions(
    address: string,
    filter: Partial<QueryTxFilter>
  ): Promise<QueryTransactionsResponse> {
    throw new Error('Method not implemented.')
  }
  getTokenTransactions(
    address: string,
    contractAddress: string | null,
    filter: Partial<QueryTxFilter>
  ): Promise<QueryTransactionsResponse> {
    throw new Error('Method not implemented.')
  }
  getBalance(address: string): Promise<BigNumber> {
    return this.getTokenBalance(
      address,
      this.chainConfig.nativeCurrency.address
    )
  }
  async getDecimals(): Promise<number> {
    return this.chainConfig.nativeCurrency.decimals
  }
  async getTokenBalance(
    address: string,
    tokenAddress: string
  ): Promise<BigNumber> {
    const token = await this.getTokenInfo(tokenAddress)
    if (!token) {
      throw new Error(`${tokenAddress} Token Not Exists`)
    }
    const contractInstance = new starknet.Contract(
      <any>StarknetTokenABI,
      tokenAddress
    )
    const balanceResult: Uint256 = (await contractInstance.balanceOf(address))
      .balance
    return new BigNumber(balanceResult.low.toString())
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
