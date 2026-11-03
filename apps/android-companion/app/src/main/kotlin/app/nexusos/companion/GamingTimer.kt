package app.nexusos.companion

import android.content.Context

/**
 * The Gaming timer as this device knows it: started or stopped here (the watch), or as NEXUS last
 * sent it with the safety net. Whatever happened last wins, so a plan sent before NEXUS got the
 * watch's start does not undo it.
 */
object GamingTimer {
    private const val PREFS = "gaming"

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun state(context: Context): PlanGaming? {
        val p = prefs(context)
        val startedAt = p.getLong("startedAt", 0L)
        return if (startedAt > 0) PlanGaming(p.getString("game", null) ?: "Gaming", startedAt) else null
    }

    /** Started or stopped on this device, at [at]. */
    fun setHere(context: Context, gaming: PlanGaming?, at: Long) = save(context, gaming, at)

    /** NEXUS sent the timer with a plan; older than a change made here, it is ignored. */
    fun fromPlan(context: Context, field: PlanGamingField) {
        if (!field.known) return
        if (field.sentAt <= prefs(context).getLong("changedAt", 0L)) return
        save(context, field.gaming, field.sentAt)
    }

    private fun save(context: Context, gaming: PlanGaming?, at: Long) {
        prefs(context).edit()
            .putLong("startedAt", gaming?.startedAt ?: 0L)
            .putString("game", gaming?.game)
            .putLong("changedAt", at)
            .apply()
    }
}
