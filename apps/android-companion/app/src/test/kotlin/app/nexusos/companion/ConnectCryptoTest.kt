package app.nexusos.companion

import java.security.KeyFactory
import java.security.spec.PKCS8EncodedKeySpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

/** Uses the vectors from packages/core/src/fixtures/connect-vectors.json, made with the web code. */
class ConnectCryptoTest {
    private val vectors = javaClass.getResource("/connect-vectors.json")!!.readText()

    private fun field(section: String, name: String): String {
        val block = Regex("\"$section\": \\{(.*?)\\n  \\}", RegexOption.DOT_MATCHES_ALL).find(vectors)!!.groupValues[1]
        val raw = Regex("\"$name\": \"((?:[^\"\\\\]|\\\\.)*)\"").find(block)!!.groupValues[1]
        return raw.replace("\\\"", "\"").replace("\\\\", "\\")
    }

    private val deviceId = field("recipient", "deviceId")
    private val publicKey = field("recipient", "publicKey")
    private val privateKey = KeyFactory.getInstance("EC")
        .generatePrivate(PKCS8EncodedKeySpec(ConnectCrypto.unb64(field("recipient", "privateKeyPkcs8"))))

    @Test
    fun decryptsWhatTheWebEncrypted() {
        val envelope = ConnectCrypto.Envelope(field("fromWeb", "ephemeralKey"), field("fromWeb", "iv"), field("fromWeb", "ciphertext"))
        assertEquals(field("fromWeb", "plaintext"), ConnectCrypto.decryptWith(privateKey, publicKey, deviceId, envelope))
    }

    @Test
    fun roundTripsAndBindsToTheRecipient() {
        val envelope = ConnectCrypto.encryptFor(publicKey, deviceId, "Hallo pc 👋")
        assertFalse(envelope.ciphertext.contains("Hallo"))
        assertEquals("Hallo pc 👋", ConnectCrypto.decryptWith(privateKey, publicKey, deviceId, envelope))
        assertThrows(Exception::class.java) { ConnectCrypto.decryptWith(privateKey, publicKey, "ander-apparaat", envelope) }
    }

    @Test
    fun fingerprintMatchesTheWeb() {
        assertEquals(field("recipient", "fingerprint"), ConnectCrypto.fingerprint(publicKey))
    }
}
