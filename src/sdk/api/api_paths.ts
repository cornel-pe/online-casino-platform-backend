/**
 * API endpoints and paths for the CryptoPay SDK
 */
export const API_PATHS = {
  DevNetEndpoint: process.env.CRYPTOPAY_BASE_URL || 'https://vapi.dogpay.ai/sdk',
  PathCreateUser: '/user/create',
  PathCreateWallet: '/wallet/create',
  PathUserWithdrawByOpenID: '/partner/UserWithdrawByOpenID',
  PathGetWalletAddresses: '/wallet/getWalletAddresses',
} as const;

export type APIPath = typeof API_PATHS[keyof typeof API_PATHS];
