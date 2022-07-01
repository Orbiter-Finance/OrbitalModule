import { BigNumber } from 'bignumber.js'
import { accessLogger } from '../logger'

import { performUserAmountLegality } from "./userAmountProtector"

const MAX_BITS = {
  eth: 256,
  arbitrum: 256,
  zksync: 35,
  starknet: 256,
  polygon: 256,
  optimism: 256,
  immutablex: 28,
  loopring: 256,
  metis: 256,
  dydx: 28,
  boba: 256,
  zkspace: 35,
  zksync2: 256,
}

export const CHAIN_INDEX = {
  1: 'eth',
  2: 'arbitrum',
  22: 'arbitrum',
  3: 'zksync',
  33: 'zksync',
  4: 'starknet',
  44: 'starknet',
  5: 'eth',
  6: 'polygon',
  66: 'polygon',
  7: 'optimism',
  77: 'optimism',
  8: 'immutablex',
  88: 'immutablex',
  9: 'loopring',
  99: 'loopring',
  10: 'metis',
  510: 'metis',
  11: 'dydx',
  511: 'dydx',
  12: 'zkspace',
  512: 'zkspace',
  13: 'boba',
  513: 'boba',
  514: "zksync2"
}

export const SIZE_OP = {
  P_NUMBER: 4,
}

/**
 * @deprecated
 * @param chain
 * @returns
 */
function isZKChain(chain: string | number) {
  if (chain === 3 || chain === 33 || chain === 'zksync') {
    return true
  }
  return false
}

function isLimitNumber(chain: string | number) {
  if (chain === 3 || chain === 33 || chain === 'zksync') {
    return true
  }
  if (chain === 8 || chain === 88 || chain === 'immutablex') {
    return true
  }
  if (chain === 11 || chain === 511 || chain === 'dydx') {
    return true
  }
  if (chain === 12 || chain === 512 || chain === 'zkspace') {
    return true
  }
  return false
}

function isLPChain(chain) {
  if (chain === 9 || chain === 99 || chain === 'loopring') {
    return true
  }
  return false
}

function isAmountValid(chain, amount) {
  if (!isChainSupport(chain)) {
    return {
      state: false,
      error: 'The chain did not support',
    }
  }
  if (amount < 1) {
    return {
      state: false,
      error: "the token doesn't support that many decimal digits",
    }
  }

  let validDigit = AmountValidDigits(chain, amount) // 10 11
  var amountLength = amount.toString().length
  if (amountLength < SIZE_OP.P_NUMBER) {
    return {
      state: false,
      error: 'Amount size must be greater than pNumberSize',
    }
  }

  let rAmount = amount
  if (isLimitNumber(chain)) {
    rAmount = removeSidesZero(amount.toString())
  }
  if (!isAmountInRegion(rAmount, chain)) {
    return {
      state: false,
      error: 'Amount exceeds the spending range',
    }
  }
  if (isLimitNumber(chain) && amountLength > validDigit) {
    let zkAmount = amount.toString().slice(0, validDigit)
    let op_text = zkAmount.slice(-SIZE_OP.P_NUMBER)
    if (Number(op_text) === 0) {
      return {
        state: true,
      }
    }
    return {
      state: false,
      error: 'Insufficient number of flag bits',
    }
  } else {
    let op_text = amount.toString().slice(-SIZE_OP.P_NUMBER)
    if (Number(op_text) === 0) {
      return {
        state: true,
      }
    }
    return {
      state: false,
      error: 'Insufficient number of flag bits',
    }
  }
}

