package app.nexusos.watch

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.VibrationEffect
import android.os.VibratorManager
import app.nexusos.companion.Connect
import app.nexusos.companion.Protocol
import app.nexusos.companion.R
import app.nexusos.companion.Store

/** A focus round on the watch: 25 minutes focus, 5 minutes pause, again, until you stop. */
object Focus {
    const val FOCUS_MIN = 25
    const val PAUSE_MIN = 5
    private const val PREFS = "focus"
    private const val CHANNEL = "focus"
    private const val NOTIFICATION_ID = 25

    enum class Phase { FOCUS, PAUSE }

    data class State(val phase: Phase, val endsAt: Long)

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun state(context: Context): State? {
        val p = prefs(context)
        val endsAt = p.getLong("endsAt", 0)
        if (endsAt == 0L) return null
        return State(if (p.getString("phase", null) == "pause") Phase.PAUSE else Phase.FOCUS, endsAt)
    }

    fun start(context: Context) = enter(context, Phase.FOCUS, System.currentTimeMillis())

    fun stop(context: Context) {
        prefs(context).edit().clear().apply()
        alarms(context)?.cancel(intent(context))
    }

    private fun enter(context: Context, phase: Phase, now: Long) {
        val endsAt = now + (if (phase == Phase.FOCUS) FOCUS_MIN else PAUSE_MIN) * 60_000L
        prefs(context).edit().putString("phase", if (phase == Phase.PAUSE) "pause" else "focus").putLong("endsAt", endsAt).apply()
        setAlarm(context, endsAt)
    }

    private fun setAlarm(context: Context, endsAt: Long) {
        val alarms = alarms(context) ?: return
        if (alarms.canScheduleExactAlarms()) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, intent(context))
        } else {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, intent(context))
        }
    }

    /** The alarm went off: buzz, say what is next, and count a finished focus round in NEXUS. */
    fun phaseDone(context: Context) {
        val current = state(context) ?: return
        val now = System.currentTimeMillis()
        if (current.phase == Phase.FOCUS) {
            enter(context, Phase.PAUSE, now)
            notify(context, "Pauze", "$FOCUS_MIN minuten gefocust. Neem $PAUSE_MIN minuten pauze.")
            if (Store(context).signedIn) {
                Connect.sendToNexus(context, Protocol.focusPayload(FOCUS_MIN, now)) { }
            }
        } else {
            enter(context, Phase.FOCUS, now)
            notify(context, "Focus", "De pauze is voorbij. Nog $FOCUS_MIN minuten focus.")
        }
    }

    private fun notify(context: Context, title: String, text: String) {
        context.getSystemService(VibratorManager::class.java)?.defaultVibrator
            ?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 200, 400), -1))
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL) == null) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL, "Focus-timer", NotificationManager.IMPORTANCE_HIGH))
        }
        val open = PendingIntent.getActivity(
            context,
            2,
            Intent(context, WatchActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE,
        )
        manager.notify(
            NOTIFICATION_ID,
            Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_nexus)
                .setContentTitle(title)
                .setContentText(text)
                .setAutoCancel(true)
                .setContentIntent(open)
                .build(),
        )
    }

    private fun alarms(context: Context) = context.getSystemService(AlarmManager::class.java)

    private fun intent(context: Context) = PendingIntent.getBroadcast(
        context,
        3,
        Intent(context, FocusReceiver::class.java),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /** After a restart the alarm is gone: set it again, or catch up when its time passed. */
    fun reschedule(context: Context) {
        val current = state(context) ?: return
        if (current.endsAt <= System.currentTimeMillis()) phaseDone(context) else setAlarm(context, current.endsAt)
    }
}

class FocusReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val pending = goAsync()
        Focus.phaseDone(app)
        // Give the message for NEXUS a moment to leave before Android may stop the app.
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ pending.finish() }, 8_000)
    }
}
