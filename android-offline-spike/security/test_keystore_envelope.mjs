import crypto from 'crypto';
import fs from 'fs';

console.log('====================================================');
console.log('PHASE 2: ANDROID KEYSTORE AES-256-GCM ENVELOPE ENCRYPTION');
console.log('Testing Hardware Key Wrapping, AEAD Tag & Tamper Safety');
console.log('====================================================\n');

export class KeystoreEnvelope {
  static wrapKey(masterKey, targetKey, aadText = '') {
    const iv = crypto.randomBytes(12); // Standard 96-bit GCM IV
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    if (aadText) cipher.setAAD(Buffer.from(aadText, 'utf8'));
    
    const ciphertext = Buffer.concat([cipher.update(targetKey), cipher.final()]);
    const tag = cipher.getAuthTag(); // 128-bit authentication tag
    
    return {
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: tag.toString('base64'),
      aad: aadText
    };
  }

  static unwrapKey(masterKey, envelope) {
    const iv = Buffer.from(envelope.iv, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(tag);
    if (envelope.aad) decipher.setAAD(Buffer.from(envelope.aad, 'utf8'));
    
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}

// 1. Generate keys
const masterKey = crypto.randomBytes(32); // Simulating 256-bit Android Keystore Master Key
const databaseKey = crypto.randomBytes(32); // Ephemeral SQLite encryption key
const deviceAad = 'device:OPD2415-be48f0a1|app:com.plp.math|schema:2';

console.log('Master Key (256-bit):   [HARDWARE-SECURED / NON-EXPORTABLE]');
console.log('Database Key (256-bit):', databaseKey.toString('hex').slice(0, 16) + '...');
console.log('Bound AAD:             ', deviceAad);

// 2. Wrap Key
const envelope = KeystoreEnvelope.wrapKey(masterKey, databaseKey, deviceAad);
console.log('\nWrapped Envelope:');
console.log('  IV (12 bytes):        ', envelope.iv);
console.log('  Ciphertext (32 bytes):', envelope.ciphertext);
console.log('  Auth Tag (16 bytes):  ', envelope.tag);

// 3. Unwrap Key (Happy Path)
const unwrapped = KeystoreEnvelope.unwrapKey(masterKey, envelope);
const match = Buffer.compare(databaseKey, unwrapped) === 0;
console.log('\nUnwrap Database Key:    ', match ? 'PASS (Exact Match)' : 'FAIL');
if (!match) throw new Error('Unwrapped key does not match original key');

// 4. Tamper Test 1: Bit flip in ciphertext
console.log('\nTesting AEAD Tamper Detection (Ciphertext alteration)...');
const tamperedEnvelope = JSON.parse(JSON.stringify(envelope));
const rawCipher = Buffer.from(tamperedEnvelope.ciphertext, 'base64');
rawCipher[0] ^= 0xFF; // Flip bits
tamperedEnvelope.ciphertext = rawCipher.toString('base64');

let tamperCaught = false;
try {
  KeystoreEnvelope.unwrapKey(masterKey, tamperedEnvelope);
} catch (e) {
  tamperCaught = true;
  console.log('  Caught expected error:', e.message);
}
console.log('Ciphertext Tamper Protection: ', tamperCaught ? 'PASS' : 'FAIL');
if (!tamperCaught) throw new Error('Tampered ciphertext was not rejected!');

// 5. Tamper Test 2: Spoofed AAD (device_id spoofing)
console.log('\nTesting AAD Spoofing Detection (Device ID mismatch)...');
const spoofedEnvelope = JSON.parse(JSON.stringify(envelope));
spoofedEnvelope.aad = 'device:ROGUE-DEVICE-9999|app:com.plp.math|schema:2';

let spoofCaught = false;
try {
  KeystoreEnvelope.unwrapKey(masterKey, spoofedEnvelope);
} catch (e) {
  spoofCaught = true;
  console.log('  Caught expected error:', e.message);
}
console.log('Device AAD Spoof Protection:  ', spoofCaught ? 'PASS' : 'FAIL');
if (!spoofCaught) throw new Error('Spoofed AAD was not rejected!');

console.log('\n====================================================');
console.log('SUMMARY: Android Keystore Envelope Encryption');
console.log('Status: PASS (AES-256-GCM AEAD authenticated and verified)');
console.log('====================================================');

