import * as forge from 'node-forge';
import { ForgePrivateKey, ForgePublicKey, RSAKeyPair } from '../types';

/**
 * Compose parameters into a query string format
 */
export function composeParams(params: Record<string, any>): string {
  const keys = Object.keys(params).filter(k => k !== 'sign').sort();
  return keys.map(k => `${k}=${params[k]}`).join('&');
}

/**
 * Convert object to string map for signing
 */
export function toStringMap(obj: any): Record<string, string> {
  if (Buffer.isBuffer(obj)) {
    obj = obj.toString('utf8');
  }
  
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return {};
    }
  }
  
  const res: Record<string, string> = {};
  
  const walk = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(walk).join('');
    if (typeof value === 'object') {
      return Object.keys(value)
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        .map(k => walk(value[k]))
        .join('');
    }
    return '';
  };
  
  for (const k of Object.keys(obj)) {
    res[k] = walk(obj[k]);
  }
  
  return res;
}

/**
 * Load private key from Base64 string
 */
export function loadPrivateKeyFromBase64(base64Str: string): ForgePrivateKey {
  const der = forge.util.decode64(base64Str);
  const asn1 = forge.asn1.fromDer(der);
  const privateKey = forge.pki.privateKeyFromAsn1(asn1) as ForgePrivateKey;
  return privateKey;
}

/**
 * Sign data with private key
 */
export function signData(privateKey: ForgePrivateKey, data: string): string {
  const md = forge.md.md5.create();
  md.update(data, 'utf8');
  const signature = privateKey.sign(md);
  return forge.util.encode64(signature);
}

/**
 * Parse public key from Base64 string
 */
export function parsePublicKey(pubKeyBase64: string): ForgePublicKey {
  const der = forge.util.decode64(pubKeyBase64);
  const asn1 = forge.asn1.fromDer(der);
  const publicKey = forge.pki.publicKeyFromAsn1(asn1) as ForgePublicKey;
  return publicKey;
}

/**
 * Verify signature with public key
 */
export function verifySignature(publicKey: ForgePublicKey, data: string, signatureBase64: string): void {
  const md = forge.md.md5.create();
  md.update(data, 'utf8');
  const signature = forge.util.decode64(signatureBase64);
  const ok = publicKey.verify(md.digest().bytes(), signature);
  if (!ok) {
    throw new Error('signature verification failed');
  }
}

/**
 * Generate RSA key pair
 */
export function generateRSAKeypair(keySize: number = 2048): RSAKeyPair {
  const keypair = forge.pki.rsa.generateKeyPair(keySize);
  
  // Convert private key to DER format and then to Base64
  const privateKeyDer = forge.asn1.toDer(forge.pki.privateKeyToAsn1(keypair.privateKey));
  const privateKeyBase64 = forge.util.encode64(privateKeyDer.getBytes());
  
  // Convert public key to DER format and then to Base64
  const publicKeyDer = forge.asn1.toDer(forge.pki.publicKeyToAsn1(keypair.publicKey));
  const publicKeyBase64 = forge.util.encode64(publicKeyDer.getBytes());
  
  return {
    privateKey: privateKeyBase64,
    publicKey: publicKeyBase64,
    keySize: keySize
  };
}
