import { SDKConfigOptions } from '../types';

/**
 * SDK Configuration class
 */
export class SDKConfig {
  public readonly apiKey: string;
  public readonly apiSecret: string;
  public readonly platformPubKey: string;
  public readonly platformRiskPubKey: string;
  public readonly rsaPrivateKey: string;

  constructor({
    apiKey,
    apiSecret,
    platformPubKey,
    platformRiskPubKey,
    rsaPrivateKey
  }: SDKConfigOptions) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.platformPubKey = platformPubKey;
    this.platformRiskPubKey = platformRiskPubKey;
    this.rsaPrivateKey = rsaPrivateKey;
  }
}

/**
 * SDK class for managing configuration and initialization
 */
export class Sdk {
  public readonly config: SDKConfig;

  constructor(config: SDKConfig) {
    this.config = config;
  }

  /**
   * Initialize the SDK
   */
  async initSDK(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Get API key
   */
  getApiKey(): string {
    return this.config.apiKey;
  }
}

/**
 * Create a new SDK instance
 */
export function newSDK(config: SDKConfig): Sdk {
  return new Sdk(config);
}
