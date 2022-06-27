import { Context, DefaultState } from 'koa'
import KoaRouter from 'koa-router'
import { getExchangeRates } from '../service/coinbase'
import { getMakerAddresses } from '../service/maker'

export default function (router: KoaRouter<DefaultState, Context>) {
  router.get('global', async ({ restful }) => {
    const makerAddresses = await getMakerAddresses()
    const exchangeRates = (await getExchangeRates()) || {}
    restful.json({ makerAddresses, exchangeRates })
  })
}
