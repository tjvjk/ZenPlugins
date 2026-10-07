import { BankCapture } from '../testModels'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Auth, Preferences } from '../models'
import { convertAccounts, convertTransactions } from '../converters'

jest.mock('../api', () => ({ authenticate: jest.fn(), fetchAccountGraph: jest.fn(), fetchProducts: jest.fn(), fetchTransactions: jest.fn(), fetchExchangeDetails: jest.fn(), fetchDepositTransactions: jest.fn() }))
const api: typeof import('../api') = jest.requireMock('../api')
const { scrape }: typeof import('../index') = jest.requireActual('../index')
const capture: BankCapture = JSON.parse(readFileSync(join(__dirname, './fixtures/capture.json'), 'utf8'))

describe('import entrypoint using the authorized anonymized capture', () => {
  const preferences: Preferences = { login: 'fixture-user', password: 'fixture-password' }
  const args = { preferences, fromDate: new Date('2026-07-01T00:00:00+04:00'), isFirstRun: true, isInBackground: true }
  const auth: Auth = { clientAuth: 'client-auth', clientId: 'client-id', refreshToken: 'rotated', accessToken: 'access', expiresAt: 1 }
  const previousHost = Object.getOwnPropertyDescriptor(global, 'ZenMoney')
  const setData = jest.fn()
  const saveData = jest.fn()
  const isAccountSkipped = jest.fn(() => false)

  beforeEach(() => {
    Object.defineProperty(global, 'ZenMoney', { value: { getData: jest.fn(), setData, saveData, isAccountSkipped, locale: '' }, configurable: true })
    jest.mocked(api.authenticate).mockImplementation(async (_preferences, _stored, persist) => { await persist(auth); return auth })
    jest.mocked(api.fetchAccountGraph).mockResolvedValue(capture.graph)
    jest.mocked(api.fetchProducts).mockResolvedValue(capture.products)
    jest.mocked(api.fetchTransactions).mockImplementation(async () => {
      expect(setData).toHaveBeenCalledWith('auth', auth)
      expect(saveData).toHaveBeenCalled()
      return capture.history
    })
    jest.mocked(api.fetchExchangeDetails).mockResolvedValue(capture.details)
    jest.mocked(api.fetchDepositTransactions).mockResolvedValue(capture.depositHistory)
    setData.mockClear()
    saveData.mockClear()
    isAccountSkipped.mockReturnValue(false)
  })

  afterEach(() => {
    jest.resetAllMocks()
    if (previousHost !== undefined) Object.defineProperty(global, 'ZenMoney', previousHost)
    else Reflect.deleteProperty(global, 'ZenMoney')
  })

  it('returns accounts and history with stable IDs on a repeated import', async () => {
    const accounts = convertAccounts(capture.graph, capture.products).accounts
    const expected = { accounts, transactions: convertTransactions(capture.history, accounts, capture.details, args.fromDate) }
    expect(await scrape(args)).toEqual(expected)
    expect(await scrape({ ...args, isFirstRun: false })).toEqual(expected)
    expect(api.fetchTransactions).toHaveBeenCalledTimes(2)
    expect(api.fetchTransactions).toHaveBeenCalledWith(auth, { source: 'history', deposits: [{ accountId: 'deposit:1010756356', productId: '1010756356' }] }, args.fromDate, expect.any(Date))
    expect(ZenMoney.locale).toBe('ru')
  })

  it('skips a shared history only when all accounts are skipped', async () => {
    isAccountSkipped.mockReturnValue(true)
    expect(await scrape(args)).toEqual({ accounts: convertAccounts(capture.graph, capture.products).accounts, transactions: [] })
    expect(api.fetchTransactions).not.toHaveBeenCalled()
  })

  it('keeps confirmed transfers affecting an included account with mixed skips', async () => {
    isAccountSkipped.mockImplementation((id?: string) => id !== '1570010000000005')
    const result = await scrape(args)
    expect(result.accounts).toHaveLength(11)
    expect(result.transactions.every(t => t.movements.some(m => 'id' in m.account && m.account.id === '1570010000000005'))).toBe(true)
    expect(result.transactions.some(t => t.movements.length === 2)).toBe(true)
    expect(api.fetchTransactions).toHaveBeenCalledTimes(1)
  })

  // Model a network failure, independent of bank error formats.
  it('[model] preserves saved authorization and the original later failure', async () => {
    const failure = new Error('modeled history failure')
    jest.mocked(api.fetchTransactions).mockRejectedValue(failure)
    await expect(scrape(args)).rejects.toBe(failure)
    expect(setData).toHaveBeenCalledWith('auth', auth)
    expect(saveData).toHaveBeenCalledTimes(1)
  })

  // Model two confirmed auth updates followed by a data-loading failure.
  it('[model] persists the latest client discovery update before account loading fails', async () => {
    const failure = new Error('Modeled account loading failure')
    const initial = { ...auth, clientId: '' }
    jest.mocked(api.authenticate).mockImplementation(async (_preferences, _stored, persist) => {
      await persist(initial)
      await persist(auth)
      return auth
    })
    jest.mocked(api.fetchAccountGraph).mockRejectedValue(failure)
    await expect(scrape({ ...args, isInBackground: false })).rejects.toBe(failure)
    expect(setData.mock.calls).toEqual([['auth', initial], ['auth', auth]])
    expect(saveData).toHaveBeenCalledTimes(2)
    expect(api.authenticate).toHaveBeenCalledWith(preferences, undefined, expect.any(Function), false)
  })

  it('[model] preserves prior state without saving after a hot-auth failure', async () => {
    const failure = new Error('Modeled hot authentication failure')
    jest.mocked(api.authenticate).mockRejectedValue(failure)
    await expect(scrape(args)).rejects.toBe(failure)
    expect(setData).not.toHaveBeenCalled()
    expect(saveData).not.toHaveBeenCalled()
    expect(api.fetchAccountGraph).not.toHaveBeenCalled()
  })
})
