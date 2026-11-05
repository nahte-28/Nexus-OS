package app.nexusos.companion

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchDartsTest {
    private fun ok(r: WatchDarts.Result) = (r as WatchDarts.Result.Ok).leg

    @Test
    fun scoresALegWithBustsAndAFinish() {
        var leg = DartsLeg("l1", 501, 10)
        leg = ok(WatchDarts.add(leg, 180))
        leg = ok(WatchDarts.add(leg, 180))
        assertEquals(141, leg.remaining)
        assertEquals(listOf("T20", "T15", "D18"), WatchDarts.checkout(leg.remaining))
        leg = ok(WatchDarts.add(leg, 140))
        assertTrue("1 left is a bust", leg.visits.last().bust)
        assertEquals(141, leg.remaining)
        assertTrue(WatchDarts.wouldFinish(leg, 141))
        leg = ok(WatchDarts.add(leg, 141, darts = 3))
        assertTrue(leg.finished)
        assertEquals(12, leg.dartsThrown)
        assertEquals(125.25, leg.average, 0.001)
        assertTrue(WatchDarts.add(leg, 10) is WatchDarts.Result.Error)
    }

    @Test
    fun refusesImpossibleScoresAndBogeyFinishes() {
        val leg = DartsLeg("l2", 301, 10, listOf(DartsVisit(132, 3, false)))
        assertEquals(169, leg.remaining)
        assertTrue(WatchDarts.add(leg, 179) is WatchDarts.Result.Error)
        assertFalse(WatchDarts.wouldFinish(leg, 169))
        assertNull(WatchDarts.checkout(169))
        assertEquals(listOf("T20", "T20", "Bull"), WatchDarts.checkout(170))
        assertEquals(listOf("D20"), WatchDarts.checkout(40))
    }

    @Test
    fun keepsTheLegAndBuildsThePayload() {
        val leg = DartsLeg("l3", 501, 10, listOf(DartsVisit(60, 3, false), DartsVisit(100, 3, false)), stoppedAt = 20)
        assertEquals(leg, WatchDarts.decode(WatchDarts.encode(leg)))
        assertNull(WatchDarts.decode("{\"id\":\"x\",\"mode\":999}"))
        val p = JSONObject(WatchDarts.payload(leg, 30))
        assertEquals("darts", p.getString("action"))
        assertEquals(501, p.getInt("mode"))
        assertEquals(2, p.getJSONArray("visits").length())
        assertEquals(100, p.getJSONArray("visits").getJSONObject(1).getInt("score"))
        assertEquals(DartsLeg("l3", 501, 10, listOf(DartsVisit(60, 3, false))), WatchDarts.undo(leg))
    }
}
