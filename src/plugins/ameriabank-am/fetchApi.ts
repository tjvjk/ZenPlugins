import { fetchJson } from '../../common/network'
import get, { getString } from '../../types/get'
import { Preferences } from './models'

// Research requests follow melontron/ameria-mcp, not yet a verified bank capture.
const baseUrl = 'https://ob.myameria.am/api'
const tokenUrl = 'https://account.myameria.am/auth/realms/ameria/protocol/openid-connect/token'

const secretField = /authorization|cookie|token|secret|password|clientauth|client_auth|session|passport|email|phone|birth|first.?name|last.?name|full.?name|cardnumber|pan$/i

export function maskLog (value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskLog)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, secretField.test(key) ? '<redacted>' : maskLog(item)
    ]))
  }
  return value
}

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
    stringify: (body: Record<string, string>) => Object.entries(body).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&'),
    sanitizeRequestLog: maskLog,
    // Token bodies are credentials; mask the entire body, including malformed text.
    sanitizeResponseLog: (log: unknown) => maskLog({
      url: get(log, 'url'), status: get(log, 'status'), headers: get(log, 'headers'), body: '<redacted>'
    })
  })
  console.assert(response.status === 200, 'MyAmeria token request failed', { status: response.status })
  return response.body
}

export async function fetchAccounts (accessToken: string, clientId: string): Promise<unknown> {
  return await request('accounts-and-cards', accessToken, clientId, {
    size: '8', skipApplications: 'true', specifications: 'SIMPLE', isFullList: 'true'
  })
}

export async function fetchHistoryPage (accessToken: string, clientId: string, fromDate: Date, toDate: Date, page: number): Promise<unknown> {
  return await request('history', accessToken, clientId, {
    fromDate: String(fromDate.getTime()), toDate: String(toDate.getTime()), page: String(page), size: '100'
  })
}

async function request (path: string, accessToken: string, clientId: string, params: Record<string, string>): Promise<unknown> {
  const query = Object.entries(params).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
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
