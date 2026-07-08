/**
 * Barueri digital certificate (.pfx) security utility.
 * Loads and parses certificate data from in-memory environment variables.
 * Ensures the actual certificate file is never checked into Git.
 */

/**
 * Verifies if all necessary digital certificate variables are defined in the environment.
 * @returns {boolean} True if both base64 credentials and passphrase are set.
 */
export function hasBarueriCredentials() {
  return !!(process.env.BARUERI_PFX_BASE64 && process.env.BARUERI_PFX_PASSPHRASE);
}

/**
 * Returns configuration properties for Node.js https.Agent binding.
 * Decodes the base64 digital certificate string back into a raw Buffer in-memory.
 * @returns {{ pfx: Buffer, passphrase: string, rejectUnauthorized: boolean }}
 * @throws {Error} If credentials are not configured or are invalid.
 */
export function getBarueriHttpsAgentConfig() {
  if (!hasBarueriCredentials()) {
    throw new Error(
      'Cannot construct https Agent config: BARUERI_PFX_BASE64 or BARUERI_PFX_PASSPHRASE environment variable is missing.'
    );
  }

  try {
    const pfxBuffer = Buffer.from(process.env.BARUERI_PFX_BASE64, 'base64');
    
    // Safety check: ensure we generated a non-empty buffer
    if (pfxBuffer.length === 0) {
      throw new Error('Decoded PFX certificate buffer is empty.');
    }

    return {
      pfx: pfxBuffer,
      passphrase: process.env.BARUERI_PFX_PASSPHRASE,
      rejectUnauthorized: false // Required to bypass SSL handshake errors with Brazilian municipal intermediate certs
    };
  } catch (error) {
    console.error('Failed to decode A1 Digital Certificate (.pfx) from Base64:', error.message);
    throw new Error(`Security configuration error: digital certificate decryption failed.`);
  }
}
