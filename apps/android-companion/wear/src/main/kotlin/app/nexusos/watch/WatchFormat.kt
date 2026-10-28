package app.nexusos.watch

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Short Dutch times for a small screen, without Android so they can be unit tested. */
object WatchFormat {
    private val dutch = Locale.forLanguageTag("nl-BE")
    private val clock = DateTimeFormatter.ofPattern("HH:mm", dutch)
    private val day = DateTimeFormatter.ofPattern("EEE d MMM", dutch)
    private val weekday = DateTimeFormatter.ofPattern("EEE d", dutch)

    /** "14:00" today, "morgen 14:00", or "di 3 nov. 14:00". */
    fun at(at: Long, now: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        val time = Instant.ofEpochMilli(at).atZone(zone)
        val days = ChronoUnit.DAYS.between(Instant.ofEpochMilli(now).atZone(zone).toLocalDate(), time.toLocalDate())
        return when (days) {
            0L -> clock.format(time)
            1L -> "morgen ${clock.format(time)}"
            -1L -> "gisteren ${clock.format(time)}"
            else -> "${day.format(time)} ${clock.format(time)}"
        }
    }

    /** At most about seven characters, for a small complication: "14:00" today, else "do 5". */
    fun short(at: Long, now: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        val time = Instant.ofEpochMilli(at).atZone(zone)
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        return if (time.toLocalDate() == today) clock.format(time) else weekday.format(time).removeSuffix(".")
    }
}
