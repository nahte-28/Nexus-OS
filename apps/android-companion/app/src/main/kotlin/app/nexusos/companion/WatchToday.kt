package app.nexusos.companion

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The last Vandaag NEXUS sent with the plan (agenda, habits and goals of today), kept for the watch
 * app and tile. A habit ticked off here counts as done right away, until NEXUS sends a new Vandaag.
 */
object WatchToday {
    private const val PREFS = "today"

    fun dayOf(at: Long): String = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(Date(at))

    /** Keeps Vandaag from a plan; a plan without it (nothing today) clears the old one. */
    fun save(context: Context, json: String) {
        val edit = prefs(context).edit().remove("ticked")
        if (Protocol.parsePlanToday(json) == null) edit.remove("plan") else edit.putString("plan", json)
        edit.apply()
    }

    /** Today's Vandaag, or null when NEXUS sent none for today. */
    fun load(context: Context, now: Long = System.currentTimeMillis()): PlanToday? {
        val p = prefs(context)
        val today = Protocol.parsePlanToday(p.getString("plan", null) ?: return null) ?: return null
        return withTicks(today, p.getStringSet("ticked", emptySet()).orEmpty(), dayOf(now))
    }

    /** Marks a habit as done here, after NEXUS got the tick. */
    fun ticked(context: Context, ref: String) {
        val p = prefs(context)
        p.edit().putStringSet("ticked", p.getStringSet("ticked", emptySet()).orEmpty() + ref).apply()
    }

    fun withTicks(today: PlanToday, ticked: Set<String>, day: String): PlanToday? {
        if (today.day != day) return null
        return today.copy(habits = today.habits.map { if (!it.done && it.ref(day) in ticked) it.copy(done = true) else it })
    }

    /** "2 van 3 gewoontes gedaan", or null without habits today. */
    fun habitsLine(today: PlanToday): String? =
        if (today.habits.isEmpty()) null else "${today.habits.count { it.done }} van ${today.habits.size} gewoontes gedaan"

    val STATUS = mapOf("reached" to "Gehaald", "on_track" to "Op schema", "behind" to "Achter", "missed" to "Niet gehaald", "empty" to "Nog niets")

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
