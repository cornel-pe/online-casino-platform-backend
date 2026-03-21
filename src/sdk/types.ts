// SDK Configuration Types
export interface SDKConfigOptions {
  apiKey: string;
  apiSecret: string;
  platformPubKey: string;
  platformRiskPubKey: string;
  rsaPrivateKey: string;
}

// API Response Types
export interface APIResponse<T = any> {
  data: T;
  headers: Record<string, any>;
}

// Request Body Types
export interface CreateUserRequest {
  OpenId: string;
}

export interface CreateWalletRequest {
  OpenId: string;
  ChainID: string;
  TokenID?: string;
}

export interface GetWalletAddressesRequest {
  OpenId: string;
  ChainIDs?: string;
}

export interface UserWithdrawRequest {
  OpenId: string;
  TokenId: string;
  Amount: string;
  AddressTo: string;
  CallBackUrl?: string;
  SafeCheckCode: string;
}

// Sign Pack Types
export interface SignPackResult {
  body: string;
  timestamp: string;
  sign: string;
  clientSign: string;
}

// RSA Key Pair Types
export interface RSAKeyPair {
  privateKey: string;
  publicKey: string;
  keySize: number;
}

// Forge Types (from node-forge)
export interface ForgePrivateKey {
  sign(md: any): string;
}

export interface ForgePublicKey {
  verify(digest: string, signature: string): boolean;
}

// Client Headers
export interface ClientHeaders {
  key: string;
  timestamp: string;
  sign: string;
  clientSign: string;
}
