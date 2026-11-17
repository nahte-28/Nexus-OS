package app.nexusos.companion

import org.json.JSONArray
import org.json.JSONObject

/** A NEXUS notification for this phone, after decryption. Mirrors ConnectPayload in packages/core/src/connect.ts. */
data class IncomingNotification(
    val kind: String,
    val appName: String,
    val title: String,
    val text: String?,
    val postedAt: Long,
    /** Ties it to a notice in the safety net ([SafetyPlan]), so the phone shows it once. */
    val ref: String? = null,
)

/** A notification NEXUS plans to send; the phone shows it itself if NEXUS cannot. */
data class PlannedNotice(val ref: String, val at: Long, val title: String, val text: String?)

/** The Gaming timer as NEXUS sent it with the safety net (PlanPayload.gaming): null when it does not run. */
data class PlanGaming(val game: String, val startedAt: Long)

/** The "gaming" field of a plan: [known] is false when an older NEXUS sent no such field. */
data class PlanGamingField(val known: Boolean, val gaming: PlanGaming?, val sentAt: Long)

/** Today's weather as NEXUS sent it with the safety net (PlanPayload.weather in packages/core/src/connect.ts). */
data class PlanWeather(
    val place: String,
    val temp: Int,
    val min: Int,
    val max: Int,
    val rainChance: Int,
    val label: String,
    val icon: String,
    /** When NEXUS fetched it. */
    val at: Long,
)

/** Text or a link sent with NEXUS Bridge; mirrors BridgePayload in packages/core/src/bridge.ts. */
/** Vandaag in a "plan" payload (PlanToday in packages/core/src/watchToday.ts). */
data class PlanToday(val day: String, val agenda: List<TodayEntry>, val habits: List<TodayHabit>, val goals: List<TodayGoal>)

data class TodayEntry(val at: Long, val end: Long, val title: String)

data class TodayHabit(val id: String, val name: String, val done: Boolean) {
    /** The ref NEXUS ticks it off with (see actionTarget in connect.ts). */
    fun ref(day: String) = "habit:$id@$day"
}

data class TodayGoal(val title: String, val status: String, val line: String)

/** An online darts match against a friend, as NEXUS sent it with the plan (PlanDartsGame in packages/core/src/connect.ts). */
data class PlanDartsGame(
    val id: String,
    val opponent: String,
    val mode: Int,
    val doubleOut: Boolean,
    /** What you still need in this leg, and what the other one still needs. */
    val me: Int,
    val them: Int,
    val myTurn: Boolean,
    /** The number of visits so far; sent back with your visit, so it counts once. */
    val seq: Int,
    /** Legs (or sets) won, yours first, like "1–0". */
    val score: String,
    val line: String,
)

/** A Samen studeren session, as NEXUS sent it with the plan (PlanTogether in packages/core/src/connect.ts). */
data class PlanTogether(
    val id: String,
    val title: String,
    val host: String,
    /** Minutes of a focus block and of a break. */
    val focus: Int,
    val pause: Int,
    val startedAt: Long,
    val joined: Boolean,
    /** The others who are in it now. */
    val members: List<String>,
)

data class BridgeTransfer(
    val transferId: String,
    val content: String,
    /** The address when the content is one web link (http or https) and nothing else. */
    val link: String?,
    val senderName: String,
    val sentAt: Long,
    val expiresAt: Long,
)

/** Pure parsing and framing, kept apart from Android so it can be unit tested. */
object Protocol {
    private const val MAX_TEXT = 1000
    const val TOPIC = "realtime:nexus-inbox"

    /** The decrypted payload as a notification to show, or null when it is not one we understand. */
    fun parsePayload(json: String): IncomingNotification? {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return null
        if (o.optInt("v") != 1) return null
        val kind = o.optString("kind")
        if (kind != "notification" && kind != "test") return null
        val title = o.optString("title").trim().take(MAX_TEXT)
        val text = (if (o.isNull("text")) "" else o.optString("text")).trim().take(MAX_TEXT).ifEmpty { null }
        if (title.isEmpty() && text == null) return null
        return IncomingNotification(
            kind = kind,
            appName = o.optString("appName").trim().ifEmpty { "NEXUS" }.take(80),
            title = title,
            text = text,
            postedAt = o.optLong("postedAt", 0L).takeIf { it > 0 } ?: System.currentTimeMillis(),
            ref = o.optString("ref").trim().take(300).ifEmpty { null },
        )
    }

