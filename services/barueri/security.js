import forge from 'node-forge';

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

/**
 * Decodes the base64 digital certificate and extracts private key and certificate PEM.
 * @returns {{ privateKeyPem: string, certPem: string }}
 * @throws {Error} If credentials are not configured or certificate parsing fails.
 */
export function getBarueriKeys() {
  if (!hasBarueriCredentials()) {
    throw new Error(
      'Cannot extract keys: BARUERI_PFX_BASE64 or BARUERI_PFX_PASSPHRASE environment variable is missing.'
    );
  }

  try {
    const pfxBuffer = Buffer.from(process.env.BARUERI_PFX_BASE64, 'base64');
    const asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'), false);
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, process.env.BARUERI_PFX_PASSPHRASE);

    // Get private key from encrypted shrouded key bags or fallback to plain key bags
    let keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    if (!keyBag) {
      keyBag = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
    }
    
    if (!keyBag || !keyBag.key) {
      throw new Error('Falha ao extrair a chave privada do certificado. Verifique as variáveis BARUERI_PFX_BASE64 e BARUERI_PFX_PASSPHRASE.');
    }
    const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);

    if (!privateKeyPem) {
      throw new Error("Falha ao extrair a chave privada do certificado. Verifique as variáveis BARUERI_PFX_BASE64 e BARUERI_PFX_PASSPHRASE.");
    }

    // Get certificate
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    if (!certBag) {
      throw new Error('Certificate not found in PFX bags.');
    }
    const certPem = forge.pki.certificateToPem(certBag.cert);

    return {
      privateKeyPem,
      certPem
    };
  } catch (error) {
    console.error('Failed to parse PKCS12 / PFX certificate:', error.message);
    throw new Error(`Security configuration error: digital certificate parsing failed: ${error.message}`);
  }
}
