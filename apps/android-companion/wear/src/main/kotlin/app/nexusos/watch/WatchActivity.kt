package app.nexusos.watch

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import app.nexusos.companion.Connect
import app.nexusos.companion.ConnectCrypto
import app.nexusos.companion.DeviceKey
import app.nexusos.companion.Inbox
import app.nexusos.companion.Notifier
import app.nexusos.companion.Protocol
import app.nexusos.companion.Store
import kotlin.math.roundToInt

/** Production address of the NEXUS web app; editable on the login screen. */
private const val DEFAULT_HOST = "nexus-os-lime.vercel.app"
private const val MAX_SHOWN = 20

/** One scrolling screen for a round display: log in, then the coming deadlines and reminders. */
class WatchActivity : Activity() {
    private lateinit var store: Store
    private lateinit var scroll: ScrollView
    private lateinit var content: LinearLayout
    private var status: String? = null
    private var busy = false
    private var ticking: String? = null
    private val onChange: () -> Unit = { render() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = Store(this)
        // Round screens cut off the corners: keep a margin of about a tenth of the width.
        val side = (resources.displayMetrics.widthPixels * 0.12).roundToInt()
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(side, dp(28), side, dp(40))
        }
        scroll = ScrollView(this).apply {
            addView(content)
            isFocusable = true
            isFocusableInTouchMode = true
            isVerticalScrollBarEnabled = true
            // The crown (rotary input) scrolls the screen.
            setOnGenericMotionListener { view, event ->
                if (event.action == MotionEvent.ACTION_SCROLL && event.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)) {
                    val delta = -event.getAxisValue(MotionEvent.AXIS_SCROLL) * ViewConfiguration.get(view.context).scaledVerticalScrollFactor
                    view.scrollBy(0, delta.roundToInt())
                    true
                } else {
                    false
                }
            }
        }
        setContentView(scroll)
        Notifier.ensureChannel(this)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        render()
    }

    override fun onResume() {
        super.onResume()
        Connect.addListener(onChange)
        render()
        scroll.requestFocus()
        if (store.signedIn) {
            Connect.refreshDevices(this)
            Connect.receive(this)
            // Live while the app is open; in the background the alarms fetch what NEXUS sent.
            Inbox.start(this)
        }
    }

    override fun onPause() {
        Connect.removeListener(onChange)
        Inbox.stop()
        super.onPause()
    }

    private fun render() {
        val y = scroll.scrollY
        content.removeAllViews()
        heading("NEXUS", 20f)
        Connect.notice?.let { text(it) }
        if (store.signedIn) overview() else loginForm()
        scroll.post { scroll.scrollTo(0, y) }
    }

    private fun loginForm() {
        text("Log in met je NEXUS-account. Je deadlines en herinneringen komen dan ook zonder gsm op je horloge.", muted = true)
        val host = input("Adres van NEXUS", InputType.TYPE_TEXT_VARIATION_URI).apply {
            setText(store.host?.removePrefix("https://") ?: DEFAULT_HOST)
        }
        val email = input("E-mailadres", InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS).apply { setText(store.email.orEmpty()) }
        val password = input("Wachtwoord", InputType.TYPE_TEXT_VARIATION_PASSWORD)
        button(if (busy) "Bezig…" else "Inloggen", primary = true) {
            if (busy) return@button
            busy = true
            status = null
            Connect.signIn(this, host.text.toString(), email.text.toString(), password.text.toString()) { error ->
                busy = false
                status = error ?: "Gekoppeld. Open NEXUS op je pc of gsm, dan komt je planning hierheen."
                if (error == null) Inbox.start(this)
                render()
            }
            render()
        }
        status?.let { text(it) }
    }

    private fun overview() {
        val now = System.currentTimeMillis()
        val coming = Glance.coming(this, now)
        heading("Komt eraan", 15f)
        if (coming.isEmpty()) {
            text("Niets gepland. Deadlines, herinneringen en afspraken die naar je gsm gaan, komen hier vanzelf bij zodra NEXUS openstaat.", muted = true)
        }
        for (n in coming.take(MAX_SHOWN)) {
            space(6)
            text(WatchFormat.at(n.at, now), muted = true, size = 12f)
            text(n.title, bold = true)
            n.text?.let { text(it.lineSequence().first(), muted = true, size = 12f) }
            if (Protocol.canTickOff(n.ref)) {
                button(if (ticking == n.ref) "Bezig…" else "✓ Afvinken") {
                    if (ticking != null) return@button
                    ticking = n.ref
                    Connect.tickOff(this, n.ref) { error ->
                        ticking = null
                        status = error ?: "Afgevinkt. NEXUS werkt het bij zodra het op je pc of gsm openstaat."
                        Glance.refresh(this)
                        render()
                    }
                    render()
                }
            }
        }
        if (coming.size > MAX_SHOWN) text("en nog ${coming.size - MAX_SHOWN}", muted = true)

        space(12)
        focus(now)

        space(12)
        text(if (Inbox.connected) "Live verbonden met NEXUS." else "Haalt elk halfuur op wat NEXUS stuurde.", muted = true, size = 12f)
        if (!Notifier.enabled(this)) {
            text("Meldingen staan uit, dus het horloge kan je niet waarschuwen.")
            button("Meldingen aanzetten", primary = true) {
                startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
            }
        }
        button(if (busy) "Bezig…" else "Vernieuwen") {
            if (busy) return@button
            busy = true
            Connect.receive(this) { error ->
                busy = false
                status = error
                render()
            }
            render()
        }
        status?.let { text(it) }

        space(12)
        text("Aangemeld als ${store.email}", muted = true, size = 12f)
        DeviceKey.publicKey()?.let { text("Code: ${ConnectCrypto.fingerprint(it)}", muted = true, size = 12f) }
        button("Afmelden") {
            Inbox.stop()
            Connect.signOut(this) { status = null; render() }
        }
    }

    /** The focus timer: start, see what phase runs until when, stop. */
    private fun focus(now: Long) {
        heading("Focus", 15f)
        val state = Focus.state(this)
        if (state == null) {
            text("${Focus.FOCUS_MIN} min focus, ${Focus.PAUSE_MIN} min pauze, tot je stopt. Het horloge trilt bij elke wissel en telt je focustijd mee in NEXUS.", muted = true, size = 12f)
            button("Focus starten", primary = true) {
                Focus.start(this)
                render()
            }
        } else {
            val phase = if (state.phase == Focus.Phase.FOCUS) "Focus" else "Pauze"
            text("$phase tot ${WatchFormat.at(state.endsAt, now)}", bold = true)
            button("Stoppen") {
                Focus.stop(this)
                render()
            }
        }
    }

    // Small view helpers for the programmatic layout.

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun heading(value: String, size: Float) {
        content.addView(
            TextView(this).apply {
                text = value
                textSize = size
                gravity = Gravity.CENTER
                setTypeface(typeface, Typeface.BOLD)
                setPadding(0, dp(4), 0, dp(4))
            },
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
        )
    }

    private fun space(height: Int) {
        content.addView(View(this), LinearLayout.LayoutParams(1, dp(height)))
    }

    private fun text(value: String, muted: Boolean = false, bold: Boolean = false, size: Float = 14f) {
        content.addView(
            TextView(this).apply {
                text = value
                textSize = size
                if (muted) alpha = 0.7f
                if (bold) setTypeface(typeface, Typeface.BOLD)
                setPadding(0, dp(1), 0, dp(1))
            },
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
        )
    }

    private fun input(hint: String, variation: Int): EditText = EditText(this).apply {
        this.hint = hint
        inputType = InputType.TYPE_CLASS_TEXT or variation
        isSingleLine = true
        textSize = 14f
        content.addView(this, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }

    private fun button(label: String, primary: Boolean = false, onClick: () -> Unit) {
        content.addView(
            Button(this).apply {
                text = label
                isAllCaps = false
                if (primary) setTypeface(typeface, Typeface.BOLD)
                setOnClickListener { onClick() }
            },
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(6) },
        )
    }
}
