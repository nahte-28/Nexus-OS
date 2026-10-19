package app.nexusos.companion

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

/** This phone's NEXUS Connect key pair. The private key stays in the Android keystore. */
object DeviceKey {
    private const val ALIAS = "nexus-device"

    /** Replaces any previous key and returns the new public key (raw point, base64). */
    fun create(): String {
        delete()
        KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").run {
            initialize(
                KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_AGREE_KEY)
                    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                    .build(),
            )
            generateKeyPair()
        }
        return publicKey()!!
    }

    fun publicKey(): String? {
        val key = keyStore().getCertificate(ALIAS)?.publicKey as? ECPublicKey ?: return null
        return ConnectCrypto.b64(ConnectCrypto.rawPublicKey(key))
    }

    fun privateKey(): PrivateKey? = keyStore().getKey(ALIAS, null) as? PrivateKey

    fun delete() {
        keyStore().run { if (containsAlias(ALIAS)) deleteEntry(ALIAS) }
    }
}

/** Encrypts the login tokens at rest with an AES key that never leaves the keystore. */
object Vault {
    private const val ALIAS = "nexus-tokens"

    private fun key(): SecretKey {
        (keyStore().getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
            )
            generateKey()
        }
    }

    fun seal(plaintext: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        return ConnectCrypto.b64(cipher.iv) + ":" + ConnectCrypto.b64(cipher.doFinal(plaintext.toByteArray()))
    }

    /** Null when the value cannot be decrypted, e.g. after a restore onto another phone. */
    fun open(sealed: String): String? = runCatching {
        val (iv, ciphertext) = sealed.split(":", limit = 2)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, ConnectCrypto.unb64(iv)))
        String(cipher.doFinal(ConnectCrypto.unb64(ciphertext)))
    }.getOrNull()
}
