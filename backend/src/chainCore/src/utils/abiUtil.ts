import { sha3 } from 'web3-utils'
import AbiCoder from 'web3-eth-abi'
import BigNumber from 'bignumber.js'
export const IERC20_ABI_JSON = require('../abi/IERC20.json')
export const ZKSYNC2_ABI_JSON = require('../abi/IERC20.json')
export const Forward_ABI = require('../abi/Forward.json')
type ABIConfig = {
  json: any
  map: Map<string, any>
}
const ABIMap: Map<string, ABIConfig> = new Map()
ABIMap.set('IERC20', {
  json: IERC20_ABI_JSON,
  map: ABIToMapping(IERC20_ABI_JSON),
})
ABIMap.set('Forward', {
  json: Forward_ABI,
  map: ABIToMapping(Forward_ABI),
})

export function ABIToMapping(abi: Array<any>) {
  try {
    const abiMap: Map<string, any> = new Map()
    for (const abiItem of abi) {
      if (abiItem.name) {
        const signHex = sha3(
          `${abiItem.name}(${abiItem.inputs.map(ABIInputToString).join(',')})`
        )
        if (signHex) {
          abiMap.set(
            abiItem.type === 'event' ? signHex.slice(2) : signHex.slice(2, 10),
            abiItem
          )
        }
      }
    }
    return abiMap
  } catch (error) {
    throw new Error(`Disassembly ABI failed ${error.message}`)
  }
}
export function ABIInputToString<T extends { type: string; components?: any }>(
  input: T
) {
  if (input.type.includes('tuple')) {
    return '(' + input.components.map(ABIInputToString).join(',') + ')'
  }
  return input.type
}

export function decodeMethod(input: string, abiFile: string = 'IERC20'): any {
  if (!ABIMap.has(abiFile)) {
    abiFile = 'IERC20'
    // throw new Error(`${abiFile} Abi Name Not Exists`)
  }
  const abiItems = ABIMap.get(abiFile)?.map
  if (!abiItems) {
    throw new Error(`${abiFile} Abi Name items Not Exists`)
  }
  const signId = input.slice(2, 10)
  const abiItem = abiItems.get(signId)
  if (!abiItem) {
    return null
  }
  const result: any = {
    name: abiItem.name,
    params: [],
  }
  const decodeResult: any = AbiCoder['decodeParameters'](
    abiItem.inputs,
    input.slice(10)
  )
  for (let index = 0; index < decodeResult.__length__; index++) {
    const element = decodeResult[index]
    let values: any = element
    const isUint = abiItem.inputs[index].type.includes('uint')
    const isInt = abiItem.inputs[index].type.includes('int')
    const isAddress = abiItem.inputs[index].type.includes('address')
    if (isUint || isInt) {
      if (Array.isArray(element)) {
        values = element.map((val) => new BigNumber(val).toString())
      } else {
        values = new BigNumber(element).toString()
      }
    }
    // Addresses returned by web3 are randomly cased so we need to standardize and lowercase all
    if (isAddress) {
      if (Array.isArray(element)) {
        values = element.map((el) => el.toLowerCase())
      } else {
        values = element.toLowerCase()
      }
    }
    result.params.push({
      name: abiItem.inputs[index].name,
      value: values,
      type: abiItem.inputs[index].type,
    })
  }
  return result
}

export function decodeLogs(
  logs: any,
  abiFile: string = 'IERC20'
): Array<any> | null {
  if (!ABIMap.has(abiFile)) {
    abiFile = 'IERC20'
    // throw new Error(`${abiFile} Abi Name Not Exists`)
  }
  const abiItems = ABIMap.get(abiFile)?.map
  if (!abiItems) {
    throw new Error(`${abiFile} Abi Name items Not Exists`)
  }
  return logs
    .filter((log) => log.topics.length > 0)
    .map((logItem) => {
      const method = abiItems.get(logItem.topics[0].slice(2))
      if (!method) {
        return null
      }
      const logData = logItem.data
      let decodedParams: any = []
      let dataIndex = 0
      let topicsIndex = 1

      const dataTypes: Array<string> = []
      method.inputs.map((input) => {
        if (!input.indexed) {
          dataTypes.push(input.type)
        }
      })
      const decodedData = AbiCoder['decodeParameters'](
        dataTypes,
        logData.slice(2)
      )
      // Loop topic and data to get the params
      method.inputs.map(function (param) {
        const decodedP: any = {
          name: param.name,
          type: param.type,
        }

        if (param.indexed) {
          decodedP.value = logItem.topics[topicsIndex]
          topicsIndex++
        } else {
          decodedP.value = decodedData[dataIndex]
          dataIndex++
        }

        if (param.type === 'address') {
          decodedP.value = decodedP.value.toLowerCase()
          // 42 because len(0x) + 40
          if (decodedP.value.length > 42) {
            let toRemove = decodedP.value.length - 42
            let temp = decodedP.value.split('')
            temp.splice(2, toRemove)
            decodedP.value = temp.join('')
          }
        }
        // if (
        //   param.type === "uint256" ||
        //   param.type === "uint8" ||
        //   param.type === "int"
        // ) {
        //   // ensure to remove leading 0x for hex numbers
        //   if (typeof decodedP.value === "string" && decodedP.value.startsWith("0x")) {
        //     // decodedP.value = new BN(decodedP.value.slice(2), 16).toString(10);
        //   } else {
        //     // decodedP.value = new BN(decodedP.value).toString(10);
        //   }

        // }
        decodedParams.push(decodedP)
      })
      return {
        name: method.name,
        events: decodedParams,
        address: logItem.address,
      }
    })
}
