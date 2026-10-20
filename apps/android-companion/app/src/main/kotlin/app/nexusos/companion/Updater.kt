package app.nexusos.companion

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.os.Handler
import android.os.Looper
import okhttp3.Request
import java.io.File
import java.util.concurrent.Executors

/**
 * Updates the companion from GitHub releases: checks for a newer APK, downloads it and hands it
 * to Android's package installer, which installs it over this version (same signing key).
 */
object Updater {
    sealed interface State {
        data object Idle : State
        data object Checking : State
        data object Current : State
        data class Available(val update: AvailableUpdate) : State
        data class Downloading(val update: AvailableUpdate) : State
        data class Failed(val error: String) : State
    }

    @Volatile
    var state: State = State.Idle
        private set

    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private fun set(next: State) {
        state = next
        Connect.notifyChanged()
    }

    @Suppress("DEPRECATION")
    private fun currentBuild(context: Context): Int =
        context.packageManager.getPackageInfo(context.packageName, 0).let {
            if (Build.VERSION.SDK_INT >= 28) it.longVersionCode.toInt() else it.versionCode
        }

    fun check(context: Context) {
        if (state is State.Checking || state is State.Downloading) return
        val app = context.applicationContext
        set(State.Checking)
        worker.execute {
            set(
                try {
                    val request = Request.Builder().url(UpdateCheck.RELEASES_API).header("User-Agent", "NEXUS-Companion").build()
                    val body = Supabase.http.newCall(request).execute().use { response ->
                        if (!response.isSuccessful) throw java.io.IOException("GitHub gaf ${response.code}")
                        response.body?.string().orEmpty()
                    }
                    UpdateCheck.newest(body, currentBuild(app))?.let { State.Available(it) } ?: State.Current
                } catch (e: Exception) {
                    State.Failed("Updates zoeken lukte niet: ${e.message ?: e.javaClass.simpleName}")
                }
            )
        }
    }

    /** Downloads the APK and starts the install; Android asks the user to confirm. */
    fun install(context: Context) {
        val update = (state as? State.Available)?.update ?: return
        val app = context.applicationContext
        set(State.Downloading(update))
        worker.execute {
            try {
                val file = File(app.cacheDir, "update.apk")
                val request = Request.Builder().url(update.url).header("User-Agent", "NEXUS-Companion").build()
                Supabase.http.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) throw java.io.IOException("download gaf ${response.code}")
                    file.outputStream().use { out -> response.body!!.byteStream().copyTo(out) }
                }
                val installer = app.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                    setAppPackageName(app.packageName)
                }
                val sessionId = installer.createSession(params)
                installer.openSession(sessionId).use { session ->
                    session.openWrite("base.apk", 0, file.length()).use { out ->
                        file.inputStream().use { it.copyTo(out) }
                        session.fsync(out)
                    }
                    val intent = Intent(app, UpdateReceiver::class.java)
                    val pending = PendingIntent.getBroadcast(
                        app, sessionId, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                    )
                    session.commit(pending.intentSender)
                }
                main.post { set(State.Available(update)) }
            } catch (e: Exception) {
                set(State.Failed("Bijwerken lukte niet: ${e.message ?: e.javaClass.simpleName}"))
            }
        }
    }

    internal fun installFailed(message: String?) = set(State.Failed("Installeren lukte niet${message?.let { ": $it" } ?: "."}"))
}

/** Receives the installer's result; shows Android's confirmation screen when it asks for one. */
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = if (Build.VERSION.SDK_INT >= 33) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT)
                }
                confirm?.let { context.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            }
            PackageInstaller.STATUS_SUCCESS -> Unit // Android restarts the app on the new version.
            PackageInstaller.STATUS_FAILURE_ABORTED -> Unit // The user tapped Cancel.
            else -> Updater.installFailed(intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE))
        }
    }
}
