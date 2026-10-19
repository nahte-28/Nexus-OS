package app.nexusos.companion

import java.math.BigInteger
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import java.security.SecureRandom
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * End-to-end encryption for NEXUS Connect ("nexus-connect-v1"), byte-for-byte the same as
 * packages/core/src/connectCrypto.ts on the web:
 *   ECDH P-256 with an ephemeral key, HKDF-SHA256 (salt = ephemeral public || recipient public,
 *   info = "nexus-connect-v1"), AES-256-GCM with the recipient device id as associated data.
 */
object ConnectCrypto {
    const val INFO = "nexus-connect-v1"

    data class Envelope(val ephemeralKey: String, val iv: String, val ciphertext: String)

    private val random = SecureRandom()

    private val p256: ECParameterSpec by lazy { (newKeyPair().public as ECPublicKey).params }

    private fun newKeyPair() = KeyPairGenerator.getInstance("EC").run {
        initialize(ECGenParameterSpec("secp256r1"), random)
        generateKeyPair()
    }

    fun b64(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)

    fun unb64(value: String): ByteArray = Base64.getDecoder().decode(value)

    /** Uncompressed point: 0x04 || x || y, 32 bytes each. */
    fun rawPublicKey(key: ECPublicKey): ByteArray {
        val out = ByteArray(65)
        out[0] = 4
        fixed32(key.w.affineX).copyInto(out, 1)
        fixed32(key.w.affineY).copyInto(out, 33)
        return out
    }

    private fun fixed32(n: BigInteger): ByteArray {
        val bytes = n.toByteArray()
        return when {
            bytes.size == 32 -> bytes
            bytes.size > 32 -> bytes.copyOfRange(bytes.size - 32, bytes.size)
            else -> ByteArray(32 - bytes.size) + bytes
        }
    }

    fun publicKeyFromRaw(raw: ByteArray): PublicKey {
        require(raw.size == 65 && raw[0] == 4.toByte()) { "Ongeldige publieke sleutel" }
        val point = ECPoint(BigInteger(1, raw.copyOfRange(1, 33)), BigInteger(1, raw.copyOfRange(33, 65)))
        return KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(point, p256))
    }

    /** RFC 5869 with SHA-256, for one 32-byte output block. */
    fun hkdf(secret: ByteArray, salt: ByteArray, info: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(salt, "HmacSHA256"))
        val prk = mac.doFinal(secret)
        mac.init(SecretKeySpec(prk, "HmacSHA256"))
        mac.update(info)
        mac.update(1.toByte())
        return mac.doFinal()
    }

    private fun messageKey(privateKey: PrivateKey, peer: PublicKey, salt: ByteArray, provider: String?): SecretKeySpec {
        val agreement = if (provider == null) KeyAgreement.getInstance("ECDH") else KeyAgreement.getInstance("ECDH", provider)
        agreement.init(privateKey)
        agreement.doPhase(peer, true)
        return SecretKeySpec(hkdf(agreement.generateSecret(), salt, INFO.toByteArray()), "AES")
    }

    fun encryptFor(recipientPublicKey: String, recipientDeviceId: String, plaintext: String): Envelope {
        val recipientRaw = unb64(recipientPublicKey)
        val recipient = publicKeyFromRaw(recipientRaw)
        val ephemeral = newKeyPair()
        val ephemeralRaw = rawPublicKey(ephemeral.public as ECPublicKey)
        val key = messageKey(ephemeral.private, recipient, ephemeralRaw + recipientRaw, null)
        val iv = ByteArray(12).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, iv))
        cipher.updateAAD(recipientDeviceId.toByteArray())
        val ciphertext = cipher.doFinal(plaintext.toByteArray())
        return Envelope(b64(ephemeralRaw), b64(iv), b64(ciphertext))
    }

    /** [provider] is "AndroidKeyStore" when [privateKey] lives in the hardware-backed keystore. */
    fun decryptWith(
        privateKey: PrivateKey,
        ownPublicKey: String,
        ownDeviceId: String,
        envelope: Envelope,
        provider: String? = null,
    ): String {
        val ephemeralRaw = unb64(envelope.ephemeralKey)
        val key = messageKey(privateKey, publicKeyFromRaw(ephemeralRaw), ephemeralRaw + unb64(ownPublicKey), provider)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, unb64(envelope.iv)))
        cipher.updateAAD(ownDeviceId.toByteArray())
        return String(cipher.doFinal(unb64(envelope.ciphertext)))
    }

    /** First 6 bytes of SHA-256 over the raw public key, e.g. "4F2A-91C3-07BE"; same as on the web. */
    fun fingerprint(publicKey: String): String {
        val hex = MessageDigest.getInstance("SHA-256").digest(unb64(publicKey))
            .take(6).joinToString("") { "%02X".format(it) }
        return "${hex.substring(0, 4)}-${hex.substring(4, 8)}-${hex.substring(8, 12)}"
    }
}
