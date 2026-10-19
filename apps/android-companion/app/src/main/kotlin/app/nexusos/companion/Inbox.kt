package app.nexusos.companion

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.os.SystemClock
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/**
 * Keeps a Supabase Realtime connection open while Android runs the notification listener,
 * so messages from NEXUS reach the phone (and the watch) within seconds. Without it, messages
 * are still picked up whenever the app is opened.
 */
object Inbox {
    private val scheduler = Executors.newSingleThreadScheduledExecutor()
    private val backoffSeconds = longArrayOf(2, 5, 15, 30, 60)
    private const val HEARTBEAT_SECONDS = 25L

    private lateinit var app: Context
    private var wanted = false
    private var socket: WebSocket? = null
    private var heartbeat: ScheduledFuture<*>? = null
    private var retry: ScheduledFuture<*>? = null
    private var attempt = 0
    private var lastOpen = 0L
    private var ref = 0
    private var joinRef: String? = null
    private var sentToken: String? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    /** True while the subscription is live. */
    @Volatile
    var connected = false
        private set

    fun start(context: Context) {
        app = context.applicationContext
        scheduler.execute {
            if (wanted) return@execute
            wanted = true
            watchNetwork()
            open()
        }
    }

    fun stop() = scheduler.execute {
        wanted = false
        networkCallback?.let { app.getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(it) }
        networkCallback = null
        close()
    }

    /** Reconnects soon if the connection dropped, e.g. after the phone woke up. Cheap to call often. */
    fun poke() = scheduler.execute {
        if (wanted && socket == null && SystemClock.elapsedRealtime() - lastOpen > 10_000) open()
    }

    /** Starts over with the current account, after signing in or out. */
    fun restart() = scheduler.execute {
        close()
        attempt = 0
        if (wanted) open()
    }

    private fun open() {
        retry?.cancel(false)
        retry = null
        if (socket != null) return
        val store = Store(app)
        if (!store.signedIn) return
        lastOpen = SystemClock.elapsedRealtime()
        val token = try {
            Connect.accessToken(app)
        } catch (_: Exception) {
            scheduleRetry()
            return
        }
        val request = Request.Builder().url(Protocol.socketUrl(store.supabaseUrl!!, store.anonKey!!)).build()
        socket = Supabase.http.newWebSocket(request, Listener(store.deviceId!!, token))
    }

    private class Listener(private val deviceId: String, private val token: String) : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) = scheduler.execute {
            if (webSocket !== socket) return@execute
            val join = nextRef()
            joinRef = join
            sentToken = token
            webSocket.send(Protocol.joinFrame(deviceId, token, join))
            heartbeat = scheduler.scheduleWithFixedDelay(::beat, HEARTBEAT_SECONDS, HEARTBEAT_SECONDS, TimeUnit.SECONDS)
        }

        override fun onMessage(webSocket: WebSocket, text: String) = scheduler.execute {
            if (webSocket !== socket) return@execute
            when (Protocol.classify(text, joinRef)) {
                Protocol.Signal.JOINED -> {
                    attempt = 0
                    connected = true
                    Connect.receive(app)
                }
                Protocol.Signal.NEW_MESSAGE -> Connect.receive(app)
                Protocol.Signal.FAILED -> drop()
                Protocol.Signal.OTHER -> Unit
            }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = scheduler.execute {
            if (webSocket === socket) drop()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = scheduler.execute {
            if (webSocket === socket) drop()
        }
    }

    /** Keeps the connection alive and hands the server a fresh token before the old one expires. */
    private fun beat() {
        val current = socket ?: return
        current.send(Protocol.heartbeatFrame(nextRef()))
        val token = runCatching { Connect.accessToken(app) }.getOrNull() ?: return
        if (token != sentToken) {
            sentToken = token
            current.send(Protocol.tokenFrame(token, nextRef(), joinRef.orEmpty()))
        }
    }

    private fun drop() {
        close()
        scheduleRetry()
    }

    private fun close() {
        heartbeat?.cancel(false)
        heartbeat = null
        retry?.cancel(false)
        retry = null
        socket?.cancel()
        socket = null
        joinRef = null
        if (connected) {
            connected = false
            Connect.notifyChanged()
        }
    }

    private fun scheduleRetry() {
        if (!wanted || retry != null) return
        val delay = backoffSeconds[attempt.coerceAtMost(backoffSeconds.size - 1)]
        attempt++
        retry = scheduler.schedule(::open, delay, TimeUnit.SECONDS)
    }

    private fun watchNetwork() {
        if (networkCallback != null) return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = scheduler.execute {
                if (wanted && socket == null) {
                    attempt = 0
                    open()
                }
            }
        }
        app.getSystemService(ConnectivityManager::class.java)?.registerDefaultNetworkCallback(callback)
        networkCallback = callback
    }

    private fun nextRef(): String = (++ref).toString()
}
