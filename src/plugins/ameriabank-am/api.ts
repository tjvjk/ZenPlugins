import { InvalidPreferencesError } from '../../errors'
import get, { getArray, getBoolean, getNumber, getString } from '../../types/get'
import * as transport from './fetchApi'
import { Auth, Preferences } from './models'

export async function authenticate (preferences: Preferences, stored: unknown, persist: (auth: Auth) => Promise<void>): Promise<Auth> {
  // A working rotated token wins over the original token still in preferences.
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
  const auth = { ...credentials, accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 }
  await persist(auth)
  return auth
}

export async function collectEvidence (auth: Auth, fromDate: Date, toDate: Date, checkpoint: (name: string, data: unknown) => Promise<void>): Promise<void> {
  console.assert(Number.isFinite(fromDate.getTime()) && Number.isFinite(toDate.getTime()) && fromDate <= toDate, 'Invalid research interval')
  const accounts = await transport.fetchAccounts(auth.accessToken, auth.clientId)
  await checkpoint('myameria-accounts', transport.maskLog(accounts))
  getArray({ value: get(accounts, 'accountsAndCards') }, 'value')
  for (let page = 1; page <= 1000; page++) {
    const history = await transport.fetchHistoryPage(auth.accessToken, auth.clientId, fromDate, toDate, page)
    await checkpoint(`myameria-history-${page}`, transport.maskLog(history))
    getArray({ value: get(history, 'transactions') }, 'value')
    const hasNext = getBoolean({ value: get(history, 'hasNext') }, 'value')
    if (!hasNext) return
  }
  throw new Error('MyAmeria history pagination limit exceeded')
}
