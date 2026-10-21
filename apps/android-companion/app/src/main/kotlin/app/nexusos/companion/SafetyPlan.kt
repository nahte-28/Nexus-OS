package app.nexusos.companion

import org.json.JSONArray
import org.json.JSONObject

/**
 * The phone's safety net, without Android so it can be unit tested. NEXUS sends ahead of time what
 * it will send the phone (a plan per sending device). A notice is shown by the phone itself only
 * when NEXUS did not deliver it within [GRACE_MS]; a notice NEXUS delivered later is not shown again.
 */
class SafetyPlan(
    /** Sending device id → its planned notices. */
    val plans: Map<String, List<PlannedNotice>> = emptyMap(),
    /** Refs already shown on this phone → when. */
    val shown: Map<String, Long> = emptyMap(),
) {
    companion object {
        const val MAX_ITEMS = 50
        /** Mirrors SAFETY_GRACE_MS in packages/core/src/safetyNet.ts. */
        const val GRACE_MS = 2 * 60_000L
        /** A notice that should have gone off longer ago than this is no longer worth showing. */
        const val STALE_MS = 6 * 60 * 60_000L
        private const val KEEP_SHOWN_MS = 7 * 24 * 60 * 60_000L

        fun fromJson(json: String?): SafetyPlan {
            val o = json?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return SafetyPlan()
            val plans = o.optJSONObject("plans")?.let { p ->
                p.keys().asSequence().associateWith { sender ->
                    val rows = p.optJSONArray(sender) ?: JSONArray()
                    (0 until rows.length()).mapNotNull { i ->
                        val r = rows.optJSONObject(i) ?: return@mapNotNull null
                        PlannedNotice(r.optString("ref"), r.optLong("at"), r.optString("title"), r.optString("text").ifEmpty { null })
                    }
                }
            } ?: emptyMap()
            val shown = o.optJSONObject("shown")?.let { s -> s.keys().asSequence().associateWith { s.optLong(it) } } ?: emptyMap()
            return SafetyPlan(plans, shown)
        }
    }

    /**
     * A new plan from [sender] replaces its old one. Notices from the old plan that were already
     * due stay: the sender may simply have made the new plan just after their moment.
     */
    fun withPlan(sender: String, items: List<PlannedNotice>, now: Long): SafetyPlan {
        val refs = items.map { it.ref }.toSet()
        val due = plans[sender].orEmpty().filter { it.at <= now && it.ref !in refs && it.ref !in shown }
        return SafetyPlan(plans + (sender to (items + due).sortedBy { it.at }.take(MAX_ITEMS)), shown).pruned(now)
    }

    /** NEXUS delivered [ref] itself: true when it is new here and should be shown. */
    fun shouldShow(ref: String): Boolean = ref !in shown

    fun markShown(ref: String, now: Long): SafetyPlan =
        SafetyPlan(plans.mapValues { (_, items) -> items.filter { it.ref != ref } }, shown + (ref to now)).pruned(now)

    /** The notices the phone has to show itself now. */
    fun due(now: Long): List<PlannedNotice> =
        pending().filter { it.at + GRACE_MS <= now && now - it.at <= STALE_MS }

    /** When to look again: the first notice that is not due yet. */
    fun nextCheck(now: Long): Long? = pending().map { it.at + GRACE_MS }.filter { it > now }.minOrNull()

    /** Waiting notices, each ref once. */
    fun pending(): List<PlannedNotice> =
        plans.values.flatten().filter { it.ref !in shown }.distinctBy { it.ref }.sortedBy { it.at }

    private fun pruned(now: Long): SafetyPlan = SafetyPlan(
        plans.mapValues { (_, items) -> items.filter { now - it.at <= STALE_MS } }.filterValues { it.isNotEmpty() },
        shown.filterValues { now - it <= KEEP_SHOWN_MS },
    )

    /** After showing what is [due]: drops what is too old to show as well. */
    fun afterDue(now: Long): SafetyPlan {
        var next = this
        for (n in due(now)) next = next.markShown(n.ref, now)
        return next.pruned(now)
    }

    fun toJson(): String {
        val p = JSONObject()
        for ((sender, items) in plans) {
            p.put(sender, JSONArray().apply {
                items.forEach { put(JSONObject().put("ref", it.ref).put("at", it.at).put("title", it.title).apply { if (it.text != null) put("text", it.text) }) }
            })
        }
        val s = JSONObject().apply { shown.forEach { (ref, at) -> put(ref, at) } }
        return JSONObject().put("plans", p).put("shown", s).toString()
    }
}
