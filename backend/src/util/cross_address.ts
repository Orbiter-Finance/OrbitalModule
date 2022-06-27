import { ethers, utils } from 'ethers'
import { makerConfig } from '../config'

const CROSS_ADDRESS_ABI = [
  {
    inputs: [
      { internalType: 'address payable', name: '_to', type: 'address' },
      { internalType: 'bytes', name: '_ext', type: 'bytes' },
    ],
    name: 'transfer',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '_token', type: 'address' },
      { internalType: 'address', name: '_to', type: 'address' },
      { internalType: 'uint256', name: '_amount', type: 'uint256' },
      { internalType: 'bytes', name: '_ext', type: 'bytes' },
    ],
    name: 'transferERC20',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

export type CrossAddressExt = {
  type: string
  value: string
}

export const CrossAddressExtTypes = {
  '0x01': 'Cross Ethereum Address',
  '0x02': 'Cross Dydx Address',
  '0x03': 'Cross Stark Address',
}

export class CrossAddress {
  private contractAddress: string
  private provider: ethers.providers.JsonRpcProvider
  private signer: ethers.Signer
  private networkId: number

  private providerNetworkId: number

  /**
   * @param provider
   * @param orbiterChainId
   * @param signer
   */
  constructor(
    provider: ethers.providers.JsonRpcProvider,
    orbiterChainId = 5,
    signer: ethers.Signer | undefined = undefined
  ) {
    this.contractAddress = makerConfig.crossAddressContracts[orbiterChainId]
    if (!this.contractAddress) {
      throw new Error('Sorry, miss param [contractAddress]')
    }

    this.provider = provider
    this.signer = signer || provider.getSigner()
    // this.networkId = makerConfig.localChainID_netChainID[orbiterChainId]
  }

  async checkNetworkId() {
    return true

    // if (!this.providerNetworkId) {
    //   this.providerNetworkId = (await this.provider.getNetwork()).chainId
    // }
    // if (this.providerNetworkId != this.networkId) {
    //   throw new Error(
    //     `Sorry, currentNetworkId: ${this.providerNetworkId} no equal networkId: ${this.networkId}`
    //   )
    // }
  }

  /**
   *
   * @param tokenAddress 0x...
   * @param amount
   */
  async approveERC20(
    tokenAddress: string,
    amount = ethers.constants.MaxUint256
  ) {
    await this.checkNetworkId()

    const contract = new ethers.Contract(
      tokenAddress,
      makerConfig.ABI,
      this.signer
    )
    await contract.approve(this.contractAddress, amount)
  }

  /**
   * @param to
   * @param amount
   * @param ext
   * @return
   */
  async transfer(
    to: string,
    amount: ethers.BigNumber,
    ext: CrossAddressExt | undefined = undefined
  ): Promise<{ hash: string }> {
    await this.checkNetworkId()

    if (ext && !CrossAddressExtTypes[ext.type]) {
      throw new Error(`Invalid crossAddressType : ${ext.type}`)
    }

    const contract = new ethers.Contract(
      this.contractAddress,
      CROSS_ADDRESS_ABI,
      this.signer
    )

    const extHex = CrossAddress.encodeExt(ext)
    const options = { value: amount.toHexString() }

    return await contract.transfer(to, extHex, options)
  }

  /**
   *
   * @param tokenAddress 0x...
   * @param to
   * @param amount
   * @param ext
   * @return
   */
  async transferERC20(
    tokenAddress: string,
    to: string,
    amount: ethers.BigNumber,
    ext: CrossAddressExt | undefined = undefined
  ): Promise<{ hash: string }> {
    await this.checkNetworkId()

    if (ext && !CrossAddressExtTypes[ext.type]) {
      throw new Error(`Invalid crossAddressType : ${ext.type}`)
    }

    // Check and approve erc20 amount
    const contractErc20 = new ethers.Contract(
      tokenAddress,
      makerConfig.ABI,
      this.provider
    )
    const ownerAddress = await this.signer.getAddress()
    const allowance = await contractErc20.allowance(
      ownerAddress,
      this.contractAddress
    )
    if (amount.gt(allowance)) {
      await this.approveERC20(tokenAddress)
    }

    const contract = new ethers.Contract(
      this.contractAddress,
      CROSS_ADDRESS_ABI,
      this.signer
    )
    const extHex = CrossAddress.encodeExt(ext)
    return await contract.transferERC20(
      tokenAddress,
      to,
      amount.toHexString(),
      extHex
    )
  }

  /**
   *
   * @param ext
   * @returns hex
   */
  static encodeExt(ext: CrossAddressExt | undefined) {
    if (!ext || !utils.isHexString(ext.type)) {
      return '0x'
    }
    if (!ext.value) {
      return ext.type
    }
    return utils.hexConcat([ext.type, ext.value])
  }

  /**
   *
   * @param hex
   * @returns
   */
  static decodeExt(hex: string): CrossAddressExt | undefined {
    if (!utils.isHexString(hex)) {
      return undefined
    }

    const type = utils.hexDataSlice(hex, 0, 1)
    const value = utils.hexDataSlice(hex, 1)
    return { type, value }
  }

  /**
   * @param input 0x...
   */
  static parseTransferInput(input: string): {
    to: string
    ext: CrossAddressExt | undefined
  } {
    const [to, ext] = utils.defaultAbiCoder.decode(
      ['address', 'bytes'],
      utils.hexDataSlice(input, 4)
    )
    return { to, ext: CrossAddress.decodeExt(ext) }
  }

  /**
   * @param input 0x...
   * @returns
   */
  static safeParseTransferInput(input: string) {
    try {
      return CrossAddress.parseTransferInput(input)
    } catch (err) {
      return undefined
    }
  }

  /**
   * @param input 0x...
   */
  static parseTransferERC20Input(input: string): {
    token: string
    to: string
    amount: ethers.BigNumber
    ext: CrossAddressExt | undefined
  } {
    const [token, to, amount, ext] = utils.defaultAbiCoder.decode(
      ['address', 'address', 'uint256', 'bytes'],
      utils.hexDataSlice(input, 4)
    )
    return { token, to, amount, ext: CrossAddress.decodeExt(ext) }
  }

  /**
   * @param input 0x...
   * @returns
   */
  static safeParseTransferERC20Input(input: string) {
    try {
      return CrossAddress.parseTransferERC20Input(input)
    } catch (err) {
      return undefined
    }
  }
}
