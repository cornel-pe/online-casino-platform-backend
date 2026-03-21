const { PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const nacl = require('tweetnacl');

/**
 * Validate Solana wallet address
 * @param {string} address - The wallet address to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Verify Solana wallet signature
 * @param {string} message - The original message that was signed
 * @param {string} signature - The signature to verify
 * @param {string} publicKey - The public key (wallet address)
 * @returns {boolean} - True if signature is valid, false otherwise
 */
function verifySolanaSignature(message, signature, publicKey) {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = new PublicKey(publicKey).toBytes();
    
    return nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Generate a random nonce for wallet authentication
 * @returns {string} - A random nonce string
 */
function generateNonce() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Format wallet address for display (shortened version)
 * @param {string} address - The full wallet address
 * @returns {string} - Shortened address (first 4 + last 4 characters)
 */
function formatWalletAddress(address) {
  if (!address || address.length < 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Normalize wallet address (lowercase)
 * @param {string} address - The wallet address to normalize
 * @returns {string} - Normalized address
 */
function normalizeAddress(address) {
  return address.toLowerCase();
}

module.exports = {
  isValidSolanaAddress,
  verifySolanaSignature,
  generateNonce,
  formatWalletAddress,
  normalizeAddress
}; 