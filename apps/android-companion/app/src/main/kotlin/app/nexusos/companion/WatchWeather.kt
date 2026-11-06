package app.nexusos.companion

import android.content.Context

/** The last weather NEXUS sent with the plan, kept for the watch tile and app. */
object WatchWeather {
    private const val PREFS = "weather"
    /** Older than this, the watch shows no weather rather than stale weather. */
    const val MAX_AGE_MS = 12 * 60 * 60_000L

    fun save(context: Context, weather: PlanWeather) {
        prefs(context).edit()
            .putString("place", weather.place)
            .putInt("temp", weather.temp)
            .putInt("min", weather.min)
            .putInt("max", weather.max)
            .putInt("rainChance", weather.rainChance)
            .putString("label", weather.label)
            .putString("icon", weather.icon)
            .putLong("at", weather.at)
            .apply()
    }

    fun load(context: Context, now: Long = System.currentTimeMillis()): PlanWeather? {
        val p = prefs(context)
        val at = p.getLong("at", 0L)
        val place = p.getString("place", null) ?: return null
        if (at <= 0 || now - at > MAX_AGE_MS) return null
        return PlanWeather(place, p.getInt("temp", 0), p.getInt("min", 0), p.getInt("max", 0), p.getInt("rainChance", 0), p.getString("label", null) ?: "Weer", p.getString("icon", null) ?: "", at)
    }

    /** One line, like "🌦️ 12° · 8° tot 14° · 70% regen". */
    fun line(w: PlanWeather): String =
        listOfNotNull("${w.icon} ${w.temp}°".trim(), "${w.min}° tot ${w.max}°", if (w.rainChance >= 20) "${w.rainChance}% regen" else null).joinToString(" · ")

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
