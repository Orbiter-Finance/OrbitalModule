import { AlchemyWeb3, createAlchemyWeb3 } from '@alch/alchemy-web3'
import BigNumber from 'bignumber.js'
import {
  HashOrBlockNumber,
  ITransaction,
  QueryTxFilterEther,
  Transaction,
  TransactionStatus,
} from '../types'
import {
  IChainConfig,
  IEVMChain,
  QueryTransactionsResponse,
} from '../types/chain'
import { decodeMethod, equals, IERC20_ABI_JSON, isEmpty } from '../utils'
import logger from '../utils/logger'

export abstract class EVMChain implements IEVMChain {
  protected readonly web3: AlchemyWeb3
  constructor(public readonly chainConfig: IChainConfig) {
    this.web3 = createAlchemyWeb3(this.chainConfig.rpc[0])
  }

  public abstract getTransactions(
    address: string,
    filter?: Partial<QueryTxFilterEther>
  ): Promise<QueryTransactionsResponse>

  public abstract getTokenTransactions(
    address: string,
    tokenAddress?: string | null,
    filter?: Partial<QueryTxFilterEther>
  ): Promise<QueryTransactionsResponse>
  public getWeb3() {
    return this.web3
  }
  public getLatestHeight(): Promise<number> {
    return this.web3.eth.getBlockNumber()
  }
  public async getConfirmations(
    hashOrHeight: HashOrBlockNumber
  ): Promise<number> {
    const latestHeight = await this.getLatestHeight()
    if (typeof hashOrHeight === 'string') {
      const { blockNumber } = await this.web3.eth.getTransaction(hashOrHeight)
      if (blockNumber) {
        return this.calcConfirmations(blockNumber, latestHeight)
      }
      return 0
    } else {
      return this.calcConfirmations(Number(hashOrHeight), latestHeight)
    }
  }
  public async calcConfirmations(
    targetHeight: number,
    latestHeight: number
  ): Promise<number> {
    return Number(latestHeight) - Number(targetHeight) + 1
  }
  public async getTransactionByHash(
    txHash: string
  ): Promise<ITransaction | null> {
    const trx = await this.web3.eth.getTransaction(txHash)
    if (trx) {
      const tx = await this.convertTxToEntity(trx)
      return tx
    }
    return null
  }
  protected async decodeInputContractTransfer(
    input: string,
    contractAddress: string
  ) {
    const callFuncNameSign = input.substring(0, 10)
    const forwardNameSigns = ['0x29723511', '0x46f506ad']
    const decodeInputData = decodeMethod(
      String(input),
      forwardNameSigns.includes(callFuncNameSign) ? 'Forward' : 'ERC20'
    )
    const result = {
      //...
      name: '',
      transferData: {
        recipient: '',
        // sender: '',
        amount: new BigNumber(0),
        tokenAddress: '',
        ext: '',
      },
      data: {},
    }
    if (!decodeInputData || !decodeInputData.params) {
      return result
    }
    result.name = decodeInputData.name
    decodeInputData.params.forEach((el) => {
      const filedName = el.name.replace('_', '')
      result.data[filedName] = el.value
      result[filedName] = el
    })
    if (forwardNameSigns.includes(callFuncNameSign)) {
      // Forward
      switch (callFuncNameSign) {
        case '0x29723511': // transfer
          result.transferData.recipient = result.data['to']
          result.transferData.ext = result.data['ext']
          result.transferData.tokenAddress =
            this.chainConfig.nativeCurrency.address
          break
        case '0x46f506ad': // transfer erc20
          result.transferData.recipient = result.data['to']
          result.transferData.ext = result.data['ext']
          result.transferData.tokenAddress = result.data['token']
          result.transferData.amount = new BigNumber(result.data['amount'])
          break
      }
    } else {
      // Standard ERC20 Transfer
      result.transferData.recipient = result.data['recipient']
      result.transferData.amount = new BigNumber(result.data['amount'])
      result.transferData.tokenAddress = contractAddress;
    }
    // delete result.data;
    return result
  }
  public async convertTxToEntity(trx: any): Promise<Transaction | null> {
    const {
      hash,
      nonce,
      blockHash,
      blockNumber,
      transactionIndex,
      from,
      to,
      value,
      gasPrice,
      input,
      ...extra
    } = trx
    const trxRcceipt = await this.web3.eth.getTransactionReceipt(hash)
    if (!trxRcceipt) {
      return null
    }
    const gas = trxRcceipt.gasUsed
    // status
    const block = await this.web3.eth.getBlock(Number(blockNumber), false)
    const confirmations = await this.getConfirmations(blockNumber)
    const txData = new Transaction({
      chainId: this.chainConfig.chainId,
      hash,
      from,
      to: '',
      value: new BigNumber(value),
      nonce,
      blockHash: String(blockHash),
      blockNumber: Number(blockNumber),
      transactionIndex: Number(transactionIndex),
      gas: Number(gas),
      gasPrice: Number(gasPrice),
      fee: Number(gas) * Number(gasPrice),
      feeToken: this.chainConfig.nativeCurrency.symbol,
      input,
      symbol: '',
      tokenAddress: '',
      status: TransactionStatus.Fail,
      timestamp: Number(block.timestamp),
      confirmations,
      extra,
      source: 'rpc',
    })
    if (trxRcceipt.status) {
      txData.status = TransactionStatus.COMPLETE
    }
    // valid main token or contract token
    if (!isEmpty(to)) {
      const code = await this.web3.eth.getCode(to)
      if (code === '0x') {
        txData.to = to
        txData.tokenAddress = this.chainConfig.nativeCurrency.address
        txData.symbol = this.chainConfig.nativeCurrency.symbol
      } else {
        // contract token
        txData.tokenAddress = to
        txData.to = ''
        const inputData = await this.decodeInputContractTransfer(input, to)
        // transferData
        if (inputData && inputData.transferData) {
          const { tokenAddress, recipient, amount, ...inputExtra } =
            inputData.transferData
          txData.tokenAddress = tokenAddress
          txData.to = recipient
          txData.value = amount.gt(0) ? amount : txData.value;
          Object.assign(txData.extra, inputExtra)
        }
        txData.symbol = await this.getTokenSymbol(String(txData.tokenAddress))
      }
    }
    return txData
  }
  public async getBalance(address: string): Promise<BigNumber> {
    const value = await this.web3.eth.getBalance(address)
    return new BigNumber(value)
  }
  public async getDecimals(): Promise<number> {
    return this.chainConfig.nativeCurrency.decimals
  }
  public async getTokenBalance(
    address: string,
    tokenAddress: string
  ): Promise<BigNumber> {
    const tokenContract = new this.web3.eth.Contract(
      IERC20_ABI_JSON as any,
      tokenAddress
    )
    const tokenBalance = await tokenContract.methods.balanceOf(address).call()
    return new BigNumber(tokenBalance)
  }
  public async getTokenDecimals(tokenAddress: string): Promise<number> {
    if (equals(tokenAddress, this.chainConfig.nativeCurrency.address)) {
      return this.chainConfig.nativeCurrency.decimals
    }
    const token = await this.chainConfig.tokens.find((token) =>
      equals(token.address, tokenAddress)
    )
    if (token) {
      return token.decimals
    }
    try {
      const tokenContract = new this.web3.eth.Contract(
        IERC20_ABI_JSON as any,
        tokenAddress
      )
      const decimals = await tokenContract.methods.decimals().call()
      return decimals
    } catch (error) {
      logger.error(`getTokenDecimals Error:`, error.message, tokenAddress)
    }
    return NaN
  }
  public async getTokenSymbol(tokenAddress: string): Promise<string> {
    if (equals(tokenAddress, this.chainConfig.nativeCurrency.address)) {
      return this.chainConfig.nativeCurrency.symbol
    }
    const token = await this.chainConfig.tokens.find((token) =>
      equals(token.address, tokenAddress)
    )
    if (token) {
      return token.symbol
    }
    try {
      const tokenContract = new this.web3.eth.Contract(
        IERC20_ABI_JSON as any,
        tokenAddress
      )
      const symbol = await tokenContract.methods.symbol().call()
      return symbol
    } catch (error) {
      logger.error(`getTokenSymbol Error:`, error.message, tokenAddress)
    }
    return ''
  }
}
