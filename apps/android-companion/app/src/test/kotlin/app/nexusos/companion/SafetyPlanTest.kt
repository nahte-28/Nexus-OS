package app.nexusos.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SafetyPlanTest {
    private val nine = 1_760_947_200_000L
    private fun notice(ref: String, at: Long = nine) = PlannedNotice(ref, at, "Labo indienen", "Om 09:00")

    @Test
    fun readsThePlanTheWebAppSends() {
        val items = Protocol.parsePlan(
            "{\"v\":1,\"kind\":\"plan\",\"sentAt\":1,\"items\":[{\"ref\":\"reminder:a@$nine\",\"at\":$nine,\"title\":\"Labo\"},{\"ref\":\"\",\"at\":1,\"title\":\"x\"}]}",
        )!!
        assertEquals(listOf(PlannedNotice("reminder:a@$nine", nine, "Labo", null)), items)
        assertNull(Protocol.parsePlan("{\"v\":1,\"kind\":\"notification\",\"title\":\"Hoi\"}"))
        assertEquals("flow:f|at:2026-10-20|0", Protocol.parsePayload("{\"v\":1,\"kind\":\"notification\",\"title\":\"Hoi\",\"ref\":\"flow:f|at:2026-10-20|0\"}")!!.ref)
    }

    @Test
    fun showsANoticeOnlyWhenNexusDidNotDeliverIt() {
        var plan = SafetyPlan().withPlan("pc", listOf(notice("a"), notice("b", nine + 3_600_000)), nine - 60_000)
        assertEquals(nine + SafetyPlan.GRACE_MS, plan.nextCheck(nine))
        assertTrue(plan.due(nine + 60_000).isEmpty())
        // The pc delivered "a" itself.
        assertTrue(plan.shouldShow("a"))
        plan = plan.markShown("a", nine + 10_000)
        assertTrue(plan.due(nine + SafetyPlan.GRACE_MS).isEmpty())
        // The pc is off for "b": the phone shows it, and not again when the pc catches up later.
        val later = nine + 3_600_000 + SafetyPlan.GRACE_MS
        assertEquals(listOf("b"), plan.due(later).map { it.ref })
        plan = plan.afterDue(later)
        assertFalse(plan.shouldShow("b"))
        assertNull(plan.nextCheck(later))
    }

    @Test
    fun keepsDueNoticesWhenANewPlanLeavesThemOut() {
        var plan = SafetyPlan().withPlan("pc", listOf(notice("a"), notice("gone", nine + 7_200_000)), nine - 60_000)
        // The pc made a new plan just after 09:00, without "a", and the user deleted "gone".
        plan = plan.withPlan("pc", emptyList(), nine + 5_000)
        assertEquals(listOf("a"), plan.pending().map { it.ref })
    }

    @Test
    fun survivesSavingAndLoading() {
        val plan = SafetyPlan().withPlan("pc", listOf(notice("a")), nine - 1).markShown("x", nine)
        val again = SafetyPlan.fromJson(plan.toJson())
        assertEquals(plan.plans, again.plans)
        assertEquals(plan.shown, again.shown)
        assertTrue(SafetyPlan.fromJson("geen json").pending().isEmpty())
    }

    @Test
    fun dropsNoticesThatAreTooOld() {
        val plan = SafetyPlan().withPlan("pc", listOf(notice("a")), nine - 1)
        assertTrue(plan.due(nine + SafetyPlan.STALE_MS + 1).isEmpty())
    }

    @Test
    fun theWatchShowsNoticesOnTimeAndSkipsTheLateCopy() {
        var plan = SafetyPlan().withPlan("pc", listOf(notice("a")), nine - 60_000)
        assertEquals(nine, plan.nextCheck(nine - 1, grace = 0))
        assertEquals(listOf("a"), plan.due(nine, grace = 0).map { it.ref })
        plan = plan.afterDue(nine, grace = 0)
        // NEXUS delivers "a" a moment later: already shown, so not again.
        assertFalse(plan.shouldShow("a"))
    }
}