    /** The safety net from a "plan" payload (PlanPayload in packages/core/src/connect.ts), or null. */
    fun parsePlan(json: String): List<PlannedNotice>? {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return null
        if (o.optInt("v") != 1 || o.optString("kind") != "plan") return null
        val items = o.optJSONArray("items") ?: return null
        return (0 until minOf(items.length(), SafetyPlan.MAX_ITEMS)).mapNotNull { i ->
            val item = items.optJSONObject(i) ?: return@mapNotNull null
            val ref = item.optString("ref").trim().take(300)
            val at = item.optLong("at", 0L)
            val title = item.optString("title").trim().take(MAX_TEXT)
            val text = (if (item.isNull("text")) "" else item.optString("text")).trim().take(MAX_TEXT).ifEmpty { null }
            if (ref.isEmpty() || at <= 0 || title.isEmpty()) null else PlannedNotice(ref, at, title, text)
        }
    }

    /** A Bridge transfer, or null when [json] is not one (see parseBridge in packages/core/src/bridge.ts). */
    fun parseBridge(json: String): BridgeTransfer? {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return null
        if (o.optInt("v") != 1 || o.optString("kind") != "bridge") return null
        val id = o.optString("transferId")
        val content = o.optString("content").take(BRIDGE_MAX_CONTENT)
        val sentAt = o.optLong("sentAt", 0L)
        val expiresAt = o.optLong("expiresAt", 0L)
        if (id.isEmpty() || id.length > 100 || content.isBlank() || sentAt <= 0 || expiresAt <= 0) return null
        return BridgeTransfer(id, content, safeLink(content), o.optString("senderName").take(80), sentAt, expiresAt)
    }

    /** The transfer the sender took back, when [json] is a Bridge cancel. */
    fun parseBridgeCancel(json: String): String? {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return null
        if (o.optInt("v") != 1 || o.optString("kind") != "bridge_status" || o.optString("status") != "cancel") return null
        return o.optString("transferId").takeIf { it.isNotEmpty() && it.length <= 100 }
    }

    /** What this device answers the sender: "delivered", or "declined" with a reason (BridgeStatusPayload). */
    fun bridgeStatus(transferId: String, status: String, reason: String?, at: Long): String =
        JSONObject().put("v", 1).put("kind", "bridge_status").put("transferId", transferId).put("status", status)
            .apply { if (reason != null) put("reason", reason) }
            .put("at", at).toString()

