import fetchMock from 'fetch-mock'
import { authenticate, collectEvidence } from '../api'
import { fetchAccounts, refreshToken } from '../fetchApi'
import { Auth } from '../models'

const preferences = { refreshToken: 'refresh-secret', clientAuth: 'basic-secret', clientId: 'client-id' }
const auth: Auth = { ...preferences, accessToken: 'access-secret', expiresAt: 1 }

// Synthetic protocol-shaped data models orchestration and secret handling only.
// It is not bank evidence and does not verify financial interpretation.
describe('[model] MyAmeria research transport', () => {
  afterEach(() => {
    fetchMock.restore()
    jest.restoreAllMocks()
  })

  it('masks actual token request/response logs and encodes credentials', async () => {
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => {})
    fetchMock.post('https://account.myameria.am/auth/realms/ameria/protocol/openid-connect/token', {
      access_token: 'access-secret', refresh_token: 'rotated-secret', expires_in: 300
    })
    await refreshToken(preferences)
    expect(fetchMock.lastOptions()?.body).toBe('grant_type=refresh_token&refresh_token=refresh-secret')
    const logs = JSON.stringify(debug.mock.calls)
    for (const secret of ['refresh-secret', 'basic-secret', 'access-secret', 'rotated-secret']) {
      expect(logs).not.toContain(secret)
    }
    expect(logs).toContain('200')
    expect(logs).toContain('redacted')
  })

  it('retains diagnostic payloads while masking nested personal fields and headers', async () => {
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => {})
    fetchMock.get(/accounts-and-cards/, {
      body: { status: 'success', data: { accountsAndCards: [{ id: 'product-42', balance: 123, email: 'private-email', nested: [{ accessToken: 'nested-secret' }] }] } }
    })
    await fetchAccounts('access-secret', 'client-id')
    const logs = JSON.stringify(debug.mock.calls)
    for (const secret of ['access-secret', 'private-email', 'nested-secret']) expect(logs).not.toContain(secret)
    expect(logs).toContain('product-42')
    expect(logs).toContain('123')
  })

  it('persists a rotated token before a later data request fails', async () => {
    fetchMock.post(/openid-connect\/token/, { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 300 })
    const failure = new Error('modeled transport failure')
    fetchMock.get(/accounts-and-cards/, { throws: failure })
    const persist = jest.fn(async () => {})
    const result = await authenticate(preferences, auth, persist)
    expect(persist).toHaveBeenCalledWith(result)
    expect(result.refreshToken).toBe('new-refresh')
    await expect(collectEvidence(result, new Date('2026-10-01'), new Date('2026-10-02'), jest.fn())).rejects.toBe(failure)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('keeps original unknown authentication errors and does not persist', async () => {
    const failure = new Error('modeled authentication transport failure')
    fetchMock.post(/openid-connect\/token/, { throws: failure })
    const persist = jest.fn(async () => {})
    await expect(authenticate(preferences, auth, persist)).rejects.toBe(failure)
    expect(persist).not.toHaveBeenCalled()
  })

  it('consumes each history page once and terminates using hasNext', async () => {
    fetchMock.get(/accounts-and-cards/, { body: { status: 'success', data: { accountsAndCards: [] } } })
    fetchMock.get(/history\?.*page=1&/, { body: { status: 'success', data: { transactions: [], hasNext: true } } })
    fetchMock.get(/history\?.*page=2&/, { body: { status: 'success', data: { transactions: [], hasNext: false } } })
    const checkpoint = jest.fn(async (_name: string, _data: unknown) => {})
    await collectEvidence(auth, new Date('2026-10-01'), new Date('2026-10-02'), checkpoint)
    expect(checkpoint.mock.calls.map(call => call[0])).toEqual(['myameria-accounts', 'myameria-history-1', 'myameria-history-2'])
    expect(fetchMock.calls(/history\?.*page=1&/)).toHaveLength(1)
    expect(fetchMock.calls(/history\?.*page=2&/)).toHaveLength(1)
  })
})
