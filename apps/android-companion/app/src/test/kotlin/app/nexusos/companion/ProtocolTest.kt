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

    @Test
    fun readsTheWeatherFromAPlan() {
        val w = Protocol.parsePlanWeather("{\"v\":1,\"kind\":\"plan\",\"items\":[],\"sentAt\":50,\"weather\":{\"place\":\"Antwerpen\",\"temp\":12,\"min\":8,\"max\":14,\"rainChance\":70,\"label\":\"Lichte regen\",\"icon\":\"R\",\"at\":40}}")
        assertEquals(PlanWeather("Antwerpen", 12, 8, 14, 70, "Lichte regen", "R", 40), w)
        assertEquals("R 12° · 8° tot 14° · 70% regen", WatchWeather.line(w!!))
        assertNull(Protocol.parsePlanWeather("{\"v\":1,\"kind\":\"plan\",\"items\":[],\"sentAt\":50}"))
        assertNull(Protocol.parsePlanWeather("{\"v\":1,\"kind\":\"plan\",\"items\":[],\"weather\":{\"place\":\"\",\"temp\":1,\"at\":3}}"))
    }

    @Test
    fun readsVandaagFromAPlan() {
        val json = "{\"v\":1,\"kind\":\"plan\",\"items\":[],\"sentAt\":50,\"today\":{\"day\":\"2026-11-17\"," +
            "\"agenda\":[{\"at\":10,\"end\":20,\"title\":\"Elektronica\"},{\"at\":0,\"title\":\"x\"}]," +
            "\"habits\":[{\"id\":\"h1\",\"name\":\"Lezen\",\"done\":false},{\"id\":\"a@b\",\"name\":\"Vals\"},{\"id\":\"h2\",\"name\":\"Sporten\",\"done\":true}]," +
            "\"goals\":[{\"title\":\"14/20 gemiddeld\",\"status\":\"on_track\",\"line\":\"14,2/20\"},{\"title\":\"Raar\",\"status\":\"x\"}]}}"
        val today = Protocol.parsePlanToday(json)!!
        assertEquals(listOf(TodayEntry(10, 20, "Elektronica")), today.agenda)
        assertEquals(listOf(TodayHabit("h1", "Lezen", false), TodayHabit("h2", "Sporten", true)), today.habits)
        assertEquals(listOf(TodayGoal("14/20 gemiddeld", "on_track", "14,2/20")), today.goals)
        assertEquals("habit:h1@2026-11-17", today.habits[0].ref(today.day))
        assertEquals(true, Protocol.canTickOff(today.habits[0].ref(today.day)))
        // A habit ticked off on the watch counts at once; another day shows nothing.
        val ticked = WatchToday.withTicks(today, setOf("habit:h1@2026-11-17"), "2026-11-17")!!
        assertEquals("2 van 2 gewoontes gedaan", WatchToday.habitsLine(ticked))
        assertNull(WatchToday.withTicks(today, emptySet(), "2026-11-18"))
        assertNull(Protocol.parsePlanToday("{\"v\":1,\"kind\":\"plan\",\"items\":[],\"sentAt\":50}"))
        assertNull(Protocol.parsePlanToday("{\"v\":1,\"kind\":\"plan\",\"items\":[],\"today\":{\"day\":\"morgen\"}}"))
    }

    @Test
    fun readsTheGamingTimerFromAPlan() {
        val on = Protocol.parsePlanGaming("{\"v\":1,\"kind\":\"plan\",\"items\":[],\"sentAt\":50,\"gaming\":{\"game\":\"Zelda\",\"startedAt\":40}}")!!
        assertEquals(PlanGamingField(true, PlanGaming("Zelda", 40), 50), on)
        assertEquals(PlanGamingField(true, null, 60), Protocol.parsePlanGaming("{\"v\":1,\"kind\":\"plan\",\"items\":[],\"sentAt\":60,\"gaming\":null}"))
        assertEquals(false, Protocol.parsePlanGaming("{\"v\":1,\"kind\":\"plan\",\"items\":[],\"sentAt\":60}")!!.known)
        assertNull(Protocol.parsePlanGaming("{\"v\":1,\"kind\":\"notification\",\"title\":\"Hoi\"}"))
        val start = org.json.JSONObject(Protocol.gamingPayload(true, 7))
        assertEquals("gaming", start.getString("action"))
        assertEquals("start", start.getString("op"))
        assertEquals("stop", org.json.JSONObject(Protocol.gamingPayload(false, 7)).getString("op"))
    }

    @Test
    fun readsDartsOnlineAndKeepsAVisitOnItsWay() {
        val json = "{\"v\":1,\"kind\":\"plan\",\"items\":[],\"sentAt\":50,\"darts\":[" +
            "{\"id\":\"g1\",\"opponent\":\"Remo\",\"mode\":501,\"doubleOut\":true,\"me\":441,\"them\":501,\"myTurn\":true,\"seq\":2,\"score\":\"0–0\",\"line\":\"Jij gooit, nog 441.\"}," +
            "{\"id\":\"\",\"opponent\":\"Vals\",\"mode\":501,\"seq\":0}]}"
        val games = Protocol.parsePlanDarts(json)!!
        assertEquals(listOf(PlanDartsGame("g1", "Remo", 501, true, 441, 501, true, 2, "0–0", "Jij gooit, nog 441.")), games)
        assertEquals(emptyList<PlanDartsGame>(), Protocol.parsePlanDarts("{\"v\":1,\"kind\":\"plan\",\"items\":[]}"))
        assertNull(Protocol.parsePlanDarts("{\"v\":1,\"kind\":\"notification\",\"title\":\"Hoi\"}"))
        val p = JSONObject(Protocol.dartsOnlinePayload("g1", 2, 60, 5, 70))
        assertEquals("darts_online", p.getString("action"))
        assertEquals(2, p.getInt("seq"))
        assertEquals(3, p.getInt("darts"))
        // A visit stays on its way until the match moves on.
        val g = games[0]
        assertEquals(60, WatchDartsOnline.sentScore(setOf("g1@2=60"), g))
        assertNull(WatchDartsOnline.sentScore(setOf("g1@1=60"), g))
        assertEquals(setOf("g1@2=60"), WatchDartsOnline.stillWaiting(games, setOf("g1@2=60", "g9@0=20")))
        assertEquals(emptySet<String>(), WatchDartsOnline.stillWaiting(listOf(g.copy(seq = 3)), setOf("g1@2=60")))
    }

    @Test
    fun readsSamenStuderenAndCountsTheBlocks() {
        val json = "{\"v\":1,\"kind\":\"plan\",\"items\":[],\"sentAt\":50,\"together\":[" +
            "{\"id\":\"s1\",\"title\":\"Wiskunde\",\"host\":\"Remo\",\"focus\":25,\"break\":5,\"startedAt\":1000,\"joined\":true,\"members\":[\"Remo\",\"\"]}," +
            "{\"id\":\"s2\",\"focus\":200,\"break\":5,\"startedAt\":1000}]}"
        val sessions = Protocol.parsePlanTogether(json)!!
        val s = PlanTogether("s1", "Wiskunde", "Remo", 25, 5, 1000, true, listOf("Remo"))
        assertEquals(listOf(s), sessions)
        assertEquals(emptyList<PlanTogether>(), Protocol.parsePlanTogether("{\"v\":1,\"kind\":\"plan\",\"items\":[]}"))
        assertNull(Protocol.parsePlanTogether("{\"v\":1,\"kind\":\"notification\",\"title\":\"Hoi\"}"))
        val p = JSONObject(Protocol.togetherPayload("s1", false, 70))
        assertEquals("together", p.getString("action"))
        assertEquals("leave", p.getString("op"))
        // 25 minutes focus, 5 minutes break, from the start.
        val min = 60_000L
        assertEquals(TogetherPhase(true, 1, 1000 + 25 * min), WatchTogether.phase(s, 1000 + 10 * min))
        assertEquals(TogetherPhase(false, 1, 1000 + 30 * min), WatchTogether.phase(s, 1000 + 26 * min))
        assertEquals(TogetherPhase(true, 2, 1000 + 55 * min), WatchTogether.phase(s, 1000 + 31 * min))
        // A join stays on its way until NEXUS shows you in the session.
        assertEquals(true, WatchTogether.pending(setOf("s1=join"), s))
        assertNull(WatchTogether.pending(setOf("s9=join"), s))
        assertEquals(emptySet<String>(), WatchTogether.stillWaiting(sessions, setOf("s1=join")))
        assertEquals(setOf("s1=leave"), WatchTogether.stillWaiting(sessions, setOf("s1=leave", "s9=join")))
    }
}
