package app.nexusos.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNull
import org.json.JSONObject
import org.junit.Test

class ProtocolTest {
    @Test
    fun readsWhatTheWebAppSends() {
        val n = Protocol.parsePayload(
            "{\"v\":1,\"kind\":\"notification\",\"app\":\"nexus\",\"appName\":\"NEXUS\",\"title\":\"Deadline\",\"text\":\"Verslag inleveren\",\"postedAt\":1760870400000}",
        )!!
        assertEquals(IncomingNotification("notification", "NEXUS", "Deadline", "Verslag inleveren", 1760870400000), n)
        assertNull(Protocol.parsePayload("{\"v\":1,\"kind\":\"test\",\"title\":\"Hoi\"}")!!.text)
        assertEquals("NEXUS", Protocol.parsePayload("{\"v\":1,\"kind\":\"test\",\"title\":\"Hoi\",\"text\":null}")!!.appName)
    }

    @Test
    fun ignoresWhatItDoesNotUnderstand() {
        assertNull(Protocol.parsePayload("geen json"))
        assertNull(Protocol.parsePayload("{\"v\":2,\"kind\":\"notification\",\"title\":\"Later formaat\"}"))
        assertNull(Protocol.parsePayload("{\"v\":1,\"kind\":\"command\",\"title\":\"Iets anders\"}"))
        assertNull(Protocol.parsePayload("{\"v\":1,\"kind\":\"notification\",\"title\":\"  \"}"))
    }

    @Test
    fun joinsOnlyThisDevicesMessages() {
        val frame = JSONObject(Protocol.joinFrame("dev-1", "jwt", "1"))
        assertEquals("realtime:nexus-inbox", frame.getString("topic"))
        assertEquals("phx_join", frame.getString("event"))
        val payload = frame.getJSONObject("payload")
        assertEquals("jwt", payload.getString("access_token"))
        val change = payload.getJSONObject("config").getJSONArray("postgres_changes").getJSONObject(0)
        assertEquals("connect_messages", change.getString("table"))
        assertEquals("recipient_device_id=eq.dev-1", change.getString("filter"))
        assertEquals(
            "wss://abc.supabase.co/realtime/v1/websocket?apikey=key&vsn=1.0.0",
            Protocol.socketUrl("https://abc.supabase.co", "key"),
        )
    }

    @Test
    fun classifiesServerFrames() {
        val topic = Protocol.TOPIC
        assertEquals(Protocol.Signal.JOINED, Protocol.classify("{\"topic\":\"$topic\",\"event\":\"phx_reply\",\"ref\":\"1\",\"payload\":{\"status\":\"ok\"}}", "1"))
        assertEquals(Protocol.Signal.OTHER, Protocol.classify("{\"topic\":\"$topic\",\"event\":\"phx_reply\",\"ref\":\"7\",\"payload\":{\"status\":\"ok\"}}", "1"))
        assertEquals(Protocol.Signal.FAILED, Protocol.classify("{\"topic\":\"$topic\",\"event\":\"phx_reply\",\"ref\":\"1\",\"payload\":{\"status\":\"error\"}}", "1"))
        assertEquals(Protocol.Signal.NEW_MESSAGE, Protocol.classify("{\"topic\":\"$topic\",\"event\":\"postgres_changes\",\"payload\":{}}", "1"))
        assertEquals(Protocol.Signal.FAILED, Protocol.classify("{\"topic\":\"$topic\",\"event\":\"system\",\"payload\":{\"status\":\"error\"}}", "1"))
        assertEquals(Protocol.Signal.OTHER, Protocol.classify("{\"topic\":\"phoenix\",\"event\":\"phx_reply\",\"ref\":\"2\",\"payload\":{\"status\":\"ok\"}}", "1"))
    }

    @Test
    fun ticksOffOnlyDeadlinesAndHabits() {
        assertTrue(Protocol.canTickOff("deadline:d1@100-60"))
        assertTrue(Protocol.canTickOff("habit:h1@2026-11-03"))
        assertFalse(Protocol.canTickOff("reminder:r1@5"))
        assertFalse(Protocol.canTickOff("dagstart:2026-11-03"))
        val action = JSONObject(Protocol.actionPayload("habit:h1@2026-11-03", 7))
        assertEquals("action", action.getString("kind"))
        assertEquals("done", action.getString("action"))
        assertEquals("habit:h1@2026-11-03", action.getString("ref"))
        assertEquals(7L, action.getLong("at"))
        val focus = JSONObject(Protocol.focusPayload(25, 9))
        assertEquals("focus", focus.getString("action"))
        assertEquals(25, focus.getInt("minutes"))
    }

    @Test
    fun readsBridgeTransfers() {
        val link = Protocol.parseBridge(
            "{\"v\":1,\"kind\":\"bridge\",\"transferId\":\"t1\",\"type\":\"link\",\"content\":\"https://ap.be/rooster\",\"senderName\":\"Pc\",\"sentAt\":1000,\"expiresAt\":2000}",
        )!!
        assertEquals(BridgeTransfer("t1", "https://ap.be/rooster", "https://ap.be/rooster", "Pc", 1000, 2000), link)
        // The receiver decides what a link is: a "link" that is no web address stays text.
        assertNull(Protocol.parseBridge("{\"v\":1,\"kind\":\"bridge\",\"transferId\":\"t2\",\"type\":\"link\",\"content\":\"javascript:alert(1)\",\"sentAt\":1,\"expiresAt\":2}")!!.link)
        assertNull(Protocol.parseBridge("{\"v\":1,\"kind\":\"bridge\",\"transferId\":\"t3\",\"content\":\"  \",\"sentAt\":1,\"expiresAt\":2}"))
        assertNull(Protocol.parseBridge("{\"v\":1,\"kind\":\"notification\",\"title\":\"Hoi\"}"))
        assertNull(Protocol.safeLink("https://naam:geheim@ap.be"))
        assertNull(Protocol.safeLink("https://ap.be en meer"))
        assertEquals("t1", Protocol.parseBridgeCancel("{\"v\":1,\"kind\":\"bridge_status\",\"transferId\":\"t1\",\"status\":\"cancel\",\"at\":5}"))
        assertNull(Protocol.parseBridgeCancel("{\"v\":1,\"kind\":\"bridge_status\",\"transferId\":\"t1\",\"status\":\"opened\",\"at\":5}"))
    }

    @Test
    fun answersBridgeLikeTheWebApp() {
        val o = JSONObject(Protocol.bridgeStatus("t1", "declined", "expired", 9))
        assertEquals("bridge_status", o.getString("kind"))
        assertEquals("declined", o.getString("status"))
        assertEquals("expired", o.getString("reason"))
        assertFalse(JSONObject(Protocol.bridgeStatus("t1", "delivered", null, 9)).has("reason"))
    }
}
