package app.nexusos.companion

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.ExecutionException
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

/**
 * Everything the companion does with the account, on one background thread so token
 * refreshes and sends never race: signing in, keeping the device list, and forwarding.
 */
object Connect {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val listeners = CopyOnWriteArraySet<() -> Unit>()
    private const val DEVICES_MAX_AGE_MS = 10 * 60_000L

    /** Last forwarded content per notification key, so updates that change nothing are not resent. */
    private val lastSent = object : LinkedHashMap<String, Int>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Int>?) = size > 200
    }

    /** A message for the UI when something happened in the background (e.g. a revocation). */
    @Volatile
    var notice: String? = null

    fun addListener(listener: () -> Unit) = listeners.add(listener)
    fun removeListener(listener: () -> Unit) = listeners.remove(listener)
    private fun changed() = main.post { listeners.forEach { it() } }

    /** Lets the screen redraw after something changed elsewhere, e.g. the [Inbox] connection. */
    fun notifyChanged() = changed()

    /** Runs [work] on the worker thread and reports its error (or null) on the main thread. */
    private fun run(done: ((String?) -> Unit)?, work: () -> Unit) {
        worker.execute {
            val error = try {
                work()
                null
            } catch (e: ApiException) {
                e.message
            } catch (e: java.io.IOException) {
                "Geen verbinding met de server. Controleer je internet."
            } catch (e: Exception) {
                e.message ?: e.javaClass.simpleName
            }
            main.post { done?.invoke(error) }
            changed()
        }
    }

    fun signIn(context: Context, host: String, email: String, password: String, done: (String?) -> Unit) {
        val store = Store(context)
        run(done) {
            val (url, key) = Supabase.fetchConfig(host)
            val api = Supabase(url, key)
            val session = api.signIn(email.trim(), password)
            store.host = Supabase.normalizeHost(host)
            store.saveProject(url, key)
            store.saveSession(session)
            val id = UUID.randomUUID().toString()
            api.registerDevice(session.accessToken, id, deviceName(), DeviceKey.create())
            store.saveDeviceId(id)
            store.devices = api.listDevices(session.accessToken)
            notice = null
            Inbox.restart()
        }
    }

    fun refreshDevices(context: Context, done: ((String?) -> Unit)? = null) {
        val store = Store(context)
        if (!store.signedIn) return
        run(done) {
            loadDevices(store)
            api(store).touchDevice(token(store), store.deviceId!!)
        }
    }

    /** Signs out and revokes this phone, so it disappears from the active devices. */
    fun signOut(context: Context, done: (String?) -> Unit) {
        val store = Store(context)
        run(done) {
            try {
                if (store.signedIn) api(store).revokeDevice(token(store), store.deviceId!!)
            } catch (_: Exception) {
                // Offline or session expired: the phone can still be revoked from the pc.
            } finally {
                forget(store)
            }
        }
    }

    fun sendTest(context: Context, done: (String?) -> Unit) {
        val store = Store(context)
        val posted = PostedNotification(
            app = "nexus",
            appName = "NEXUS",
            title = "Testmelding van ${deviceName()}",
            text = "Als je dit leest, werkt NEXUS Connect. De inhoud was onderweg versleuteld.",
            postedAt = System.currentTimeMillis(),
        )
        run(done) {
            val sent = deliver(store, Policy.payload(posted, ShareMode.FULL, kind = "test")!!)
            if (sent == 0) throw IllegalStateException("Kies eerst minstens één apparaat bij \"Naar deze apparaten\".")
            store.addAudit(AuditEntry(System.currentTimeMillis(), "NEXUS (test)", ShareMode.FULL, "naar $sent apparaat(en)"))
        }
    }

    /**
     * Picks up the messages NEXUS sent to this phone, shows each as an Android notification
     * (which the watch mirrors) and deletes them from the server.
     */
    fun receive(context: Context, done: ((String?) -> Unit)? = null) {
        val store = Store(context)
        if (!store.signedIn) return
        val app = context.applicationContext
        run(done) {
            if (!store.signedIn) return@run
            val ownId = store.deviceId!!
            val messages = api(store).fetchMessages(token(store), ownId)
            if (messages.isEmpty()) return@run
            val key = DeviceKey.privateKey()
            val ownKey = DeviceKey.publicKey()
            val names = store.devices.associate { it.id to it.name }
            for (message in messages) {
                val plaintext = if (key == null || ownKey == null) {
                    null
                } else {
                    runCatching { ConnectCrypto.decryptWith(key, ownKey, ownId, message.envelope, "AndroidKeyStore") }.getOrNull()
                }
                // A message that cannot be read now never will be: it is deleted like the others.
                if (plaintext == null) continue
                val plan = Protocol.parsePlan(plaintext)
                if (plan != null) {
                    Safety.replacePlan(app, message.senderDeviceId, plan)
                    continue
                }
                val incoming = Protocol.parsePayload(plaintext) ?: continue
                // The safety net already showed it while NEXUS could not reach the phone.
                if (incoming.ref != null && !Safety.claim(app, incoming.ref)) continue
                Notifier.show(app, message.id, incoming, names[message.senderDeviceId])
                store.receivedAt = System.currentTimeMillis()
            }
            api(store).deleteMessages(token(store), messages.map { it.id })
        }
    }

    /** A valid access token for the [Inbox] connection. Blocks; never call it from the worker thread. */
    fun accessToken(context: Context): String {
        val store = Store(context)
        try {
            return worker.submit(Callable { token(store) }).get()
        } catch (e: ExecutionException) {
            throw e.cause ?: e
        }
    }

    /** Called by [RelayService] for every notification Android shows. */
    fun forward(context: Context, posted: PostedNotification, key: String) {
        val store = Store(context)
        store.noteApp(posted.app, posted.appName)
        if (!store.signedIn || store.paused) return
        val mode = store.mode(posted.app)
        val payload = Policy.payload(posted, mode) ?: return
        val fingerprint = payload.replace(Regex("\"postedAt\":\\d+"), "").hashCode()
        synchronized(lastSent) {
            if (lastSent[key] == fingerprint) return
            lastSent[key] = fingerprint
        }
        run(null) {
            val result = try {
                val sent = deliver(store, payload)
                if (sent == 0) "geen apparaat gekozen" else "naar $sent apparaat(en)"
            } catch (e: Exception) {
                "mislukt: ${e.message ?: e.javaClass.simpleName}"
            }
            store.addAudit(AuditEntry(System.currentTimeMillis(), posted.appName, mode, result))
        }
    }

    /**
     * Tells every NEXUS (browser or Windows app) on the account that [ref] was ticked off here. The
     * first one that is open marks it done, and it syncs from there.
     */
    fun tickOff(context: Context, ref: String, done: (String?) -> Unit) {
        val app = context.applicationContext
        sendToNexus(context, Protocol.actionPayload(ref, System.currentTimeMillis())) { error ->
            if (error == null) Safety.dismiss(app, ref)
            done(error)
        }
    }

    /** Encrypts [payload] for every NEXUS on a pc or in a browser on the account, not only the chosen ones. */
    fun sendToNexus(context: Context, payload: String, done: (String?) -> Unit) {
        val store = Store(context)
        run(done) {
            if (!store.signedIn) throw IllegalStateException("Log opnieuw in.")
            loadDevices(store)
            val ownId = store.deviceId ?: throw IllegalStateException("Log opnieuw in.")
            val targets = store.devices.filter { !it.revoked && it.id != ownId && it.platform != "android" }
            if (targets.isEmpty()) throw IllegalStateException("Er is nog geen NEXUS op een pc of in een browser gekoppeld.")
            send(store, targets, payload)
        }
    }

    /** Encrypts [payload] separately for each chosen device and uploads it. Returns how many. */
    private fun deliver(store: Store, payload: String): Int {
        if (!store.signedIn) return 0
        if (System.currentTimeMillis() - store.devicesAt > DEVICES_MAX_AGE_MS) loadDevices(store)
        if (!store.signedIn) return 0
        val ownId = store.deviceId!!
        val chosen = store.recipients
        val targets = store.devices.filter { it.id in chosen && !it.revoked && it.id != ownId && it.platform != "android" }
        if (targets.isEmpty()) return 0
        send(store, targets, payload)
        return targets.size
    }

    private fun send(store: Store, targets: List<RemoteDevice>, payload: String) {
        val ownId = store.deviceId!!
        val rows = JSONArray()
        for (device in targets) {
            val envelope = ConnectCrypto.encryptFor(device.publicKey, device.id, payload)
            rows.put(
                JSONObject()
                    .put("sender_device_id", ownId)
                    .put("recipient_device_id", device.id)
                    .put("ephemeral_key", envelope.ephemeralKey)
                    .put("iv", envelope.iv)
                    .put("ciphertext", envelope.ciphertext),
            )
        }
        api(store).sendMessages(token(store), rows)
    }

    private fun loadDevices(store: Store) {
        val devices = api(store).listDevices(token(store))
        val own = devices.find { it.id == store.deviceId }
        if (own == null || own.revoked) {
            forget(store)
            notice = "Deze gsm werd ingetrokken. Log opnieuw in om hem te koppelen."
            return
        }
        store.devices = devices
        // Drop choices for devices that no longer exist or were revoked.
        store.recipients = store.recipients.filter { id -> devices.any { it.id == id && !it.revoked } }.toSet()
    }

    private fun forget(store: Store) {
        store.clearAccount()
        Safety.clear(store.context)
        DeviceKey.delete()
        synchronized(lastSent) { lastSent.clear() }
        Inbox.restart()
    }

    private fun api(store: Store) = Supabase(store.supabaseUrl!!, store.anonKey!!)

    /** A valid access token, refreshed when it is about to expire. */
    private fun token(store: Store): String {
        val current = store.accessToken
        if (current != null && store.expiresAt - System.currentTimeMillis() > 60_000) return current
        val refresh = store.refreshToken ?: throw IllegalStateException("Log opnieuw in.")
        try {
            val session = api(store).refresh(refresh)
            store.saveSession(session)
            return session.accessToken
        } catch (e: ApiException) {
            if (e.status in 400..401) {
                forget(store)
                notice = "Je sessie is verlopen. Log opnieuw in."
            }
            throw e
        }
    }

    /** Added to the device name in NEXUS, e.g. "horloge" for the watch app. */
    @Volatile
    var kind: String? = null

    fun deviceName(): String {
        val maker = Build.MANUFACTURER.replaceFirstChar { it.uppercase() }
        val name = if (Build.MODEL.startsWith(maker, ignoreCase = true)) Build.MODEL else "$maker ${Build.MODEL}"
        return kind?.let { "$name ($it)" } ?: name
    }
}
