package app.nexusos.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/** Shows messages from NEXUS as Android notifications; the watch app mirrors them to the watch. */
object Notifier {
    private const val CHANNEL = "nexus"

    private fun manager(context: Context) = context.getSystemService(NotificationManager::class.java)!!

    fun ensureChannel(context: Context) {
        val manager = manager(context)
        if (manager.getNotificationChannel(CHANNEL) != null) return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Meldingen van NEXUS", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Wat je vanuit NEXUS naar je gsm en horloge stuurt."
            },
        )
    }

    fun enabled(context: Context): Boolean = manager(context).areNotificationsEnabled()

    fun show(context: Context, messageId: String, n: IncomingNotification, from: String?) {
        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_nexus)
            .setColor(context.getColor(R.color.nexus_accent))
            .setContentTitle(n.title.ifEmpty { n.appName })
            .setContentText(n.text)
            .setSubText(from?.let { "van $it" })
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setWhen(n.postedAt)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setContentIntent(open)
        if (n.text != null) builder.setStyle(Notification.BigTextStyle().bigText(n.text))
        manager(context).notify(messageId.hashCode(), builder.build())
    }
}
