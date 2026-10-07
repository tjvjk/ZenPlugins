import { Debug } from '../../common/debug'
import { InvalidPreferencesError } from '../../errors'
import get, { getBoolean, getNumber, getString } from '../../types/get'
import * as transport from './fetchApi'
import { AccountGraph, Auth, ExchangeDetails, HistoryPlan, PersistAuth, Preferences } from './models'
import { array, text } from './parse'

/** Refresh and persist credentials, preferring the saved rotated token. */
export async function authenticate (preferences: Preferences, stored: unknown, persist: PersistAuth): Promise<Auth> {
  const savedToken = get(stored, 'refreshToken')
  const credentials: Preferences = typeof savedToken === 'string' && savedToken.length > 0
    ? {
        refreshToken: savedToken,
        clientAuth: getString({ value: get(stored, 'clientAuth') }, 'value'),
        clientId: getString({ value: get(stored, 'clientId') }, 'value')
      }
    : preferences
  for (const key of ['refreshToken', 'clientAuth', 'clientId'] as const) {
    if (typeof credentials[key] !== 'string' || credentials[key].trim().length === 0) {
      throw new InvalidPreferencesError('Заполните refresh token, Client Auth и Client-Id из сессии MyAmeria.')
    }
  }
  const token = await transport.refreshToken(credentials)
  const accessToken = getString({ value: get(token, 'access_token') }, 'value')
  const refreshToken = getString({ value: get(token, 'refresh_token') }, 'value')
  const expiresIn = getNumber({ value: get(token, 'expires_in') }, 'value')
  console.assert(accessToken.length > 0 && refreshToken.length > 0 && Number.isFinite(expiresIn) && expiresIn > 0, 'Invalid MyAmeria token response')
  const auth: Auth = { ...credentials, accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 }
  await persist(auth)
  return auth
}

/** Load product details in the order of the complete account graph. */
export async function fetchProducts (auth: Auth, graph: unknown): Promise<readonly unknown[]> {
  const result: unknown[] = []
  const savingsAccounts = array(graph, 'savings')
    .filter(item => get(item, 'accountNumber') !== undefined)
    .map(item => ({ productType: 'ACCOUNT', id: text(item, 'id') }))
  const items = [...array(graph, 'accountsAndCards'), ...savingsAccounts]
  for (const item of items) {
    result.push(await transport.fetchProduct(auth, text(item, 'productType'), text(item, 'id')))
  }
  return result
}

/** Load each exchange document once to verify settled counterpart amounts. */
export async function fetchExchangeDetails (auth: Auth, records: readonly unknown[]): Promise<ExchangeDetails> {
  const result: Record<string, unknown> = {}
  for (const record of records) {
    if (text(record, 'transactionType') !== 'exchange') continue
    const id = text(record, 'transactionId')
    if (result[id] === undefined) result[id] = await transport.fetchTransactionDetail(auth, id)
  }
  return result
}

/** Load accounts, cards and savings with a sanitized checkpoint. */
export async function fetchAccountGraph (auth: Auth): Promise<unknown> {
  const listed = await transport.fetchAccounts(auth.accessToken, auth.clientId)
  const savings = await transport.fetchSavings(auth)
  const graph: AccountGraph = { accountsAndCards: array(listed, 'accountsAndCards'), savings: array(savings, 'savings') }
  await Debug.checkpoint('myameria-accounts', transport.maskLog(graph))
  return graph
}

/** Load every zero-based page of shared account history. */
export async function fetchTransactions (auth: Auth, fetchParams: Pick<HistoryPlan, 'source'>, fromDate: Date, toDate: Date): Promise<readonly unknown[]> {
  console.assert(fetchParams.source === 'history', 'Unsupported MyAmeria history source')
  const records: unknown[] = []
  for (let page = 0; page < 1000; page++) {
    const history = await transport.fetchHistoryPage(auth.accessToken, auth.clientId, fromDate, toDate, page)
    await Debug.checkpoint(`myameria-history-${page}`, transport.maskLog(history))
    records.push(...array(history, 'transactions'))
    if (!getBoolean({ value: get(history, 'hasNext') }, 'value')) return records
  }
  throw new Error('MyAmeria history pagination limit exceeded')
}

/** Load every one-based page of deposit history. */
export async function fetchDepositTransactions (auth: Auth, id: string): Promise<readonly unknown[]> {
  const records: unknown[] = []
  for (let page = 1; page <= 1000; page++) {
    const response = await transport.fetchDepositHistory(auth, id, page)
    const entries = array(response, 'entries')
    const total = getNumber({ value: get(response, 'totalCount') }, 'value')
    console.assert(Number.isInteger(total) && total >= 0, 'Invalid MyAmeria deposit history count')
    records.push(...entries)
    if (records.length === total) return records
    console.assert(entries.length > 0 && records.length < total, 'Incomplete MyAmeria deposit history')
  }
  throw new Error('MyAmeria deposit history pagination limit exceeded')
}
