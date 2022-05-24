import { AlchemyWeb3, createAlchemyWeb3 } from '@alch/alchemy-web3'
import { accessLogger } from '../../util/logger'
import { groupBy } from 'lodash'
import { makerConfig } from '../../config'
export interface Transaction {
  blockNumber: string
  timeStamp: string
  hash: string
  nonce: string
  blockHash: string
  transactionIndex: string
  from: string
  to: string
  value: string
  gas: string
  gasPrice: string
  isError: string
  txreceipt_status: string
  input: string
  contractAddress: string
  cumulativeGasUsed: string
  gasUsed: string
  confirmations: string
}
type Address = String
export default class OptimisticWS {
  static txList: Map<Address, Array<Transaction>> = new Map()
  static web3: AlchemyWeb3
  constructor(addressList: Array<Address>, ws: string) {
    for (const address of addressList) {
      OptimisticWS.txList.set(address.toLowerCase(), [])
    }
    if (!OptimisticWS.web3) {
      OptimisticWS.web3 = createAlchemyWeb3(ws)
    }
  }
  // maker
  makerScan() {
    /// sub
    OptimisticWS.web3.eth
      .subscribe('newBlockHeaders', (error, result) => {
        if (error)
          accessLogger.error(
            `[Optimistic] ws Subscribe newBlockHeaders error:`,
            error
          )
      })
      .on('data', async (blockHeader) => {
        const blockNumber = blockHeader.number
        const block = await OptimisticWS.web3.eth.getBlock(blockNumber, true)
        this.handleBlockTrx(block)
      })
  }
  async handleBlockTrx(block: any) {
    for (const tx of block.transactions) {
      if (tx.from && tx.to && Number(tx.value) > 0) {
        const from = String(tx.from).toLowerCase()
        const to = String(tx.to).toLowerCase()
        let matchMakerAddress = ''
        if (OptimisticWS.txList.has(from)) matchMakerAddress = from
        else if (OptimisticWS.txList.has(to)) matchMakerAddress = to
        if (!matchMakerAddress) {
          continue
        }
        const raxTx = await OptimisticWS.web3.eth.getTransactionReceipt(tx.hash)
        if (!raxTx || !raxTx.status) {
          continue
        }
        const index = OptimisticWS.txList
          .get(matchMakerAddress)
          ?.findIndex((row) => row.hash.toLowerCase() === tx.hash.toLowerCase())
        if (Number(index) != -1) {
          // exists tx
          continue
        }
        const trx: Transaction = {
          blockNumber: String(block.number),
          timeStamp: String(block.timestamp),
          hash: tx.hash,
          nonce: String(tx.nonce),
          blockHash: String(block.hash),
          transactionIndex: String(tx.transactionIndex),
          from: tx.from,
          to: tx.to,
          value: tx.value,
          gas: String(tx.gas),
          gasPrice: tx.gasPrice,
          isError: '0',
          txreceipt_status: '1',
          input: tx.input,
          contractAddress: '',
          cumulativeGasUsed: String(raxTx.cumulativeGasUsed),
          gasUsed: String(block.gasUsed),
          confirmations: '1',
        }
        OptimisticWS.txList.get(matchMakerAddress)?.unshift(trx)
        accessLogger.info(
          `[Optimistic] WS Scan Block in Maker(${matchMakerAddress}) Transaction:`,
          block.number,
          JSON.stringify(trx)
        )
      }
    }
  }
  // dashboard
  async dashboardScan(start: number, end?:number) {
    if (!end) {
      end = await OptimisticWS.web3.eth.getBlockNumber();
    }
    // 
    while (start <= end) {
      try {
        const block = await OptimisticWS.web3.eth.getBlock(start, true)
        accessLogger.info(`[dashboardScan] Scan Block ${block.number} trxs:${block.transactions.length}`)
        await this.handleBlockTrx(block);
        start++;
      } catch (error) {
        accessLogger.error(`[dashboardScan] scan block error：`, error.message)
      }
    }
  }
}

export function getOpMakertList(makerList: Array<any>) {
  const opIds = [7, 77]
  const optimisticMarketList = makerList.filter(
    (row) => opIds.includes(row.c1ID) || opIds.includes(row.c2ID)
  )
  if (optimisticMarketList.length > 0) {
    const opMakerAddress = groupBy(optimisticMarketList, 'makerAddress')
    const isTestEnv = optimisticMarketList.find(
      (row) => row.c1ID === 77 || row.c2ID === 77
    )
    return {
      makerAddress: Object.keys(opMakerAddress),
      ws: isTestEnv
        ? makerConfig.optimism_test.wsEndPoint
        : makerConfig.optimism.wsEndPoint,
    }
  }
  return null;
}
