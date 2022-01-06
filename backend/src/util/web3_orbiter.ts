import { Transaction } from 'ethers'
import Web3 from 'web3'

type Web3OrbiterFilter = {
  from?: string
  to?: string
}
type TransferListenCallbacks = {
  onConfirmation?: (transaction: Transaction, subscriptionId: string) => any
  onReceived?: (transaction: Transaction, subscriptionId: string) => any
  onConnected?: (subscriptionId: string) => any
}

const TRANSFERLISTEN_INTERVAL_DURATION = 2 * 1000

export class Web3Orbiter {
  private web3: Web3

  constructor(web3: Web3) {
    this.web3 = web3
  }

  transferListen(
    filter: Web3OrbiterFilter | undefined,
    callbacks?: TransferListenCallbacks,
    confirmationsTotal = 3
  ) {
    const subscription = this.web3.eth.subscribe('newBlockHeaders', (error) => {
      if (error) {
        console.error(error)
      }
    })

    subscription.on('connected', (subscriptionId) => {
      callbacks &&
        callbacks.onConnected &&
        callbacks.onConnected(subscriptionId)
    })

    subscription.on('data', async (blockHeader) => {
      const transactionCount = await this.web3.eth.getBlockTransactionCount(
        blockHeader.number
      )

      //   watch transaction
      const watchTransaction = async (hash: string) => {
        try {
          const transaction = await this.web3.eth.getTransaction(hash)
          if (!transaction || !transaction.from || !transaction.to) {
            setTimeout(
              () => watchTransaction(hash),
              TRANSFERLISTEN_INTERVAL_DURATION
            )
            return
          }

          if (filter) {
            if (
              filter.from &&
              filter.from.toUpperCase() != transaction.from.toUpperCase()
            ) {
              return
            }

            if (
              filter.to &&
              filter.to.toUpperCase() != transaction.to.toUpperCase()
            ) {
              return
            }
          }

          callbacks &&
            callbacks.onReceived &&
            callbacks.onReceived(<any>transaction, subscription.id)
          if (confirmationsTotal <= 0) {
            return
          }

          if (transaction.blockNumber) {
            const currentBlockNumber = await this.web3.eth.getBlockNumber()
            if (
              currentBlockNumber - transaction.blockNumber >=
              confirmationsTotal
            ) {
              callbacks &&
                callbacks.onConfirmation &&
                callbacks.onConfirmation(<any>transaction, subscription.id)
              return
            }
          }

          setTimeout(
            () => watchTransaction(hash),
            TRANSFERLISTEN_INTERVAL_DURATION
          )
        } catch (error) {
          console.error(error)
        }
      }

      for (let index = 0; index < transactionCount; index++) {
        const transaction = await this.web3.eth.getTransactionFromBlock(
          blockHeader.number,
          index
        )

        if (transaction && transaction.hash) {
          watchTransaction(transaction?.hash)
        }
      }
    })
  }
}