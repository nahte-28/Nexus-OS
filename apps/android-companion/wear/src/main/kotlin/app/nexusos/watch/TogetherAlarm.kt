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
import app.nexusos.companion.R
import app.nexusos.companion.WatchTogether

/**
 * Samen studeren on the wrist: while you are in a session, the watch buzzes at each switch between
 * focus and break, at the same moment as everyone in it. NEXUS logs the focus blocks itself, so the
 * watch sends nothing.
 */
object TogetherAlarm {
    private const val PREFS = "together_alarm"
    private const val CHANNEL = "together"
    private const val NOTIFICATION_ID = 26

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Sets the alarm for the next switch of the session you are in, or clears it when you are in none. */
    fun reschedule(context: Context) {
        val now = System.currentTimeMillis()
        val session = WatchTogether.load(context, now).firstOrNull { it.joined }
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        if (session == null) {
            prefs(context).edit().clear().apply()
            alarms.cancel(intent(context))
            return
        }
        val endsAt = WatchTogether.phase(session, now).endsAt
        prefs(context).edit().putString("id", session.id).putLong("endsAt", endsAt).apply()
        if (alarms.canScheduleExactAlarms()) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, intent(context))
        } else {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, intent(context))
        }
    }

    /** The alarm went off: buzz and say what is next, when you are still in that session. */
    fun fired(context: Context) {
        val p = prefs(context)
        val id = p.getString("id", null)
        val endsAt = p.getLong("endsAt", 0)
        val now = System.currentTimeMillis()
        val session = WatchTogether.load(context, now).firstOrNull { it.joined && it.id == id }
        if (session != null && now >= endsAt - 1000) {
            val next = WatchTogether.phase(session, now + 1000)
            if (next.focus) {
                notify(context, "Focus", "De pauze is voorbij. Samen ${session.focus} minuten focus: ${session.title}.")
            } else {
                notify(context, "Pauze", "Blok ${next.round} van ${session.title} is klaar. ${session.pause} minuten pauze.")
            }
        }
        reschedule(context)
    }

    private fun notify(context: Context, title: String, text: String) {
        context.getSystemService(VibratorManager::class.java)?.defaultVibrator
            ?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 200, 400), -1))
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL) == null) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL, "Samen studeren", NotificationManager.IMPORTANCE_HIGH))
        }
        val open = PendingIntent.getActivity(
            context,
            4,
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

    private fun intent(context: Context) = PendingIntent.getBroadcast(
        context,
        5,
        Intent(context, TogetherReceiver::class.java),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}

class TogetherReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        TogetherAlarm.fired(context.applicationContext)
    }
}