function getToAmountFromUserAmount(userAmount, selectMakerInfo, isWei) {
  userAmount = performUserAmountLegality(userAmount, selectMakerInfo);
  let toAmount_tradingFee = new BigNumber(userAmount).minus(
    new BigNumber(selectMakerInfo.tradingFee)
  )
  // accessLogger.info('toAmount_tradingFee =', toAmount_tradingFee.toString())
  let gasFee = toAmount_tradingFee
    .multipliedBy(new BigNumber(selectMakerInfo.gasFee))
    .dividedBy(new BigNumber(1000))
  // accessLogger.info('gasFee =', gasFee.toString())
  let digit = selectMakerInfo.precision === 18 ? 5 : 2
  // accessLogger.info('digit =', digit)
  let gasFee_fix = gasFee.decimalPlaces(digit, BigNumber.ROUND_UP)
  // accessLogger.info('gasFee_fix =', gasFee_fix.toString())
  let toAmount_fee = toAmount_tradingFee.minus(gasFee_fix)
  // accessLogger.info('toAmount_fee =', toAmount_fee.toString())
  if (!toAmount_fee || isNaN(Number(toAmount_fee))) {
    return 0
  }
  if (isWei) {
    return toAmount_fee.multipliedBy(
      new BigNumber(10 ** selectMakerInfo.precision)
    )
  } else {
    return toAmount_fee
  }
}
function getTAmountFromRAmount(chain, amount, pText) {
  if (!isChainSupport(chain)) {
    return {
      state: false,
      error: 'The chain did not support',
    }
  }
  if (amount < 1) {
    return {
      state: false,
      error: "the token doesn't support that many decimal digits",
    }
  }
  if (pText.length > SIZE_OP.P_NUMBER) {
    return {
      state: false,
      error: 'the pText size invalid',
    }
  }

  let validDigit = AmountValidDigits(chain, amount) // 10 11
  var amountLength = amount.toString().length
  if (amountLength < SIZE_OP.P_NUMBER) {
    return {
      state: false,
      error: 'Amount size must be greater than pNumberSize',
    }
  }
  if (isLimitNumber(chain) && amountLength > validDigit) {
    let tAmount =
      amount.toString().slice(0, validDigit - pText.length) +
      pText +
      amount.toString().slice(validDigit)
    return {
      state: true,
      tAmount: tAmount,
    }
  } else if (isLPChain(chain)) {
    return {
      state: true,
      tAmount: amount + '',
    }
  } else {
    let tAmount =
      amount.toString().slice(0, amountLength - pText.length) + pText
    return {
      state: true,
      tAmount: tAmount,
    }
  }
}

function getPTextFromTAmount(chain, amount) {
  if (!isChainSupport(chain)) {
    return {
      state: false,
      error: '',
    }
  }
  if (amount < 1) {
    return {
      state: false,
      error: "the token doesn't support that many decimal digits",
    }
  }
  //Get the effective number of digits
  let validDigit = AmountValidDigits(chain, amount) // 10 11
  var amountLength = amount.toString().length
  if (amountLength < SIZE_OP.P_NUMBER) {
    return {
      state: false,
      error: 'Amount size must be greater than pNumberSize',
    }
  }
  if (isLimitNumber(chain) && amountLength > validDigit) {
    let zkAmount = amount.toString().slice(0, validDigit)
    let op_text = zkAmount.slice(-SIZE_OP.P_NUMBER)
    return {
      state: true,
      pText: op_text,
    }
  } else {
    let op_text = amount.toString().slice(-SIZE_OP.P_NUMBER)
    return {
      state: true,
      pText: op_text,
    }
  }
}
function getRAmountFromTAmount(chain, amount) {
  let pText = ''
  for (let index = 0; index < SIZE_OP.P_NUMBER; index++) {
    pText = pText + '0'
  }
  if (!isChainSupport(chain)) {
    return {
      state: false,
      error: 'The chain did not support',
    }
  }
  if (amount < 1) {
    return {
      state: false,
      error: "the token doesn't support that many decimal digits",
    }
  }

  let validDigit = AmountValidDigits(chain, amount) // 10 11
  var amountLength = amount.toString().length
  if (amountLength < SIZE_OP.P_NUMBER) {
    return {
      state: false,
      error: 'Amount size must be greater than pNumberSize',
    }
  }
  if (isLimitNumber(chain) && amountLength > validDigit) {
    let rAmount =
      amount.toString().slice(0, validDigit - SIZE_OP.P_NUMBER) +
      pText +
      amount.toString().slice(validDigit)
    return {
      state: true,
      rAmount: rAmount,
    }
  } else {
    let rAmount =
      amount.toString().slice(0, amountLength - SIZE_OP.P_NUMBER) + pText
    return {
      state: true,
      rAmount: rAmount,
    }
  }
}

