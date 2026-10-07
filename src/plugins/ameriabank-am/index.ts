import { Debug } from '../../common/debug'
import { ScrapeFunc } from '../../types/zenmoney'
import { authenticate, collectEvidence } from './api'
import { Preferences } from './models'

export const scrape: ScrapeFunc<Preferences> = async ({ preferences, fromDate, toDate }) => {
  ZenMoney.locale = 'ru'
  console.assert(Debug.isActive, 'This research version requires Bootloader')
  const auth = await authenticate(preferences, ZenMoney.getData('auth'), async auth => {
    ZenMoney.setData('auth', auth)
    ZenMoney.saveData()
  })
  await collectEvidence(auth, fromDate, toDate ?? new Date(), async (name, data) => await Debug.checkpoint(name, data))
  // Never report an empty or guessed financial result as a successful scrape.
  throw new Error('MyAmeria research capture completed. Inspect Bootloader checkpoints; account and transaction conversion requires bank evidence.')
}
