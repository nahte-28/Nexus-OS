package app.nexusos.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri

/** Shows messages from NEXUS as Android notifications; on the phone, the watch app mirrors them to the watch. */
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

    fun show(context: Context, messageId: String, n: IncomingNotification, from: String?, note: String? = null) {
        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context,
            0,
            // The app's own start screen: the companion on the phone, the watch app on the watch.
            (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_nexus)
            .setColor(context.getColor(R.color.nexus_accent))
            .setContentTitle(n.title.ifEmpty { n.appName })
            .setContentText(n.text)
            .setSubText(note ?: from?.let { "van $it" })
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setWhen(n.postedAt)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setContentIntent(open)
        if (n.text != null) builder.setStyle(Notification.BigTextStyle().bigText(n.text))
        manager(context).notify(messageId.hashCode(), builder.build())
    }

    /**
     * Text or a link from NEXUS Bridge. On the phone a link opens in the browser when tapped; on the
     * watch, and for text, the app opens.
     */
    fun showTransfer(context: Context, t: BridgeTransfer, from: String?) {
        ensureChannel(context)
        val launcher = (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val target = if (t.link != null && Connect.kind == null) Intent(Intent.ACTION_VIEW, Uri.parse(t.link)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) else launcher
        val key = bridgeKey(t.transferId)
        val open = PendingIntent.getActivity(context, key.hashCode(), target, PendingIntent.FLAG_IMMUTABLE)
        val sender = from ?: t.senderName.ifEmpty { "een ander toestel" }
        val builder = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_nexus)
            .setColor(context.getColor(R.color.nexus_accent))
            .setContentTitle("${if (t.link != null) "Link" else "Tekst"} van $sender")
            .setContentText(t.content)
            .setSubText("Bridge")
            .setStyle(Notification.BigTextStyle().bigText(t.content))
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setWhen(t.sentAt)
            .setShowWhen(true)
            .setAutoCancel(true)
            // Gone by itself once the transfer expires, like the content in NEXUS.
            .setTimeoutAfter((t.expiresAt - System.currentTimeMillis()).coerceAtLeast(1_000L))
            .setContentIntent(open)
        manager(context).notify(key.hashCode(), builder.build())
    }

    /** Removes a Bridge notification after the sender took the transfer back. */
    fun cancelTransfer(context: Context, transferId: String) = manager(context).cancel(bridgeKey(transferId).hashCode())

    private fun bridgeKey(transferId: String) = "bridge:$transferId"
}