function isChainSupport(chain) {
  if (parseInt(chain) == chain) {
    if (CHAIN_INDEX[chain] && MAX_BITS[CHAIN_INDEX[chain]]) {
      return true
    }
  } else {
    if (MAX_BITS[chain.toLowerCase()]) {
      return true
    }
  }
  return false
}

/**
 * 0 ~ (2 ** N - 1)
 * @param { any } chain
 * @returns { any }
 */
function AmountRegion(chain): any {
  if (!isChainSupport(chain)) {
    return {
      error: 'The chain did not support',
    }
  }
  if (typeof chain === 'number') {
    let max = new BigNumber(2 ** MAX_BITS[CHAIN_INDEX[chain]] - 1)
    return {
      min: new BigNumber(0),
      max: max,
    }
  } else if (typeof chain === 'string') {
    let max = new BigNumber(2 ** MAX_BITS[chain.toLowerCase()] - 1)
    return {
      min: new BigNumber(0),
      max: max,
    }
  }
}

function AmountMaxDigits(chain) {
  let amountRegion = AmountRegion(chain)
  if (amountRegion?.error) {
    return amountRegion
  }
  return amountRegion.max.toFixed().length
}

function AmountValidDigits(chain, amount) {
  let amountMaxDigits = AmountMaxDigits(chain)
  if (amountMaxDigits.error) {
    return amountMaxDigits.error
  }
  let amountRegion = AmountRegion(chain)

  let ramount = removeSidesZero(amount.toString())

  if (ramount.length > amountMaxDigits) {
    return 'amount is inValid'
  }
  //note:the compare is one by one,not all by all
  if (ramount > amountRegion.max.toFixed()) {
    return amountMaxDigits - 1
  } else {
    return amountMaxDigits
  }
}

function removeSidesZero(param) {
  if (typeof param !== 'string') {
    return 'param must be string'
  }
  return param.replace(/^0+(\d)|(\d)0+$/gm, '$1$2')
}

function isAmountInRegion(amount, chain) {
  if (!isChainSupport(chain)) {
    return {
      state: false,
      error: 'The chain did not support',
    }
  }
  let amountRegion = AmountRegion(chain)
  if (amountRegion.error) {
    return false
  }
  accessLogger.info('amountRegion_min', amountRegion.min.toString())
  accessLogger.info('amountRegion_max', amountRegion.max.toString())
  if (
    new BigNumber(amount).gte(amountRegion.min) &&
    new BigNumber(amount).lte(amountRegion.max)
  ) {
    return true
  }
  return false
}

function pTextFormatZero(num) {
  if (String(num).length > SIZE_OP.P_NUMBER) return num
  return (Array(SIZE_OP.P_NUMBER).join('0') + num).slice(-SIZE_OP.P_NUMBER)
}

function transferTimeStampToTime(timestamp) {
  if (!timestamp) {
    return timestamp
  }
  if (timestamp.toString().length === 10) {
    timestamp = timestamp * 1000
  }
  var date = new Date(timestamp)
  var Y = date.getFullYear() + '-'
  var M =
    (date.getMonth() + 1 < 10
      ? '0' + (date.getMonth() + 1)
      : date.getMonth() + 1) + '-'
  var D = date.getDate() + ' '
  var h = date.getHours() + ':'
  var m = date.getMinutes() + ':'
  var s = date.getSeconds()
  var result = Y + M + D + h + m + s
  accessLogger.info(result)
  return result
}

export {
  isAmountValid,
  transferTimeStampToTime,
  getTAmountFromRAmount,
  getRAmountFromTAmount,
  getPTextFromTAmount,
  pTextFormatZero,
  isZKChain,
  isLimitNumber,
  getToAmountFromUserAmount,
}
