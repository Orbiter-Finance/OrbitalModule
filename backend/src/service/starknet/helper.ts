import { provider } from 'web3-core'
import erc20Abi from './erc20_abi.json'
import obSourceAbi from './ob_source_abi.json'
import { Account, Contract, ec, number, Provider, uint256 } from 'starknet'
import { Uint256 } from 'starknet/dist/utils/uint256'
import BigNumber from 'bignumber.js'
import { BigNumberish } from 'starknet/dist/utils/number'
import { makerConfig } from '../../config'

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
function getUint256CalldataFromBN(bn: BigNumberish) {
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
      const tokenBalance = await getErc20Balance(userSender.address, params.tokenAddress, network === 'goerli-alpha' ? 44 : 4)
      const toAmount = number.toBN(params.amount)
      if (toAmount.gt(number.toBN(tokenBalance.toString()))) {
        throw new Error(
          `Starknet ${userSender.address} Insufficient funds ${tokenBalance.toString()}/${toAmount.toString()}`
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
