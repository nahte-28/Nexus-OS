package app.nexusos.companion

import android.app.Notification
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Receives every notification Android shows, once the user granted notification access.
 * Only apps the user switched on are forwarded; see [Store.mode]. Android keeps this service
 * running, so it also holds the [Inbox] connection for messages from NEXUS.
 */
class RelayService : NotificationListenerService() {

    override fun onListenerConnected() {
        Inbox.start(this)
    }

    override fun onListenerDisconnected() {
        Inbox.stop()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        Inbox.poke()
        if (sbn.packageName == packageName) return
        val notification = sbn.notification
        val skipFlags = Notification.FLAG_ONGOING_EVENT or Notification.FLAG_FOREGROUND_SERVICE or Notification.FLAG_GROUP_SUMMARY
        if (notification.flags and skipFlags != 0) return

        val extras = notification.extras
        val title = (extras.getCharSequence(Notification.EXTRA_TITLE) ?: extras.getCharSequence(Notification.EXTRA_TITLE_BIG))
            ?.toString().orEmpty()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))
            ?.toString()
        if (title.isBlank() && text.isNullOrBlank()) return

        Connect.forward(
            this,
            PostedNotification(
                app = sbn.packageName,
                appName = appName(sbn.packageName),
                title = title,
                text = text,
                postedAt = sbn.postTime,
                secret = notification.visibility == Notification.VISIBILITY_SECRET,
            ),
            sbn.key,
        )
    }

    private fun appName(app: String): String = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(app, 0)).toString()
    } catch (_: PackageManager.NameNotFoundException) {
        app
    }
}
