package com.plp.math.security

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec

/**
 * Android Keystore Binding for PLP Math Offline Factory (Phase 2)
 *
 * Implements hardware-backed AES-256-GCM key wrapping and storage encryption
 * using Qualcomm Snapdragon 8 Elite KeyMint 3.0 / StrongBox Hardware Security Module.
 */
class AndroidKeyStoreBinding(private val context: Context) {

    companion object {
        private const val ANDROID_KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val MASTER_KEY_ALIAS = "plp_math_offline_master_key"
        private const val GCM_IV_LENGTH_BYTES = 12
        private const val GCM_TAG_LENGTH_BITS = 128
    }

    data class EncryptedEnvelope(
        val iv: ByteArray,
        val ciphertext: ByteArray,
        val isStrongBoxBacked: Boolean
    )

    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE_PROVIDER).apply {
        load(null)
    }

    /**
     * Checks if the hardware supports StrongBox Keymaster/KeyMint
     */
    fun hasStrongBoxSupport(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
        } else {
            false
        }
    }

    /**
     * Generates or retrieves the hardware-backed Master Key in Android Keystore.
     */
    fun getOrCreateMasterKey(): SecretKey {
        if (keyStore.containsAlias(MASTER_KEY_ALIAS)) {
            val entry = keyStore.getEntry(MASTER_KEY_ALIAS, null) as KeyStore.SecretKeyEntry
            return entry.secretKey
        }

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE_PROVIDER
        )

        val builder = KeyGenParameterSpec.Builder(
            MASTER_KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)

        // Attempt StrongBox backing if available; fallback to Qualcomm TEE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && hasStrongBoxSupport()) {
            try {
                builder.setIsStrongBoxBacked(true)
                keyGenerator.init(builder.build())
                return keyGenerator.generateKey()
            } catch (e: Exception) {
                // Fallback to Qualcomm TEE
                builder.setIsStrongBoxBacked(false)
            }
        }

        keyGenerator.init(builder.build())
        return keyGenerator.generateKey()
    }

    /**
     * Verifies if the active master key resides inside Secure Hardware (TEE / StrongBox).
     */
    fun isInsideSecureHardware(): Boolean {
        val key = getOrCreateMasterKey()
        val factory = SecretKeyFactory.getInstance(key.algorithm, ANDROID_KEYSTORE_PROVIDER)
        val keyInfo = factory.getKeySpec(key, KeyInfo::class.java) as KeyInfo
        return keyInfo.isInsideSecureHardware
    }

    /**
     * Wraps an ephemeral 256-bit database encryption key using AES-256-GCM.
     */
    fun wrapDatabaseKey(rawKey: ByteArray, aad: ByteArray? = null): EncryptedEnvelope {
        val masterKey = getOrCreateMasterKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, masterKey)
        if (aad != null && aad.isNotEmpty()) {
            cipher.updateAAD(aad)
        }
        val ciphertext = cipher.doFinal(rawKey)
        val iv = cipher.iv
        return EncryptedEnvelope(
            iv = iv,
            ciphertext = ciphertext,
            isStrongBoxBacked = isInsideSecureHardware()
        )
    }

    /**
     * Unwraps the database encryption key with authentication tag verification.
     */
    fun unwrapDatabaseKey(envelope: EncryptedEnvelope, aad: ByteArray? = null): ByteArray {
        val masterKey = getOrCreateMasterKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(GCM_TAG_LENGTH_BITS, envelope.iv)
        cipher.init(Cipher.DECRYPT_MODE, masterKey, spec)
        if (aad != null && aad.isNotEmpty()) {
            cipher.updateAAD(aad)
        }
        return cipher.doFinal(envelope.ciphertext)
    }
}

