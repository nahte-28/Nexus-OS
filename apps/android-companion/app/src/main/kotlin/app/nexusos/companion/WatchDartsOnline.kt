package app.nexusos.companion

import android.content.Context

/**
 * Darts online on the watch: the matches against friends that NEXUS sent with the plan, and the
 * visits you entered here that NEXUS did not show back yet. A visit stays "on its way" until a plan
 * arrives in which the match moved on, so you do not throw twice.
 */
object WatchDartsOnline {
    private const val PREFS = "darts_online"

    /** Keeps the matches from a plan; a plan without them (none being played) clears the old ones. */
    fun save(context: Context, json: String) {
        val games = Protocol.parsePlanDarts(json) ?: return
        val p = prefs(context)
        p.edit()
            .putString("plan", json)
            .putStringSet("sent", stillWaiting(games, p.getStringSet("sent", emptySet()).orEmpty()))
            .apply()
    }

    /** The matches being played, yours to throw first. */
    fun load(context: Context): List<PlanDartsGame> =
        prefs(context).getString("plan", null)?.let(Protocol::parsePlanDarts).orEmpty()

    /** The visit you sent for [game] at its current stand, or null when none is on its way. */
    fun sentScore(context: Context, game: PlanDartsGame): Int? =
        sentScore(prefs(context).getStringSet("sent", emptySet()).orEmpty(), game)

    /** Remembers that NEXUS got your visit of [score] for [game]. */
    fun sent(context: Context, game: PlanDartsGame, score: Int) {
        val p = prefs(context)
        val others = p.getStringSet("sent", emptySet()).orEmpty().filterNot { it.startsWith("${game.id}@") }
        p.edit().putStringSet("sent", (others + mark(game, score)).toSet()).apply()
    }

    /** Forgets the visit on its way for [game], to enter it again. */
    fun forget(context: Context, game: PlanDartsGame) {
        val p = prefs(context)
        p.edit().putStringSet("sent", p.getStringSet("sent", emptySet()).orEmpty().filterNot { it.startsWith("${game.id}@") }.toSet()).apply()
    }

    private fun mark(game: PlanDartsGame, score: Int) = "${game.id}@${game.seq}=$score"

    fun sentScore(marks: Set<String>, game: PlanDartsGame): Int? =
        marks.firstOrNull { it.startsWith("${game.id}@${game.seq}=") }?.substringAfter('=')?.toIntOrNull()

    /** The marks of visits still on their way: the match is there at the same stand. */
    fun stillWaiting(games: List<PlanDartsGame>, marks: Set<String>): Set<String> =
        marks.filter { m -> games.any { g -> sentScore(setOf(m), g) != null } }.toSet()

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
