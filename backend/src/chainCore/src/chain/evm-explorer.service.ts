import BigNumber from 'bignumber.js'
import {
  IChainConfig,
  QueryTransactionsResponse,
  QueryTxFilter,
  Transaction,
  TransactionStatus,
} from '../types'
import { equals, isEmpty } from '../utils'
import EtherscanClient, { EtherscanApiAction } from '../utils/etherscan'
import logger from '../utils/logger'
import { EVMChain } from './evm-chain.service'
export abstract class EvmExplorerService extends EVMChain {
  private apiClient: EtherscanClient
  constructor(public readonly chainConfig: IChainConfig) {
    super(chainConfig)
    this.apiClient = new EtherscanClient(this.chainConfig.api.url, {
      apiKey: this.chainConfig.api.key,
      debug: this.chainConfig.debug
    })
  }

  public async getTransactions(
    address: string,
    filter: Partial<QueryTxFilter> = {}
  ): Promise<QueryTransactionsResponse> {
    const returnResponse: QueryTransactionsResponse = {
      txlist: [],
    };
    const response = await this.apiClient.call(
      EtherscanApiAction.AccountTxlist,
      filter
    );
    const { status, result, ...responseExtra } = response;
    if (status !== "1") {
      throw new Error(
        `${this.chainConfig.name} GetTransactions Fail:${JSON.stringify(
          response
        )} , Params:${JSON.stringify(filter)}`
      );
    }
    Object.assign(returnResponse, responseExtra);
    for (const tx of result) {
      try {
        const newTx = await this.convertTxToEntity(tx);
        newTx && returnResponse.txlist.push(newTx);
      } catch (error: any) {
        logger.error(`getTransactions Error:${tx.hash}`, error);
      }
    }
    return returnResponse;
  }

  public async getTokenTransactions(
    address: string,
    tokenAddress: string | null,
    filter: Partial<QueryTxFilter> = {}
  ): Promise<QueryTransactionsResponse> {
    //
    const returnResponse: QueryTransactionsResponse = {
      txlist: [],
    };
    const response = await this.apiClient.call(
      EtherscanApiAction.AccountTokentx,
      filter
    );
    const { status, result, ...resExtra } = response;
    if (status !== "1") {
      throw new Error(
        `${this.chainConfig.name} getTokenTransactions Fail:${JSON.stringify(
          response
        )} , Params:${JSON.stringify(filter)}`
      );
    }
    Object.assign(returnResponse, resExtra);
    for (const tx of result) {
      try {
        
        const newTx = await this.convertTxToEntity(tx);
        newTx && returnResponse.txlist.push(newTx);
      } catch (error: any) {
        console.log(error);
        logger.error(`getTokenTransactions Error:${tx.hash}`, error);
        throw error;
      }
    }
    return returnResponse;
  }
}
