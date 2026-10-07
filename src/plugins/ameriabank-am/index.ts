import { Movement, ScrapeFunc } from '../../types/zenmoney'
import { authenticate, fetchAccountGraph, fetchTransactions, fetchProducts, fetchExchangeDetails, fetchDepositTransactions } from './api'
import { convertAccounts, convertTransactions, verifyDepositHistory } from './converters'
import { Preferences } from './models'

/** Import verified MyAmeria accounts and operations, persisting rotated authorization first. */
export const scrape: ScrapeFunc<Preferences> = async ({ preferences, fromDate, toDate, isInBackground }) => {
  ZenMoney.locale = 'ru'
  const auth = await authenticate(preferences, ZenMoney.getData('auth'), async auth => {
    ZenMoney.setData('auth', auth)
    ZenMoney.saveData()
  }, isInBackground)
  const requestEnd = toDate ?? nextArmenianMidnight()
  const graph = await fetchAccountGraph(auth)
  const products = await fetchProducts(auth, graph)
  const { accounts, fetchParams } = convertAccounts(graph, products)
  if (accounts.every(account => ZenMoney.isAccountSkipped(account.id))) return { accounts, transactions: [] }
  const history = await fetchTransactions(auth, fetchParams, fromDate, requestEnd)
  for (const source of fetchParams.deposits) {
    if (!ZenMoney.isAccountSkipped(source.accountId)) {
      verifyDepositHistory(await fetchDepositTransactions(auth, source.productId), fromDate, toDate)
    }
  }
  const details = await fetchExchangeDetails(auth, history)
  const transactions = convertTransactions(history, accounts, details, fromDate, toDate)
    .filter(transaction => transaction.movements.some(isSelectedMovement))
  return { accounts, transactions }
}

/** Supply the finite history endpoint boundary at the next Armenian midnight. */
function nextArmenianMidnight (): Date {
  const offset = 4 * 3600000
  const day = 86400000
  const nextDay = Math.floor((Date.now() + offset) / day) + 1
  return new Date(nextDay * day - offset)
}

/** Check whether a movement affects an account included in synchronization. */
function isSelectedMovement (movement: Movement): boolean {
  return 'id' in movement.account && !ZenMoney.isAccountSkipped(movement.account.id)
}
