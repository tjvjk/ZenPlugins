import { fetchJson } from '../../common/network'
import get, { getString } from '../../types/get'
import { Auth, Preferences, RequestParameters } from './models'
const baseUrl = 'https://ob.myameria.am/api'
const tokenUrl = 'https://account.myameria.am/auth/realms/ameria/protocol/openid-connect/token'

const secretField = /authorization|cookie|token|secret|password|clientauth|client_auth|session|client.?id|creator|userid|executor|ipaddress|passport|email|phone|birth|first.?name|last.?name|full.?name|cardholdername|beneficiaryname|beneficiaryaddress|cardnumber|pan$/i

/** Recursively redact credential and personal fields from network logs. */
export function maskLog (value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskLog)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, secretField.test(key) ? '<redacted>' : maskLog(item)
    ]))
  }
  return value
}

/** Refresh authorization while redacting the entire token response body. */
export async function refreshToken (credentials: Preferences): Promise<unknown> {
  const response = await fetchJson(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials.clientAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://myameria.am',
      Referer: 'https://myameria.am/'
    },
    body: { grant_type: 'refresh_token', refresh_token: credentials.refreshToken },
    stringify: encodedQuery,
    sanitizeRequestLog: maskLog,
    sanitizeResponseLog: (log: unknown) => maskLog({
      url: get(log, 'url'), status: get(log, 'status'), headers: get(log, 'headers'), body: '<redacted>'
    })
  })
  console.assert(response.status === 200, 'MyAmeria token request failed', { status: response.status })
  return response.body
}

/** Fetch the complete accounts and cards listing. */
export async function fetchAccounts (accessToken: string, clientId: string): Promise<unknown> {
  return await request('accounts-and-cards', accessToken, clientId, {
    size: '100', skipApplications: 'true', skipExternalCards: 'true', isFullList: 'true'
  })
}

/** Fetch one zero-based shared history page. */
export async function fetchHistoryPage (accessToken: string, clientId: string, fromDate: Date, toDate: Date, page: number): Promise<unknown> {
  return await request('history', accessToken, clientId, {
    fromDate: String(fromDate.getTime()), toDate: String(toDate.getTime()), page: String(page), size: '100'
  })
}

/** Fetch savings accounts and deposit contracts. */
export async function fetchSavings (auth: Auth): Promise<unknown> {
  return await request('savings', auth.accessToken, auth.clientId, { page: '0', size: '500', skipApplications: 'true' })
}

/** Fetch one one-based deposit history page. */
export async function fetchDepositHistory (auth: Auth, id: string, page: number): Promise<unknown> {
  const path = `savings/deposits/transactions/${encodeURIComponent(id)}`
  const params = { depositId: id, page: String(page), size: '100' }
  return await request(path, auth.accessToken, auth.clientId, params)
}

/** Fetch full card or account details. */
export async function fetchProduct (auth: Auth, kind: string, id: string): Promise<unknown> {
  console.assert(kind === 'CARD' || kind === 'ACCOUNT', 'Unsupported MyAmeria product type')
  const category = kind === 'CARD' ? 'cards' : 'accounts'
  const params: RequestParameters = kind === 'CARD' ? { skipApplications: 'true' } : {}
  const path = `accounts-and-cards/${category}/${encodeURIComponent(id)}`
  return await request(path, auth.accessToken, auth.clientId, params)
}

/** Fetch the settled transaction document. */
export async function fetchTransactionDetail (auth: Auth, id: string): Promise<unknown> {
  const response = await request(`transactions/${encodeURIComponent(id)}`, auth.accessToken, auth.clientId, {})
  return get(response, 'transaction')
}

/** Fetch a successful MyAmeria data envelope with sanitized request and response logs. */
async function request (path: string, accessToken: string, clientId: string, params: RequestParameters): Promise<unknown> {
  const query = encodedQuery(params)
  const response = await fetchJson(`${baseUrl}/${path}?${query}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
      Locale: 'hy',
      'Timezone-Offset': '-240',
      Origin: 'https://myameria.am',
      Referer: 'https://myameria.am/'
    },
    sanitizeRequestLog: maskLog,
    sanitizeResponseLog: maskLog
  })
  console.assert(response.status === 200, 'MyAmeria data request failed', { path, status: response.status })
  console.assert(getString({ status: get(response.body, 'status') }, 'status') === 'success', 'MyAmeria response is unsuccessful', { path })
  return get(response.body, 'data')
}

/** Encode query parameters or form fields without modifying their values. */
function encodedQuery (params: RequestParameters): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}
