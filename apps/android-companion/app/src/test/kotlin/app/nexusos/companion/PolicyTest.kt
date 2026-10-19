package app.nexusos.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PolicyTest {
    private val message = PostedNotification("com.whatsapp", "WhatsApp", "Sam", "Etentje \"vanavond\"?\nOm 19u", 1760870400000)

    @Test
    fun masksCodesOnlyInLoginLikeMessages() {
        assertEquals("Je verificatiecode is ••••", Policy.redact("Je verificatiecode is 482913"))
        assertEquals("Login code: •••• (geldig 10 min)", Policy.redact("Login code: 482 913 (geldig 10 min)"))
        assertEquals("Afspraak om 1930 in lokaal 2045", Policy.redact("Afspraak om 1930 in lokaal 2045"))
        assertEquals("Bel me op 0470123456 voor de code", Policy.redact("Bel me op 0470123456 voor de code"))
    }

    @Test
    fun sharesOnlyWhatTheModeAllows() {
        assertNull(Policy.payload(message, ShareMode.OFF))
        val title = Policy.payload(message, ShareMode.TITLE)!!
        assertTrue(title.contains("\"title\":\"Sam\""))
        assertTrue(!title.contains("text"))
        assertEquals(
            "{\"v\":1,\"kind\":\"notification\",\"app\":\"com.whatsapp\",\"appName\":\"WhatsApp\",\"title\":\"Sam\"," +
                "\"text\":\"Etentje \\\"vanavond\\\"?\\nOm 19u\",\"postedAt\":1760870400000}",
            Policy.payload(message, ShareMode.FULL),
        )
    }

    @Test
    fun hidesSecretNotifications() {
        val payload = Policy.payload(message.copy(secret = true), ShareMode.FULL)!!
        assertTrue(payload.contains("\"title\":\"Verborgen melding\""))
        assertTrue(!payload.contains("Etentje"))
    }
}
