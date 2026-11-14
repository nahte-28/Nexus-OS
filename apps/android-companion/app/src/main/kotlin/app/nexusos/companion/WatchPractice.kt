package app.nexusos.companion

import org.json.JSONArray
import org.json.JSONObject

/**
 * A darts practice round on the watch: Around the Clock, Doubles rond, Bob's 27 or Scoring op T20.
 * When it ends it goes to NEXUS as ActionPayload "darts_practice" (packages/core/src/connect.ts),
 * which replays it with the rules of Darts › Oefenen (packages/core/src/dartsPractice.ts).
 */
data class PracticeRound(
    val id: String,
    val game: String,
    val startedAt: Long,
    /** Around the Clock and Doubles rond: one entry per dart, hit or miss. */
    val throws: List<Boolean> = emptyList(),
    /** Bob's 27: darts that hit (0 to 3) per double. */
    val hits: List<Int> = emptyList(),
    /** Scoring: the total of each visit. */
    val visits: List<Int> = emptyList(),
    val sent: Boolean = false,
    val stoppedAt: Long? = null,
) {
    val done: Boolean get() = WatchPractice.target(this) == null
    val over: Boolean get() = done || stoppedAt != null
    val empty: Boolean get() = throws.isEmpty() && hits.isEmpty() && visits.isEmpty()
}

object WatchPractice {
    val GAMES = listOf("clock", "doubles", "bobs27", "scoring")
    val LABELS = mapOf("clock" to "Around the Clock", "doubles" to "Doubles rond", "bobs27" to "Bob's 27", "scoring" to "Scoring op T20")
    val HELP = mapOf(
        "clock" to "Raak 1 tot 20 en dan de bull. Tik per pijl Raak of Mis.",
        "doubles" to "Raak D1 tot D20 en dan de bull. Tik per pijl Raak of Mis.",
        "bobs27" to "Je begint met 27. Drie pijlen per double: tik hoeveel er raak waren.",
        "scoring" to "Tien beurten op T20: tik per beurt het totaal.",
    )

    const val TARGETS = 21
    const val SCORING_VISITS = 10
    private const val MAX_THROWS = 500
    private const val BOBS_START = 27
    private val IMPOSSIBLE = setOf(163, 166, 169, 172, 173, 175, 176, 178, 179)

    fun clockHits(r: PracticeRound): Int = minOf(TARGETS, r.throws.count { it })

    private fun bobsValue(i: Int) = if (i >= TARGETS - 1) 50 else (i + 1) * 2

    fun bobsScore(r: PracticeRound): Int = r.hits.foldIndexed(BOBS_START) { i, s, h -> if (h > 0) s + h * bobsValue(i) else s - bobsValue(i) }

    /** What to aim at now ("7", "D7", "Bull", "T20"), or null when the round is over. */
    fun target(r: PracticeRound): String? = when (r.game) {
        "clock", "doubles" -> {
            val hits = clockHits(r)
            when {
                hits >= TARGETS || r.throws.size >= MAX_THROWS -> null
                hits == TARGETS - 1 -> "Bull"
                r.game == "doubles" -> "D${hits + 1}"
                else -> "${hits + 1}"
            }
        }
        "bobs27" -> when {
            r.hits.isNotEmpty() && bobsScore(r) <= 0 -> null
            r.hits.size >= TARGETS -> null
            r.hits.size == TARGETS - 1 -> "Bull"
            else -> "D${r.hits.size + 1}"
        }
        else -> if (r.visits.size >= SCORING_VISITS) null else "T20"
    }

    fun dart(r: PracticeRound, hit: Boolean): PracticeRound = if (r.over) r else r.copy(throws = r.throws + hit)

    fun bobs(r: PracticeRound, hits: Int): PracticeRound = if (r.over) r else r.copy(hits = r.hits + hits.coerceIn(0, 3))

    /** One visit in Scoring, or an error text. */
    fun scoring(r: PracticeRound, score: Int): Pair<PracticeRound?, String?> = when {
        r.over -> null to "Deze ronde is al gedaan."
        score !in 0..180 -> null to "Een beurt is 0 tot 180."
        score in IMPOSSIBLE -> null to "$score kan niet met drie pijlen."
        else -> r.copy(visits = r.visits + score) to null
    }

    fun undo(r: PracticeRound): PracticeRound = when {
        r.sent -> r
        r.game == "bobs27" -> r.copy(hits = r.hits.dropLast(1), stoppedAt = null)
        r.game == "scoring" -> r.copy(visits = r.visits.dropLast(1), stoppedAt = null)
        else -> r.copy(throws = r.throws.dropLast(1), stoppedAt = null)
    }

    /** One line, the same as the list of earlier rounds in NEXUS. */
    fun summary(r: PracticeRound): String = when (r.game) {
        "clock", "doubles" -> if (clockHits(r) >= TARGETS) "${r.throws.size} pijlen" else "tot ${clockHits(r)} van $TARGETS"
        "bobs27" -> "${bobsScore(r)} punten" + if (r.hits.size < TARGETS) " (${r.hits.size} van $TARGETS doubles)" else ""
        else -> {
            val avg = if (r.visits.isEmpty()) 0.0 else r.visits.sum().toDouble() / r.visits.size
            "gem. ${"%.1f".format(avg)} over ${r.visits.size} beurten"
        }
    }

    // Storage and sending --------------------------------------------------------------------------

    fun encode(r: PracticeRound): String = JSONObject()
        .put("id", r.id)
        .put("game", r.game)
        .put("startedAt", r.startedAt)
        .put("throws", JSONArray(r.throws))
        .put("hits", JSONArray(r.hits))
        .put("visits", JSONArray(r.visits))
        .put("sent", r.sent)
        .put("stoppedAt", r.stoppedAt ?: JSONObject.NULL)
        .toString()

    fun decode(json: String?): PracticeRound? {
        val o = json?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return null
        val id = o.optString("id").takeIf { it.isNotEmpty() } ?: return null
        val game = o.optString("game").takeIf { it in GAMES } ?: return null
        fun ints(key: String, max: Int, top: Int): List<Int> {
            val a = o.optJSONArray(key) ?: return emptyList()
            return (0 until minOf(a.length(), max)).map { a.optInt(it).coerceIn(0, top) }
        }
        val t = o.optJSONArray("throws") ?: JSONArray()
        val throws = (0 until minOf(t.length(), MAX_THROWS)).map { t.optBoolean(it) }
        val stopped = if (o.isNull("stoppedAt")) null else o.optLong("stoppedAt")
        return PracticeRound(id, game, o.optLong("startedAt"), throws, ints("hits", TARGETS, 3), ints("visits", SCORING_VISITS, 180), o.optBoolean("sent"), stopped)
    }

    /** The round for NEXUS (ActionPayload "darts_practice"). */
    fun payload(r: PracticeRound, at: Long): String = JSONObject()
        .put("v", 1)
        .put("kind", "action")
        .put("action", "darts_practice")
        .put("id", r.id)
        .put("game", r.game)
        .put("startedAt", r.startedAt)
        .put("throws", JSONArray(r.throws))
        .put("hits", JSONArray(r.hits))
        .put("visits", JSONArray(r.visits))
        .put("at", at)
        .toString()
}
