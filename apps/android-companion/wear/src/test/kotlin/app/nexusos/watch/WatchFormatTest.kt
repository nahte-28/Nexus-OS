package app.nexusos.watch

import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchFormatTest {
    private val zone = ZoneId.of("Europe/Brussels")
    private fun at(day: Int, hour: Int) = ZonedDateTime.of(2026, 11, day, hour, 0, 0, 0, zone).toInstant().toEpochMilli()

    @Test
    fun saysTodayTomorrowOrTheDay() {
        val now = at(2, 9)
        assertEquals("14:00", WatchFormat.at(at(2, 14), now, zone))
        assertEquals("morgen 08:00", WatchFormat.at(at(3, 8), now, zone))
        val later = WatchFormat.at(at(5, 10), now, zone)
        assertTrue(later, later.startsWith("do 5 nov") && later.endsWith("10:00"))
    }

    @Test
    fun fitsAComplication() {
        val now = at(2, 9)
        assertEquals("14:00", WatchFormat.short(at(2, 14), now, zone))
        assertTrue(WatchFormat.short(at(5, 10), now, zone).startsWith("do"))
        assertTrue(WatchFormat.short(at(5, 10), now, zone).length <= 7)
    }
}
