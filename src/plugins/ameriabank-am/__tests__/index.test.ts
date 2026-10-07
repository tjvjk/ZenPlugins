import { Auth } from '../models'

jest.mock('../api', () => ({ authenticate: jest.fn(), collectEvidence: jest.fn() }))
const api: typeof import('../api') = jest.requireMock('../api')
const { scrape }: typeof import('../index') = jest.requireActual('../index')

// Model the host lifecycle independently of bank payloads.
describe('[model] research entrypoint', () => {
  const preferences = { refreshToken: 'seed', clientAuth: 'client-auth', clientId: 'client-id' }
  const args = { preferences, fromDate: new Date('2026-10-01'), toDate: new Date('2026-10-02'), isFirstRun: true, isInBackground: true }
  const auth: Auth = { ...preferences, refreshToken: 'rotated', accessToken: 'access', expiresAt: 1 }
  const previousHost = Object.getOwnPropertyDescriptor(global, 'ZenMoney')
  const previousBootloader = Object.getOwnPropertyDescriptor(global, 'bootloader')

  afterEach(() => {
    jest.clearAllMocks()
    for (const [key, previous] of [['ZenMoney', previousHost], ['bootloader', previousBootloader]] as const) {
      if (previous !== undefined) Object.defineProperty(global, key, previous)
      else Reflect.deleteProperty(global, key)
    }
  })

  it('saves authorization before capture and never reports successful empty data', async () => {
    const getData = jest.fn(() => undefined)
    const setData = jest.fn()
    const saveData = jest.fn()
    const host = { getData, setData, saveData, locale: '' }
    Object.defineProperty(global, 'ZenMoney', { value: host, configurable: true })
    Object.defineProperty(global, 'bootloader', { value: { isActive: true, checkpoint: jest.fn(async () => {}) }, configurable: true })
    jest.mocked(api.authenticate).mockImplementation(async (_preferences, _stored, persist) => {
      await persist(auth)
      return auth
    })
    jest.mocked(api.collectEvidence).mockImplementation(async () => {
      expect(setData).toHaveBeenCalledWith('auth', auth)
      expect(saveData).toHaveBeenCalledTimes(1)
    })
    await expect(scrape(args)).rejects.toThrow('MyAmeria research capture completed')
    expect(host.locale).toBe('ru')
  })

  it('rejects outside Bootloader before making bank requests', async () => {
    Object.defineProperty(global, 'ZenMoney', { value: { locale: '' }, configurable: true })
    Object.defineProperty(global, 'bootloader', { value: undefined, configurable: true })
    const authenticate = jest.mocked(api.authenticate)
    await expect(scrape(args)).rejects.toThrow('requires Bootloader')
    expect(authenticate).not.toHaveBeenCalled()
  })
})
