import { provider } from 'web3-core'
import erc20Abi from './erc20_abi.json'
import {
  Account,
  Contract,
  ec,
  number,
  Provider,
  uint256,
  Signer,
} from 'starknet'
import { Uint256 } from 'starknet/dist/utils/uint256'
import BigNumber from 'bignumber.js'
import { BigNumberish } from 'starknet/dist/utils/number'
import { makerConfig } from '../../config'
import { OfflineAccount } from './account'
import { compileCalldata } from 'starknet/dist/utils/stark'
import Keyv from 'keyv'
import KeyvFile from 'orbiter-chaincore/src/utils/keyvFile'
import { max } from 'lodash'
export type starknetNetwork = 'mainnet-alpha' | 'georli-alpha'

export class StarknetHelp {
  private cache: Keyv
  constructor(
    public readonly network: starknetNetwork,
    public readonly privateKey: string,
    public readonly address: string
  ) {
    this.cache = new Keyv({
      store: new KeyvFile({
        filename: `logs/nonce/starknet`, // the file path to store the data
        expiredCheckDelay: 999999 * 24 * 3600 * 1000, // ms, check and remove expired data in each ms
        writeDelay: 100, // ms, batch write to disk in a specific duration, enhance write performance.
        encode: JSON.stringify, // serialize function
        decode: JSON.parse, // deserialize function
      }),
    })
  }
  async getNetworkNonce() {
    const starkPair = ec.getKeyPair(this.privateKey)
    const signer = new Signer(starkPair)
    const provider = new Provider({ network: <any>this.network }) // for testnet you can use defaultProvider
    const acc: OfflineAccount = new OfflineAccount(
      provider,
      this.address,
      signer
    )
    return Number(await acc.getNonce())
  }
  async takeOutNonce() {
    const nonces = await this.getAvailableNonce()
    const takeNonce = nonces.splice(0, 1)[0]
    const cacheKey = `nonces:${this.address.toLowerCase()}`
    await this.cache.set(cacheKey, nonces)
    return {
      nonce: takeNonce,
      rollback: async () => {
        console.log('starknet transaction fail rollback nonce:', takeNonce)
        const nonces = await this.getAvailableNonce()
        nonces.push(takeNonce)
        await this.cache.set(cacheKey, nonces)
      },
    }
  }
  async getAvailableNonce() {
    const cacheKey = `nonces:${this.address.toLowerCase()}`
    let nonces: any = (await this.cache.get(cacheKey)) || []
    if (nonces && nonces.length <= 5) {
      // render
      let localLastNonce: number = max(nonces) || 0
      const networkLastNonce = await this.getNetworkNonce()
      if (networkLastNonce > localLastNonce) {
        nonces = [networkLastNonce]
        localLastNonce = networkLastNonce
        // clear
      }
      for (let i = nonces.length; i <= 10; i++) {
        localLastNonce++
        nonces.push(localLastNonce)
      }
    }
    nonces.sort((n1, n2) => n1 - n2)
    await this.cache.set(cacheKey, nonces)
    return nonces
  }
  async signTransfer(
    params: {
      tokenAddress: string
      recipient: string
      amount: string
      nonce?: number
    }
  ) {
    const starkPair = ec.getKeyPair(this.privateKey)
    const signer = new Signer(starkPair)
    const provider = new Provider({ network: <any>this.network }) // for testnet you can use defaultProvider
    const acc: OfflineAccount = new OfflineAccount(provider, this.address, signer)
    const entrypoint = 'transfer'
    const calldata = compileCalldata({
      recipient: params.recipient,
      amount: getUint256CalldataFromBN(params.amount),
    })
    let nonce = params.nonce
    if (!nonce) {
      nonce = (await this.takeOutNonce()).nonce
    }
    const signedTx = await acc.signTx(params.tokenAddress, entrypoint, calldata, Number(nonce))
    const sentTx = await acc.broadcastSignedTransaction(signedTx)
    const hash = sentTx.transaction_hash
    // provider.getTransaction(hash).then((result) => {
    //   console.log(JSON.stringify(result), '==before')
    // })
    // await provider.waitForTransaction(txid)
    // console.log(await acc.getNonce(), 'after==nonce')
    // provider.getTransaction(txid).then((result) => {
    //   console.log(JSON.stringify(result), '===after')
    // })
    return { hash }
  }
}
/**
 *
 * @param starknetAddress
 * @param contractAddress
 * @param networkId
 * @returns
 */
export async function getErc20Balance(
  starknetAddress: string,
  contractAddress: string,
  chainId: number
) {
  if (!starknetAddress || !contractAddress) {
    return 0
  }
  const provider = getProviderByChainId(chainId)

  const tokenContract = new Contract(<any>erc20Abi, contractAddress, provider)
  const balanceSender: Uint256 = (
    await tokenContract.balanceOf(starknetAddress)
  ).balance
  return new BigNumber(balanceSender.low.toString() || 0).toNumber()
}

/**
 *
 * @param chainId
 * @returns
 */
export function getProviderByChainId(chainId: number) {
  const network = chainId == 4 ? 'mainnet-alpha' : 'georli-alpha'
  return new Provider({ network: <any>network })
}
export function getUint256CalldataFromBN(bn: BigNumberish) {
  return { type: 'struct' as const, ...uint256.bnToUint256(String(bn)) }
}
export async function sendEthTransaction(
  network: 'mainnet-alpha' | 'goerli-alpha',
  makerAddress: string,
  params: {
    tokenAddress: string
    to: string
    amount: string
  }
) {
  let fromAddr = makerAddress
  const privateKey = makerConfig.privateKeys[fromAddr.toLowerCase()]
  if (!fromAddr) {
    throw new Error(
      `Not injected Starknet Maker Address ${fromAddr} PrivateKey`
    )
  }
  if (params.to.length != 66) {
    throw new Error(`Starknet To Address ${params.to} Format Error`)
  }
  return new Promise(async (resolve, reject) => {
    try {
      const provider = new Provider({ network: <any>network })
      const userSender = new Account(
        provider,
        fromAddr,
        ec.getKeyPair(privateKey)
      )
      const ethContract = new Contract(
        <any>erc20Abi,
        params.tokenAddress,
        userSender
      )
      const tokenBalance = await getErc20Balance(
        userSender.address,
        params.tokenAddress,
        network === 'goerli-alpha' ? 44 : 4
      )
      const toAmount = number.toBN(params.amount)
      if (toAmount.gt(number.toBN(tokenBalance.toString()))) {
        throw new Error(
          `Starknet ${
            userSender.address
          } Insufficient funds ${tokenBalance.toString()}/${toAmount.toString()}`
        )
      }

      const transferResp = await ethContract.transfer(
        params.to,
        getUint256CalldataFromBN(toAmount)
      )
      if (transferResp.code != 'TRANSACTION_RECEIVED') {
        return reject(`Starknet transfer failed ${transferResp.code}`)
      }
      console.warn(
        'Waitting transfer transaction:',
        transferResp.transaction_hash
      )

      return resolve({
        hash: transferResp.transaction_hash,
        done: () => provider.waitForTransaction(transferResp.transaction_hash),
      })
    } catch (error) {
      console.error(error)
      reject(error)
    }
  })
}
