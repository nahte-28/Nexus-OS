package app.nexusos.companion

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchPracticeTest {
    @Test
    fun aroundTheClockEndsOnTheBull() {
        var r = PracticeRound("p1", "clock", 1)
        assertEquals("1", WatchPractice.target(r))
        r = WatchPractice.dart(r, false)
        repeat(20) { r = WatchPractice.dart(r, true) }
        assertEquals("Bull", WatchPractice.target(r))
        r = WatchPractice.dart(r, true)
        assertTrue(r.done)
        assertEquals("22 pijlen", WatchPractice.summary(r))
        assertEquals(r, WatchPractice.dart(r, true))
    }

    @Test
    fun bobs27StopsBelowZeroAndScoringRefusesImpossibleScores() {
        var b = PracticeRound("p2", "bobs27", 1)
        b = WatchPractice.bobs(b, 1) // 27 + 2
        assertEquals(29, WatchPractice.bobsScore(b))
        repeat(3) { b = WatchPractice.bobs(b, 0) } // - 4 - 6 - 8 = 11
        assertEquals("D5", WatchPractice.target(b))
        b = WatchPractice.bobs(b, 0) // -10 = 1
        b = WatchPractice.bobs(b, 0) // -12 = below zero
        assertNull(WatchPractice.target(b))

        val s = PracticeRound("p3", "scoring", 1)
        assertNotNull(WatchPractice.scoring(s, 179).second)
        assertEquals(listOf(60), WatchPractice.scoring(s, 60).first?.visits)
    }

    @Test
    fun keepsItsStateAndSendsTheRound() {
        val r = PracticeRound("p4", "doubles", 5, throws = listOf(true, false), stoppedAt = 9)
        assertEquals(r, WatchPractice.decode(WatchPractice.encode(r)))
        val p = JSONObject(WatchPractice.payload(r, 10))
        assertEquals("darts_practice", p.getString("action"))
        assertEquals("doubles", p.getString("game"))
        assertEquals(2, p.getJSONArray("throws").length())
        assertNull(WatchPractice.decode("{\"id\":\"x\",\"game\":\"checkout\"}"))
    }
}
