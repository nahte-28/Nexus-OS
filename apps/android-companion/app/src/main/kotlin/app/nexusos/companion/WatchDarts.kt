package app.nexusos.companion

import org.json.JSONArray
import org.json.JSONObject

/** One visit: the total of up to three darts. A bust counts as three darts for nothing. */
data class DartsVisit(val score: Int, val darts: Int, val bust: Boolean)

/**
 * A solo leg of 301 or 501 with double-out, scored on the watch. When it ends it goes to NEXUS as
 * ActionPayload "darts" (packages/core/src/connect.ts), so it counts in the stats of the Darts app.
 */
data class DartsLeg(
    val id: String,
    val mode: Int,
    val startedAt: Long,
    val visits: List<DartsVisit> = emptyList(),
    /** True once NEXUS has it. */
    val sent: Boolean = false,
    /** Set when the leg was stopped before it was out. */
    val stoppedAt: Long? = null,
) {
    val remaining: Int get() = visits.fold(mode) { left, v -> if (v.bust) left else left - v.score }
    val finished: Boolean get() = remaining == 0
    val over: Boolean get() = finished || stoppedAt != null
    val dartsThrown: Int get() = visits.sumOf { it.darts }

    /** Points per three darts. */
    val average: Double get() = if (dartsThrown == 0) 0.0 else visits.filter { !it.bust }.sumOf { it.score } * 3.0 / dartsThrown
}

/** The same rules and checkout tips as the Darts app in NEXUS (packages/core/src/darts.ts). */
object WatchDarts {
    val MODES = listOf(501, 301)
    const val MAX_VISITS = 100

    /** Totals three darts can never make. */
    private val IMPOSSIBLE = setOf(163, 166, 169, 172, 173, 175, 176, 178, 179)

    /** Left-overs of 170 or less that cannot be finished with a double in three darts. */
    private val BOGEY = setOf(159, 162, 163, 165, 166, 168, 169)

    sealed class Result {
        data class Ok(val leg: DartsLeg) : Result()
        data class Error(val message: String) : Result()
    }

    /** Whether [score] would throw the leg out (then the watch asks in how many darts). */
    fun wouldFinish(leg: DartsLeg, score: Int): Boolean = !leg.over && score == leg.remaining && score <= 170 && score !in BOGEY

    /** Adds a visit; going below zero, leaving 1 or finishing on a score no double ends is a bust. */
    fun add(leg: DartsLeg, score: Int, darts: Int = 3): Result {
        if (leg.over) return Result.Error("Deze leg is al gedaan.")
        if (score !in 0..180) return Result.Error("Een beurt is 0 tot 180.")
        if (score in IMPOSSIBLE) return Result.Error("$score kan niet met drie pijlen.")
        if (leg.visits.size >= MAX_VISITS) return Result.Error("Te veel beurten voor één leg.")
        val left = leg.remaining - score
        val finishable = score <= 170 && score !in BOGEY
        val bust = left < 0 || left == 1 || (left == 0 && !finishable)
        val used = if (left == 0 && !bust) darts.coerceIn(1, 3) else 3
        return Result.Ok(leg.copy(visits = leg.visits + DartsVisit(score, used, bust)))
    }

    fun undo(leg: DartsLeg): DartsLeg = if (leg.sent) leg else leg.copy(visits = leg.visits.dropLast(1), stoppedAt = null)

    // Checkout tips ------------------------------------------------------------------------------

    private data class Dart(val label: String, val value: Int)

    private val DOUBLES: List<Dart> =
        listOf(20, 16, 18, 12, 10, 8, 19, 17, 14, 15, 13, 11, 9, 6, 7, 5, 4, 3, 2, 1).map { Dart("D$it", it * 2) } + Dart("Bull", 50)

    private val SETUPS: List<Dart> =
        (20 downTo 10).map { Dart("T$it", it * 3) } +
            (20 downTo 1).map { Dart("$it", it) } +
            listOf(Dart("25", 25), Dart("Bull", 50)) +
            (9 downTo 1).map { Dart("T$it", it * 3) }

    /** A way to throw out [rest] with a double in at most [darts] darts, like T20 T20 Bull, or null. */
    fun checkout(rest: Int, darts: Int = 3): List<String>? {
        if (rest <= 0 || darts < 1) return null
        DOUBLES.firstOrNull { it.value == rest }?.let { return listOf(it.label) }
        if (darts == 1) return null
        var best: List<String>? = null
        var cost = Int.MAX_VALUE
        SETUPS.forEachIndexed { i, s ->
            val end = DOUBLES.firstOrNull { it.value == rest - s.value } ?: return@forEachIndexed
            val c = DOUBLES.indexOf(end) * 5 + i
            if (c < cost) {
                cost = c
                best = listOf(s.label, end.label)
            }
        }
        best?.let { return it }
        if (darts == 2) return null
        for (s in SETUPS) {
            val tail = checkout(rest - s.value, 2)
            if (tail != null && tail.size == 2) return listOf(s.label) + tail
        }
        return null
    }

    // Storage and sending --------------------------------------------------------------------------

    fun encode(leg: DartsLeg): String {
        val visits = JSONArray()
        for (v in leg.visits) visits.put(JSONObject().put("score", v.score).put("darts", v.darts).put("bust", v.bust))
        return JSONObject()
            .put("id", leg.id)
            .put("mode", leg.mode)
            .put("startedAt", leg.startedAt)
            .put("visits", visits)
            .put("sent", leg.sent)
            .put("stoppedAt", leg.stoppedAt ?: JSONObject.NULL)
            .toString()
    }

    fun decode(json: String?): DartsLeg? {
        val o = json?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return null
        val id = o.optString("id").takeIf { it.isNotEmpty() } ?: return null
        val mode = o.optInt("mode").takeIf { it in MODES } ?: return null
        val list = o.optJSONArray("visits") ?: JSONArray()
        val visits = (0 until minOf(list.length(), MAX_VISITS)).mapNotNull { i ->
            val v = list.optJSONObject(i) ?: return@mapNotNull null
            DartsVisit(v.optInt("score").coerceIn(0, 180), v.optInt("darts", 3).coerceIn(1, 3), v.optBoolean("bust"))
        }
        val stopped = if (o.isNull("stoppedAt")) null else o.optLong("stoppedAt")
        return DartsLeg(id, mode, o.optLong("startedAt"), visits, o.optBoolean("sent"), stopped)
    }

    /** The leg for NEXUS (ActionPayload "darts"); NEXUS replays the visits with its own rules. */
    fun payload(leg: DartsLeg, at: Long): String {
        val visits = JSONArray()
        for (v in leg.visits) visits.put(JSONObject().put("score", v.score).put("darts", v.darts))
        return JSONObject()
            .put("v", 1)
            .put("kind", "action")
            .put("action", "darts")
            .put("id", leg.id)
            .put("mode", leg.mode)
            .put("startedAt", leg.startedAt)
            .put("visits", visits)
            .put("at", at)
            .toString()
    }
}
