package app.nexusos.companion

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** One line in the on-device log. It records what happened, never what a notification said. */
data class AuditEntry(val at: Long, val appName: String, val mode: ShareMode, val result: String)

/** Settings and account state, in the app's private storage. Tokens are encrypted with [Vault]. */
class Store(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("nexus", Context.MODE_PRIVATE)

    var host: String?
        get() = prefs.getString("host", null)
        set(value) = prefs.edit().putString("host", value).apply()

    val supabaseUrl: String? get() = prefs.getString("supabaseUrl", null)
    val anonKey: String? get() = prefs.getString("anonKey", null)
    val email: String? get() = prefs.getString("email", null)
    val userId: String? get() = prefs.getString("userId", null)
    val deviceId: String? get() = prefs.getString("deviceId", null)
    val expiresAt: Long get() = prefs.getLong("expiresAt", 0)
    val signedIn: Boolean get() = deviceId != null && prefs.contains("refreshToken")

    val accessToken: String? get() = prefs.getString("accessToken", null)?.let(Vault::open)
    val refreshToken: String? get() = prefs.getString("refreshToken", null)?.let(Vault::open)

    fun saveProject(url: String, key: String) {
        prefs.edit().putString("supabaseUrl", url).putString("anonKey", key).apply()
    }

    fun saveSession(session: Session) {
        prefs.edit()
            .putString("accessToken", Vault.seal(session.accessToken))
            .putString("refreshToken", Vault.seal(session.refreshToken))
            .putLong("expiresAt", session.expiresAt)
            .putString("userId", session.userId)
            .putString("email", session.email)
            .apply()
    }

    fun saveDeviceId(id: String) = prefs.edit().putString("deviceId", id).apply()

    /** Forgets the account on this phone; app choices stay so a new login starts where you left off. */
    fun clearAccount() {
        prefs.edit()
            .remove("accessToken").remove("refreshToken").remove("expiresAt")
            .remove("userId").remove("email").remove("deviceId")
            .remove("devices").remove("devicesAt").remove("recipients")
            .apply()
    }

    /** When the last message from NEXUS arrived on this phone. */
    var receivedAt: Long
        get() = prefs.getLong("receivedAt", 0)
        set(value) = prefs.edit().putLong("receivedAt", value).apply()

    var paused: Boolean
        get() = prefs.getBoolean("paused", false)
        set(value) = prefs.edit().putBoolean("paused", value).apply()

    fun mode(app: String): ShareMode =
        prefs.getString("mode.$app", null)?.let { runCatching { ShareMode.valueOf(it) }.getOrNull() } ?: ShareMode.OFF

    fun setMode(app: String, mode: ShareMode) = prefs.edit().putString("mode.$app", mode.name).apply()

    /** Apps that showed a notification since install, so they can be configured. */
    fun seenApps(): Map<String, String> {
        val json = JSONObject(prefs.getString("seenApps", "{}")!!)
        return json.keys().asSequence().associateWith { json.getString(it) }
    }

    fun noteApp(app: String, appName: String) {
        val json = JSONObject(prefs.getString("seenApps", "{}")!!)
        if (json.optString(app) == appName) return
        json.put(app, appName)
        prefs.edit().putString("seenApps", json.toString()).apply()
    }

    var recipients: Set<String>
        get() = prefs.getStringSet("recipients", emptySet())!!.toSet()
        set(value) = prefs.edit().putStringSet("recipients", value).apply()

    val devicesAt: Long get() = prefs.getLong("devicesAt", 0)

    var devices: List<RemoteDevice>
        get() {
            val rows = JSONArray(prefs.getString("devices", "[]")!!)
            return (0 until rows.length()).map { RemoteDevice.fromJson(rows.getJSONObject(it)) }
        }
        set(value) {
            val rows = JSONArray().apply { value.forEach { put(it.toJson()) } }
            prefs.edit().putString("devices", rows.toString()).putLong("devicesAt", System.currentTimeMillis()).apply()
        }

    fun audit(): List<AuditEntry> {
        val rows = JSONArray(prefs.getString("audit", "[]")!!)
        return (0 until rows.length()).map {
            val o = rows.getJSONObject(it)
            AuditEntry(o.getLong("at"), o.getString("app"), ShareMode.valueOf(o.getString("mode")), o.getString("result"))
        }
    }

    fun addAudit(entry: AuditEntry) {
        val rows = JSONArray().put(
            JSONObject().put("at", entry.at).put("app", entry.appName).put("mode", entry.mode.name).put("result", entry.result),
        )
        audit().take(49).forEach {
            rows.put(JSONObject().put("at", it.at).put("app", it.appName).put("mode", it.mode.name).put("result", it.result))
        }
        prefs.edit().putString("audit", rows.toString()).apply()
    }
}
