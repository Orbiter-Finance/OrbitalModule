import { groupBy, uniqBy } from "lodash";

export function equals<T, U extends T>(
  val1: T,
  val2: U,
  ignoreCase: boolean = true
) {
  if (val1 === val2) {
    return true
  }
  if (ignoreCase && String(val1).toLowerCase() === String(val2).toLowerCase()) {
    return true
  }
  return false
}

export function oldMarketConvertScanChainConfig(makerList: Array<any>) {
  const c1List = uniqBy(
    makerList,
    (row: { c1ID: string; makerAddress: string }) => {
      return row.c1ID + row.makerAddress
    }
  ).map((row: { c1ID: string; makerAddress: string }) => {
    return {
      intranetId: row.c1ID,
      address: row.makerAddress,
    }
  })
  const c2List = uniqBy(
    makerList,
    (row: { c2ID: string; makerAddress: string }) => {
      return row.c2ID + row.makerAddress
    }
  ).map((row: { c2ID: string; makerAddress: string }) => {
    return {
      intranetId: row.c2ID,
      address: row.makerAddress,
    }
  })
  const result = uniqBy(
    [...c1List, ...c2List],
    (row: { intranetId: string; address: string }) => {
      return row.intranetId + row.address
    }
  )
  return groupBy(result, 'intranetId')
}
