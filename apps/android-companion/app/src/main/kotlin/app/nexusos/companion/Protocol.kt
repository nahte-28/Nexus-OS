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

/** Text or a link sent with NEXUS Bridge; mirrors BridgePayload in packages/core/src/bridge.ts. */
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
