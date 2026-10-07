import { Account } from '../../types/zenmoney'

/** Credentials supplied by the MyAmeria browser session. */
export interface Preferences {
  readonly refreshToken: string
  readonly clientAuth: string
  readonly clientId: string
}

/** Rotated credentials persisted immediately after authentication. */
export interface Auth extends Preferences {
  readonly accessToken: string
  readonly expiresAt: number
}

/** Deposit identity linking the account to its history endpoint. */
export interface DepositSource {
  readonly accountId: string
  readonly productId: string
}

/** Shared history and deposit sources required by the account graph. */
export interface HistoryPlan {
  readonly source: 'history'
  readonly deposits: readonly DepositSource[]
}

/** Converted accounts and their complete history loading plan. */
export interface AccountPlan {
  readonly accounts: Account[]
  readonly fetchParams: HistoryPlan
}

/** Persist newly rotated credentials before any further bank request. */
export type PersistAuth = (auth: Auth) => Promise<void>

/** Validated direction of a settled bank operation. */
export type FlowDirection = 'EXPENSE' | 'INCOME'

/** Exchange documents indexed by bank transaction ID; documents remain untrusted. */
export type ExchangeDetails = Readonly<Record<string, unknown>>

/** Encodable query or form fields passed to the transport layer. */
export type RequestParameters = Readonly<Record<string, string>>

/** Account graph assembled from validated arrays of untrusted bank records. */
export interface AccountGraph {
  readonly accountsAndCards: readonly unknown[]
  readonly savings: readonly unknown[]
}
