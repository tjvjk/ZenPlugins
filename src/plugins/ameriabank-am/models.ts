export interface Preferences {
  refreshToken: string
  clientAuth: string
  clientId: string
}

export interface Auth extends Preferences {
  accessToken: string
  expiresAt: number
}
