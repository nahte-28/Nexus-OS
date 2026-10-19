package app.nexusos.companion

import java.time.Instant
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class ApiException(val status: Int, message: String) : Exception(message)

data class Session(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Long,
    val userId: String,
    val email: String,
)

data class RemoteDevice(
    val id: String,
    val name: String,
    val platform: String,
    val publicKey: String,
    val revoked: Boolean,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("name", name).put("platform", platform)
        .put("public_key", publicKey).put("revoked", revoked)

    companion object {
        fun fromJson(o: JSONObject) = RemoteDevice(
            id = o.getString("id"),
            name = o.getString("name"),
            platform = o.getString("platform"),
            publicKey = o.getString("public_key"),
            revoked = o.optBoolean("revoked") || (o.has("revoked_at") && !o.isNull("revoked_at")),
        )
    }
}

/** The few Supabase Auth and REST calls the companion needs. Blocking: call off the main thread. */
class Supabase(private val url: String, private val anonKey: String) {

    companion object {
        private val JSON = "application/json".toMediaType()
        private val http = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

        /** "nexus-os.vercel.app/" or "https://nexus-os.vercel.app" -> "https://nexus-os.vercel.app". */
        fun normalizeHost(input: String): String {
            val trimmed = input.trim().trimEnd('/')
            return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "https://$trimmed"
        }

        /** Same cleanup as the web app: the dashboard URL may end in /rest/v1/. */
        fun normalizeUrl(input: String): String =
            input.trim().trim('"', '\'').trimEnd('/').removeSuffix("/rest/v1").removeSuffix("/auth/v1")

        /** Reads the public project settings that the NEXUS web app publishes. */
        fun fetchConfig(host: String): Pair<String, String> {
            val request = Request.Builder().url("${normalizeHost(host)}/nexus-config.json").get().build()
            http.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful || !body.trimStart().startsWith("{")) {
                    throw ApiException(response.code, "Geen NEXUS gevonden op dit adres. Controleer het adres van je NEXUS-webapp.")
                }
                val json = JSONObject(body)
                return normalizeUrl(json.getString("supabaseUrl")) to json.getString("anonKey").trim()
            }
        }
    }

    fun signIn(email: String, password: String): Session =
        session(request("POST", "/auth/v1/token?grant_type=password", null, JSONObject().put("email", email).put("password", password).toString()))

    fun refresh(refreshToken: String): Session =
        session(request("POST", "/auth/v1/token?grant_type=refresh_token", null, JSONObject().put("refresh_token", refreshToken).toString()))

    private fun session(body: String): Session {
        val json = JSONObject(body)
        val user = json.getJSONObject("user")
        return Session(
            accessToken = json.getString("access_token"),
            refreshToken = json.getString("refresh_token"),
            expiresAt = System.currentTimeMillis() + json.getLong("expires_in") * 1000,
            userId = user.getString("id"),
            email = user.optString("email"),
        )
    }

    fun listDevices(token: String): List<RemoteDevice> {
        val body = request("GET", "/rest/v1/devices?select=id,name,platform,public_key,revoked_at&order=created_at", token)
        val rows = JSONArray(body)
        return (0 until rows.length()).map { RemoteDevice.fromJson(rows.getJSONObject(it)) }
    }

    fun registerDevice(token: String, id: String, name: String, publicKey: String) {
        val row = JSONObject().put("id", id).put("name", name).put("platform", "android").put("public_key", publicKey)
        request("POST", "/rest/v1/devices", token, row.toString())
    }

    fun touchDevice(token: String, id: String) {
        request("PATCH", "/rest/v1/devices?id=eq.$id", token, JSONObject().put("last_seen_at", Instant.now().toString()).toString())
    }

    fun revokeDevice(token: String, id: String) {
        request("PATCH", "/rest/v1/devices?id=eq.$id", token, JSONObject().put("revoked_at", Instant.now().toString()).toString())
    }

    fun sendMessages(token: String, rows: JSONArray) {
        request("POST", "/rest/v1/connect_messages", token, rows.toString())
    }

    private fun request(method: String, path: String, token: String?, body: String? = null): String {
        val builder = Request.Builder()
            .url(url + path)
            .header("apikey", anonKey)
            .header("Authorization", "Bearer ${token ?: anonKey}")
            .header("Prefer", "return=minimal")
            .method(method, body?.toRequestBody(JSON))
        http.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw ApiException(response.code, errorText(response.code, text))
            return text
        }
    }

    private fun errorText(status: Int, body: String): String {
        val raw = runCatching {
            val json = JSONObject(body)
            json.optString("error_description").ifEmpty { json.optString("msg") }.ifEmpty { json.optString("message") }
        }.getOrDefault("")
        return when {
            raw.contains("Invalid login credentials", ignoreCase = true) -> "E-mailadres of wachtwoord klopt niet."
            raw.contains("Email not confirmed", ignoreCase = true) -> "Bevestig eerst je e-mailadres via de mail die je kreeg."
            raw.contains("does not exist") || raw.contains("Could not find the table") ->
                "De database mist de tabellen voor apparaten. Voer de v0.4-migratie uit in Supabase."
            raw.isNotEmpty() -> raw
            else -> "Serverfout ($status)."
        }
    }
}