    /** Like safeLink in bridge.ts: only one http or https address, without a user name or password. */
    fun safeLink(text: String): String? {
        val t = text.trim()
        if (t.isEmpty() || t.any { it.isWhitespace() }) return null
        val uri = runCatching { java.net.URI(t) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase()
        if ((scheme != "https" && scheme != "http") || uri.host.isNullOrEmpty() || uri.rawUserInfo != null) return null
        return t
    }

    private const val BRIDGE_MAX_CONTENT = 4000

    /** Only deadlines and habits can be ticked off from another device (see actionTarget in connect.ts). */
    fun canTickOff(ref: String): Boolean = ref.startsWith("deadline:") || Regex("^habit:[^@]+@\\d{4}-\\d{2}-\\d{2}$").matches(ref)

    /** "Ticked off on this device": an ActionPayload in packages/core/src/connect.ts. */
    fun actionPayload(ref: String, at: Long): String =
        JSONObject().put("v", 1).put("kind", "action").put("action", "done").put("ref", ref).put("at", at).toString()

    /** A focus round finished on this device, for the focus log in NEXUS (ActionPayload "focus"). */
    fun focusPayload(minutes: Int, at: Long): String =
        JSONObject().put("v", 1).put("kind", "action").put("action", "focus").put("minutes", minutes).put("task", "").put("at", at).toString()

    /** The Gaming timer started or stopped on this device (ActionPayload "gaming"). */
    fun gamingPayload(start: Boolean, at: Long): String =
        JSONObject().put("v", 1).put("kind", "action").put("action", "gaming").put("op", if (start) "start" else "stop").put("at", at).toString()

    /** The Gaming timer in a "plan" payload, or null when [json] is no plan. */
    fun parsePlanGaming(json: String): PlanGamingField? {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return null
        if (o.optInt("v") != 1 || o.optString("kind") != "plan") return null
        val sentAt = o.optLong("sentAt", 0L)
        if (!o.has("gaming")) return PlanGamingField(false, null, sentAt)
        val g = o.optJSONObject("gaming") ?: return PlanGamingField(true, null, sentAt)
        val startedAt = g.optLong("startedAt", 0L)
        val game = g.optString("game").trim().take(80).ifEmpty { "Gaming" }
        return PlanGamingField(true, if (startedAt > 0) PlanGaming(game, startedAt) else null, sentAt)
    }

    /** The weather in a "plan" payload: null when [json] is no plan or carries no weather. */
    fun parsePlanWeather(json: String): PlanWeather? {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return null
        if (o.optInt("v") != 1 || o.optString("kind") != "plan") return null
        val w = o.optJSONObject("weather") ?: return null
        val place = w.optString("place").trim().take(40)
        val at = w.optLong("at", 0L)
        if (place.isEmpty() || at <= 0 || !w.has("temp")) return null
        fun deg(key: String) = w.optInt(key).coerceIn(-80, 80)
        return PlanWeather(
            place, deg("temp"), deg("min"), deg("max"), w.optInt("rainChance").coerceIn(0, 100),
            w.optString("label").trim().take(40).ifEmpty { "Weer" }, w.optString("icon").take(8), at,
        )
    }

    private val DAY = Regex("^\\d{4}-\\d{2}-\\d{2}$")
    private val GOAL_STATUSES = setOf("reached", "on_track", "behind", "missed", "empty")

    /** Vandaag in a "plan" payload: null when [json] is no plan or carries none. */
    fun parsePlanToday(json: String): PlanToday? {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return null
        if (o.optInt("v") != 1 || o.optString("kind") != "plan") return null
        val t = o.optJSONObject("today") ?: return null
        val day = t.optString("day")
        if (!DAY.matches(day)) return null
        fun objects(key: String, max: Int): List<JSONObject> {
            val a = t.optJSONArray(key) ?: return emptyList()
            return (0 until minOf(a.length(), max)).mapNotNull { a.optJSONObject(it) }
        }
        val agenda = objects("agenda", 12).mapNotNull { e ->
            val title = e.optString("title").trim().take(80)
            val at = e.optLong("at", 0L)
            if (title.isEmpty() || at <= 0) null else TodayEntry(at, maxOf(at, e.optLong("end", at)), title)
        }
        val habits = objects("habits", 12).mapNotNull { h ->
            val id = h.optString("id")
            val name = h.optString("name").trim().take(80)
            if (id.isEmpty() || id.length > 100 || id.contains('@') || name.isEmpty()) null else TodayHabit(id, name, h.optBoolean("done"))
        }
        val goals = objects("goals", 6).mapNotNull { g ->
            val title = g.optString("title").trim().take(80)
            val status = g.optString("status")
            if (title.isEmpty() || status !in GOAL_STATUSES) null else TodayGoal(title, status, g.optString("line").trim().take(80))
        }
        return PlanToday(day, agenda, habits, goals)
    }

    /** Darts online in a "plan" payload: null when [json] is no plan, empty when no match is being played. */
    fun parsePlanDarts(json: String): List<PlanDartsGame>? {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return null
        if (o.optInt("v") != 1 || o.optString("kind") != "plan") return null
        val a = o.optJSONArray("darts") ?: return emptyList()
        return (0 until minOf(a.length(), 5)).mapNotNull { i ->
            val g = a.optJSONObject(i) ?: return@mapNotNull null
            val id = g.optString("id").trim()
            val opponent = g.optString("opponent").trim().take(40)
            val mode = g.optInt("mode")
            val seq = g.optInt("seq", -1)
            if (id.isEmpty() || id.length > 80 || opponent.isEmpty() || mode !in 2..1001 || seq < 0) return@mapNotNull null
            PlanDartsGame(
                id, opponent, mode, g.optBoolean("doubleOut", true),
                g.optInt("me", mode).coerceIn(0, mode), g.optInt("them", mode).coerceIn(0, mode), g.optBoolean("myTurn"), seq,
                g.optString("score").trim().take(20), g.optString("line").trim().take(80),
            )
        }
    }

    /** Your visit in an online match (ActionPayload "darts_online"); [seq] is the number of visits the watch saw. */
    fun dartsOnlinePayload(id: String, seq: Int, score: Int, darts: Int, at: Long): String =
        JSONObject().put("v", 1).put("kind", "action").put("action", "darts_online").put("id", id).put("seq", seq)
            .put("score", score).put("darts", darts.coerceIn(1, 3)).put("at", at).toString()

    /** Samen studeren in a "plan" payload: null when [json] is no plan, empty when no session is open. */
    fun parsePlanTogether(json: String): List<PlanTogether>? {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return null
        if (o.optInt("v") != 1 || o.optString("kind") != "plan") return null
        val a = o.optJSONArray("together") ?: return emptyList()
        return (0 until minOf(a.length(), 5)).mapNotNull { i ->
            val s = a.optJSONObject(i) ?: return@mapNotNull null
            val id = s.optString("id").trim()
            val focus = s.optInt("focus")
            val pause = s.optInt("break")
            val startedAt = s.optLong("startedAt")
            if (id.isEmpty() || id.length > 64 || focus !in 5..90 || pause !in 1..30 || startedAt <= 0) return@mapNotNull null
            val names = s.optJSONArray("members")
            val members = if (names == null) emptyList() else (0 until minOf(names.length(), 8)).mapNotNull { j -> names.optString(j).trim().take(40).ifEmpty { null } }
            PlanTogether(
                id, s.optString("title").trim().take(60).ifEmpty { "Samen studeren" }, s.optString("host").trim().take(40).ifEmpty { "Zonder naam" },
                focus, pause, startedAt, s.optBoolean("joined"), members,
            )
        }
    }

    /** You joined or left a Samen studeren session on the watch (ActionPayload "together"). */
    fun togetherPayload(id: String, join: Boolean, at: Long): String =
        JSONObject().put("v", 1).put("kind", "action").put("action", "together").put("id", id).put("op", if (join) "join" else "leave").put("at", at).toString()

    // Supabase Realtime speaks the Phoenix channel protocol (vsn 1.0.0) over a WebSocket.

    fun socketUrl(supabaseUrl: String, anonKey: String): String =
        supabaseUrl.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://") +
            "/realtime/v1/websocket?apikey=$anonKey&vsn=1.0.0"

    /** Subscribes to new messages for this device; RLS decides what the token may see. */
    fun joinFrame(deviceId: String, accessToken: String, ref: String): String {
        val changes = JSONArray().put(
            JSONObject()
                .put("event", "INSERT")
                .put("schema", "public")
                .put("table", "connect_messages")
                .put("filter", "recipient_device_id=eq.$deviceId"),
        )
        val config = JSONObject()
            .put("broadcast", JSONObject().put("self", false))
            .put("presence", JSONObject().put("key", ""))
            .put("postgres_changes", changes)
            .put("private", false)
        return frame(TOPIC, "phx_join", JSONObject().put("config", config).put("access_token", accessToken), ref, ref)
    }

    fun heartbeatFrame(ref: String): String = frame("phoenix", "heartbeat", JSONObject(), ref)

    fun tokenFrame(accessToken: String, ref: String, joinRef: String): String =
        frame(TOPIC, "access_token", JSONObject().put("access_token", accessToken), ref, joinRef)

    private fun frame(topic: String, event: String, payload: JSONObject, ref: String, joinRef: String? = null): String =
        JSONObject().put("topic", topic).put("event", event).put("payload", payload).put("ref", ref)
            .apply { if (joinRef != null) put("join_ref", joinRef) }
            .toString()

    enum class Signal { JOINED, NEW_MESSAGE, FAILED, OTHER }

    /** What a frame from the server means for the inbox connection. */
    fun classify(text: String, joinRef: String?): Signal {
        val o = runCatching { JSONObject(text) }.getOrNull() ?: return Signal.OTHER
        if (o.optString("topic") != TOPIC) return Signal.OTHER
        val status = o.optJSONObject("payload")?.optString("status").orEmpty()
        return when (o.optString("event")) {
            "postgres_changes" -> Signal.NEW_MESSAGE
            "phx_reply" -> when {
                status == "error" -> Signal.FAILED
                status == "ok" && o.optString("ref") == joinRef -> Signal.JOINED
                else -> Signal.OTHER
            }
            "system" -> if (status == "error") Signal.FAILED else Signal.OTHER
            "phx_error", "phx_close" -> Signal.FAILED
            else -> Signal.OTHER
        }
    }
}
