package app.nexusos.companion

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The safety net on the phone: keeps the plans NEXUS sends ([SafetyPlan]) and sets an alarm for
 * the next notice, so reminders and flow notifications still arrive when the pc is off.
 */
object Safety {
    private const val PREFS = "safety"
    private const val KEY = "plan"

    /** How long to wait for NEXUS before showing a notice itself; the watch app sets 0. */
    @Volatile
    var grace: Long = SafetyPlan.GRACE_MS

    /** The small line under a notice the device showed itself. */
    @Volatile
    var note: String? = "vangnet: NEXUS was niet bereikbaar"

    /** Called after the plan changed, e.g. so the watch redraws its tile and complication. */
    @Volatile
    var onChange: ((Context) -> Unit)? = null

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Synchronized
    fun load(context: Context): SafetyPlan = SafetyPlan.fromJson(prefs(context).getString(KEY, null))

    @Synchronized
    private fun update(context: Context, change: (SafetyPlan) -> SafetyPlan): SafetyPlan {
        val next = change(load(context))
        prefs(context).edit().putString(KEY, next.toJson()).apply()
        schedule(context, next)
        onChange?.invoke(context.applicationContext)
        return next
    }

    fun replacePlan(context: Context, sender: String, items: List<PlannedNotice>) {
        update(context) { it.withPlan(sender, items, System.currentTimeMillis()) }
    }

    /** NEXUS delivered [ref] itself. False when the phone already showed it, so it is not shown twice. */
    @Synchronized
    fun claim(context: Context, ref: String): Boolean {
        if (!load(context).shouldShow(ref)) return false
        update(context) { it.markShown(ref, System.currentTimeMillis()) }
        return true
    }

    /** Shows what NEXUS did not deliver in time. */
    @Synchronized
    fun fireDue(context: Context) {
        val now = System.currentTimeMillis()
        val plan = load(context)
        for (n in plan.due(now, grace)) {
            Notifier.show(
                context,
                n.ref,
                IncomingNotification("notification", "NEXUS", n.title, n.text, n.at, n.ref),
                null,
                note = note,
            )
        }
        update(context) { it.afterDue(now, grace) }
    }

    /** Another account, or none: its plans no longer apply. */
    fun clear(context: Context) = update(context) { SafetyPlan() }

    /** Sets the alarm again, e.g. after a restart of the phone. */
    fun reschedule(context: Context) = schedule(context, load(context))

    fun pendingCount(context: Context): Int = load(context).pending().count { it.at > System.currentTimeMillis() - grace }

    private fun schedule(context: Context, plan: SafetyPlan) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        val intent = PendingIntent.getBroadcast(
            context,
            0,
            Intent(context, SafetyReceiver::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val now = System.currentTimeMillis()
        val next = if (plan.due(now, grace).isNotEmpty()) now + 1000 else plan.nextCheck(now, grace)
        if (next == null) {
            alarms.cancel(intent)
            return
        }
        // Exact when Android allows it; otherwise Android may delay it a few minutes in deep sleep.
        if (alarms.canScheduleExactAlarms()) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, intent)
        } else {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, intent)
        }
    }
}

/** The alarm of the safety net: first asks the server what NEXUS sent, then shows what is still missing. */
class SafetyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val pending = goAsync()
        val done = AtomicBoolean(false)
        val finish = {
            if (done.compareAndSet(false, true)) {
                Safety.fireDue(app)
                pending.finish()
            }
        }
        // Without a connection or an account, the phone does not wait for the server.
        Handler(Looper.getMainLooper()).postDelayed({ finish() }, 8_000)
        if (Store(app).signedIn) Connect.receive(app) { finish() } else finish()
    }
}

/** Alarms are gone after a restart of the phone or an update of the app: set them again. */
class SafetyBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            Safety.reschedule(context.applicationContext)
        }
    }
}
