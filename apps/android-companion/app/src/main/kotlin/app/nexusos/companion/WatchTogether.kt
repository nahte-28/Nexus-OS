package app.nexusos.companion

import android.content.Context

/** Where a Samen studeren session is: focus or break, which block, and when it ends. */
data class TogetherPhase(val focus: Boolean, val round: Int, val endsAt: Long)

/**
 * Samen studeren on the watch: the open sessions that NEXUS sent with the plan, and whether you
 * joined or left one here that NEXUS did not show back yet. Every device counts the same blocks
 * from the start time, so the watch needs no ticks from NEXUS.
 */
object WatchTogether {
    private const val PREFS = "together"
    /** NEXUS shows no session older than this; neither does the watch. */
    const val MAX_AGE_MS = 12 * 60 * 60_000L

    /** Keeps the sessions from a plan; a plan without them (none open) clears the old ones. */
    fun save(context: Context, json: String) {
        val sessions = Protocol.parsePlanTogether(json) ?: return
        val p = prefs(context)
        p.edit()
            .putString("plan", json)
            .putStringSet("sent", stillWaiting(sessions, p.getStringSet("sent", emptySet()).orEmpty()))
            .apply()
    }

    /** The open sessions, the one you are in first. */
    fun load(context: Context, now: Long = System.currentTimeMillis()): List<PlanTogether> =
        prefs(context).getString("plan", null)?.let(Protocol::parsePlanTogether).orEmpty().filter { now - it.startedAt < MAX_AGE_MS }

    /** True when you sent "join" for [session], false for "leave", null when nothing is on its way. */
    fun pending(context: Context, session: PlanTogether): Boolean? =
        pending(prefs(context).getStringSet("sent", emptySet()).orEmpty(), session)

    /** Remembers that NEXUS got your join or leave for [session]. */
    fun sent(context: Context, session: PlanTogether, join: Boolean) {
        val p = prefs(context)
        val others = p.getStringSet("sent", emptySet()).orEmpty().filterNot { it.startsWith("${session.id}=") }
        p.edit().putStringSet("sent", (others + "${session.id}=${if (join) "join" else "leave"}").toSet()).apply()
    }

    fun pending(marks: Set<String>, session: PlanTogether): Boolean? =
        when (marks.firstOrNull { it.startsWith("${session.id}=") }?.substringAfter('=')) {
            "join" -> true
            "leave" -> false
            else -> null
        }

    /** The marks still on their way: the session is open and not yet as you asked. */
    fun stillWaiting(sessions: List<PlanTogether>, marks: Set<String>): Set<String> =
        marks.filter { m -> sessions.any { s -> pending(setOf(m), s)?.let { it != s.joined } == true } }.toSet()

    /** Focus, then break, again and again from the start; like togetherPhase in packages/core/src/studyTogether.ts. */
    fun phase(session: PlanTogether, now: Long): TogetherPhase {
        val focus = session.focus * 60_000L
        val cycle = focus + session.pause * 60_000L
        val since = maxOf(0L, now - session.startedAt)
        val n = since / cycle
        val start = session.startedAt + n * cycle
        val round = (n + 1).toInt()
        return if (since - n * cycle < focus) TogetherPhase(true, round, start + focus) else TogetherPhase(false, round, start + cycle)
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
