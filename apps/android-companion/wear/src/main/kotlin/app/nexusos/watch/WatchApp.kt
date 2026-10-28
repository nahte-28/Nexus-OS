package app.nexusos.watch

import android.app.AlarmManager
import android.app.Application
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import app.nexusos.companion.Connect
import app.nexusos.companion.Safety
import app.nexusos.companion.Store
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The watch app. It is a NEXUS Connect device of its own, like the companion on a phone: NEXUS
 * sends it the same encrypted plan of deadlines and reminders, and the watch sets its own alarms.
 */
class WatchApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // On the wrist, a reminder is worth most on time: show planned notices at their moment and
        // skip the copy NEXUS delivers a bit later (it carries the same ref).
        Safety.grace = 0
        Safety.note = null
        Connect.kind = "horloge"
        Safety.onChange = { Glance.refresh(it) }
        Refresh.schedule(this)
    }
}

/** Fetches what NEXUS sent every half hour, so a new plan reaches the watch without opening the app. */
object Refresh {
    private const val EVERY_MS = 30 * 60_000L

    fun schedule(context: Context) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        val intent = PendingIntent.getBroadcast(
            context,
            1,
            Intent(context, RefreshReceiver::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        // Not exact on purpose: Wear OS may bundle it with other wake-ups, which saves battery.
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + EVERY_MS, intent)
    }
}

class RefreshReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val pending = goAsync()
        val done = AtomicBoolean(false)
        val finish = {
            if (done.compareAndSet(false, true)) {
                Refresh.schedule(app)
                pending.finish()
            }
        }
        Handler(Looper.getMainLooper()).postDelayed({ finish() }, 15_000)
        if (Store(app).signedIn) Connect.receive(app) { finish() } else finish()
    }
}

/** Alarms are gone after a restart of the watch or an update of the app: set them again. */
class WatchBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            Safety.reschedule(context.applicationContext)
            Refresh.schedule(context.applicationContext)
            Focus.reschedule(context.applicationContext)
        }
    }
}
