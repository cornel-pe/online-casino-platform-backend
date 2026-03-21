import * as crypto from 'crypto';
import { composeParams, toStringMap, loadPrivateKeyFromBase64, signData } from '../rsa_utils/rsa_utils';
import { SignPackResult } from '../types';

/**
 * Signer class for creating signed requests
 */
export class Signer {
  private sdk: any;

  constructor(sdk: any) {
    this.sdk = sdk;
  }

  /**
   * Generate MD5 signature
   */
  private generateMD5Sign(dataStr: string, timestamp: string): string {
    const raw = this.sdk.config.apiSecret + dataStr + timestamp;
    return crypto.createHash('md5').update(raw, 'utf8').digest('hex');
  }

  /**
   * Sign request object and return signed pack
   */
  async signPack(reqObj: Record<string, any>): Promise<SignPackResult> {
    // Convert all values to strings
    const mapData: Record<string, string> = {};
    for (const [k, v] of Object.entries(reqObj)) {
      mapData[k] = String(v ?? '');
    }

    // Generate MD5 signature
    const dataStr = composeParams(mapData);
    const timestamp = String(Date.now());
    const sign = this.generateMD5Sign(dataStr, timestamp);

    // Generate RSA signature
    const jStr = JSON.stringify(reqObj);
    const reqMapObj = toStringMap(jStr);

    const privateKey = loadPrivateKeyFromBase64(this.sdk.config.rsaPrivateKey);
    const rawStr = composeParams(reqMapObj);
    const clientSign = signData(privateKey, rawStr);

    return {
      body: jStr,
      timestamp,
      sign,
      clientSign
    };
  }
}
