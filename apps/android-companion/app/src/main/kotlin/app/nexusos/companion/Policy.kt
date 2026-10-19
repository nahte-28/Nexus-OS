package app.nexusos.companion

/** Per-app choice of what leaves the phone. Every app starts at [OFF]. */
enum class ShareMode(val label: String) {
    OFF("Uit"),
    TITLE("Alleen titel"),
    FULL("Titel en inhoud"),
}

/** A notification as read from Android, before any filtering. */
data class PostedNotification(
    val app: String,
    val appName: String,
    val title: String,
    val text: String?,
    val postedAt: Long,
    /** Android hides the content on the lock screen (VISIBILITY_SECRET). */
    val secret: Boolean = false,
)

object Policy {
    private val sensitiveWords = Regex(
        "\\b(otp|pin|2fa|tan)\\b|code|verificatie|verification|wachtwoord|password|passcode|inlog|login|beveiliging|security",
        RegexOption.IGNORE_CASE,
    )
    private val digitRun = Regex("(?<![0-9])[0-9][0-9 -]{2,10}[0-9](?![0-9])")
    private const val MAX_TEXT = 1000

    /** Masks codes in messages that look like logins or verification, e.g. "Je code is 482913". */
    fun redact(value: String): String {
        if (!sensitiveWords.containsMatchIn(value)) return value
        return digitRun.replace(value) { match ->
            val digits = match.value.count { it.isDigit() }
            if (digits in 4..8) "••••" else match.value
        }
    }

    /**
     * The JSON payload to encrypt, or null when nothing may be shared.
     * Mirrors ConnectPayload in packages/core/src/connect.ts.
     */
    fun payload(n: PostedNotification, mode: ShareMode, kind: String = "notification"): String? {
        if (mode == ShareMode.OFF) return null
        val title = if (n.secret) "Verborgen melding" else redact(n.title.trim()).take(MAX_TEXT)
        val text = n.text?.trim()?.takeIf { it.isNotEmpty() && mode == ShareMode.FULL && !n.secret }
            ?.let { redact(it).take(MAX_TEXT) }
        if (title.isEmpty() && text == null) return null
        val fields = buildList {
            add("\"v\":1")
            add("\"kind\":${json(kind)}")
            add("\"app\":${json(n.app)}")
            add("\"appName\":${json(n.appName)}")
            add("\"title\":${json(title)}")
            if (text != null) add("\"text\":${json(text)}")
            add("\"postedAt\":${n.postedAt}")
        }
        return fields.joinToString(",", "{", "}")
    }

    fun json(value: String): String = buildString {
        append('"')
        for (c in value) {
            when {
                c == '"' -> append("\\\"")
                c == '\\' -> append("\\\\")
                c == '\n' -> append("\\n")
                c == '\r' -> append("\\r")
                c == '\t' -> append("\\t")
                c < ' ' -> append("\\u%04x".format(c.code))
                else -> append(c)
            }
        }
        append('"')
    }
}
