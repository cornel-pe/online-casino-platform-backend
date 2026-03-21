import { SDKConfig, newSDK } from './api/init_sdk';
import { Client } from './api/client';
import { API_PATHS } from './api/api_paths';
import {
  SDKConfigOptions,
  CreateUserRequest,
  CreateWalletRequest,
  GetWalletAddressesRequest,
  UserWithdrawRequest,
  APIResponse
} from './types';

// Re-export types for external use
export { SDKConfigOptions } from './types';

/**
 * Main CryptoPay SDK class
 */
export class CryptoPaySDK {
  private sdk: any;
  private client: Client;

  constructor(config: SDKConfigOptions) {
    this.sdk = newSDK(new SDKConfig(config));
    this.client = new Client(this.sdk);
  }

  /**
   * Create a new user
   */
  async createUser(OpenId: string): Promise<APIResponse> {
    const request: CreateUserRequest = { OpenId };
    return this.client.post(API_PATHS.PathCreateUser, request);
  }

  /**
   * Create a wallet for a user
   */
  async createWallet(OpenId: string, ChainID: string, TokenID?: string): Promise<APIResponse> {
    const request: CreateWalletRequest = { OpenId, ChainID, TokenID };
    return this.client.post(API_PATHS.PathCreateWallet, request);
  }

  /**
   * Get wallet addresses for a user
   */
  async getWalletAddresses(OpenId: string, ChainIDs?: string): Promise<APIResponse> {
    const request: GetWalletAddressesRequest = { OpenId, ChainIDs };
    return this.client.post(API_PATHS.PathGetWalletAddresses, request);
  }

  /**
   * Process user withdrawal
   */
  async userWithdrawByOpenID(
    OpenId: string,
    TokenId: string,
    Amount: string,
    AddressTo: string,
    SafeCheckCode: string,
    CallBackUrl?: string
  ): Promise<APIResponse> {
    const request: UserWithdrawRequest = {
      OpenId,
      TokenId,
      Amount,
      AddressTo,
      CallBackUrl,
      SafeCheckCode,
    };
    return this.client.post(API_PATHS.PathUserWithdrawByOpenID, request);
  }

  /**
   * Sign client request
   */
  async signClient(reqBody: Record<string, any>): Promise<string> {
    return this.client.signClient(reqBody);
  }
}

// Export types and utilities
export * from './types';
export * from './api/api_paths';
export * from './rsa_utils/rsa_utils';
