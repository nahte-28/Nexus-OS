package app.nexusos.watch

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
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
import app.nexusos.companion.DartsLeg
import app.nexusos.companion.DeviceKey
import app.nexusos.companion.GamingTimer
import app.nexusos.companion.WatchWeather
import app.nexusos.companion.PlanGaming
import app.nexusos.companion.Inbox
import app.nexusos.companion.Notifier
import app.nexusos.companion.Protocol
import app.nexusos.companion.Store
import app.nexusos.companion.Updater
import app.nexusos.companion.WatchDarts
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
        if (Updater.state is Updater.State.Idle) Updater.check(this)
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
        WatchWeather.load(this, now)?.let { w ->
            heading("Weer in ${w.place}", 15f)
            text(WatchWeather.line(w), bold = true)
            text(w.label, muted = true, size = 12f)
            space(12)
        }
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
        gaming(now)

        space(12)
        darts()

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
        updates()

        space(12)
        text("Aangemeld als ${store.email}", muted = true, size = 12f)
        DeviceKey.publicKey()?.let { text("Code: ${ConnectCrypto.fingerprint(it)}", muted = true, size = 12f) }
        button("Afmelden") {
            Inbox.stop()
            Connect.signOut(this) { status = null; render() }
        }
    }

    /**
     * Bijwerken: the newest nexus-watch.apk from the GitHub release, installed over this version
     * without the pc. The first time Android asks to allow installing apps from NEXUS.
     */
    private fun updates() {
        heading("Bijwerken", 15f)
        text("Versie ${packageManager.getPackageInfo(packageName, 0).versionName}", muted = true, size = 12f)
        when (val state = Updater.state) {
            Updater.State.Idle, Updater.State.Checking -> text("Zoeken naar een nieuwe versie…", muted = true, size = 12f)
            Updater.State.Current -> text("Je hebt de nieuwste versie.", muted = true, size = 12f)
            is Updater.State.Failed -> text(state.error, size = 12f)
            is Updater.State.Downloading -> text("Versie ${state.update.version} wordt gedownload…", size = 12f)
            is Updater.State.Available -> {
                text("Versie ${state.update.version} is er.", bold = true)
                if (!packageManager.canRequestPackageInstalls()) {
                    text("Sta eerst toe dat NEXUS apps installeert. Daarna kom je hier terug.", muted = true, size = 12f)
                    button("Toestaan", primary = true) {
                        startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                    }
                } else {
                    button("Bijwerken", primary = true) { Updater.install(this) }
                }
            }
        }
        if (Updater.state !is Updater.State.Available && Updater.state !is Updater.State.Downloading) {
            button("Zoeken naar updates") { Updater.check(this) }
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

    /**
     * The Gaming timer: start or stop it here, NEXUS keeps the time and switches to Gaming. The
     * Slaapbewaker's notices then come with the safety net, also when NEXUS is closed later.
     */
    private fun gaming(now: Long) {
        heading("Gaming", 15f)
        val state = GamingTimer.state(this)
        if (state == null) {
            text("Start de timer voor je laatste game. NEXUS zet Gaming aan en het horloge waarschuwt als je moet stoppen om genoeg te slapen.", muted = true, size = 12f)
            button(if (gamingBusy) "Bezig…" else "Gaming starten", primary = true) { sendGaming(start = true) }
        } else {
            text("${state.game} sinds ${WatchFormat.at(state.startedAt, now)}", bold = true)
            text(WatchFormat.duration(now - state.startedAt), muted = true, size = 12f)
            button(if (gamingBusy) "Bezig…" else "Stoppen") { sendGaming(start = false) }
        }
    }

    private var gamingBusy = false

    private fun sendGaming(start: Boolean) {
        if (gamingBusy) return
        gamingBusy = true
        val at = System.currentTimeMillis()
        Connect.sendToNexus(this, Protocol.gamingPayload(start, at)) { error ->
            gamingBusy = false
            if (error == null) {
                GamingTimer.setHere(this, if (start) PlanGaming("Gaming", at) else null, at)
                status = if (start) "Gestart. NEXUS zet Gaming aan zodra het op je pc of gsm openstaat." else "Gestopt. NEXUS zet de sessie in je logboek."
            } else {
                status = error
            }
            render()
        }
        render()
    }

    /**
     * Darts: a solo leg of 501 or 301 (double-out). Type the total of each visit; the watch shows
     * what is left and a checkout tip. When the leg ends it goes to NEXUS, into the stats of Darts.
     */
    private var dartsFinish: Int? = null
    private var dartsBusy = false

    private fun darts() {
        heading("Darts", 15f)
        val leg = WatchDarts.decode(dartsPrefs().getString("leg", null))
        if (leg == null || (leg.over && leg.sent && dartsFinish == null && dartsShowDone != leg.id)) {
            text("Tel een leg bij: tik na elke beurt het totaal van je drie pijlen in. Daarna staat ze in je Darts-statistieken in NEXUS.", muted = true, size = 12f)
            for (mode in WatchDarts.MODES) {
                button("$mode starten", primary = mode == WatchDarts.MODES.first()) {
                    saveLeg(DartsLeg(java.util.UUID.randomUUID().toString(), mode, System.currentTimeMillis()))
                    dartsFinish = null
                    render()
                }
            }
            return
        }
        if (leg.over) {
            text(if (leg.finished) "Uit in ${leg.dartsThrown} pijlen" else "Gestopt op ${leg.remaining}", bold = true)
            text("Gemiddelde ${"%.1f".format(leg.average)} per beurt", muted = true, size = 12f)
            if (!leg.sent) {
                button(if (dartsBusy) "Bezig…" else "Naar NEXUS sturen", primary = true) { sendLeg(leg) }
            } else {
                text("Staat in NEXUS.", muted = true, size = 12f)
            }
            button("Nieuwe leg") {
                dartsShowDone = null
                saveLeg(DartsLeg(java.util.UUID.randomUUID().toString(), leg.mode, System.currentTimeMillis()))
                render()
            }
            if (!leg.sent) button("Ongedaan maken") { saveLeg(WatchDarts.undo(leg)); render() }
            return
        }
        text("Nog ${leg.remaining}", bold = true, size = 22f)
        WatchDarts.checkout(leg.remaining)?.let { text("Tip: ${it.joinToString(" ")}", size = 13f) }
        if (leg.visits.isNotEmpty()) {
            text("Laatste: " + leg.visits.takeLast(3).joinToString(", ") { if (it.bust) "${it.score} bust" else "${it.score}" }, muted = true, size = 12f)
        }
        val pending = dartsFinish
        if (pending != null) {
            text("$pending uit! In hoeveel pijlen?", bold = true)
            val fewest = WatchDarts.checkout(pending)?.size ?: 3
            row((fewest..3).map { n -> "$n" to { addScore(leg, pending, n) } })
            button("Terug") { dartsFinish = null; render() }
            return
        }
        val score = input("Score van je beurt", 0).apply { inputType = InputType.TYPE_CLASS_NUMBER }
        button("Invoeren", primary = true) { enterScore(leg, score.text.toString()) }
        row(listOf(0, 26, 41).map { n -> "$n" to { enterScore(leg, "$n") } })
        row(listOf(45, 60, 81).map { n -> "$n" to { enterScore(leg, "$n") } })
        row(listOf(85, 100, 140).map { n -> "$n" to { enterScore(leg, "$n") } })
        row(listOf("180" to { enterScore(leg, "180") }, "↶" to { saveLeg(WatchDarts.undo(leg)); render() }))
        button("Stoppen") {
            if (leg.visits.isEmpty()) {
                dartsPrefs().edit().remove("leg").apply()
                render()
            } else {
                val stopped = leg.copy(stoppedAt = System.currentTimeMillis())
                saveLeg(stopped)
                sendLeg(stopped)
            }
        }
    }

    private var dartsShowDone: String? = null

    private fun enterScore(leg: DartsLeg, raw: String) {
        val score = raw.trim().toIntOrNull()
        if (score == null) {
            status = "Tik een score van 0 tot 180."
            render()
            return
        }
        if (WatchDarts.wouldFinish(leg, score)) {
            dartsFinish = score
            render()
            return
        }
        addScore(leg, score, 3)
    }

    private fun addScore(leg: DartsLeg, score: Int, darts: Int) {
        dartsFinish = null
        when (val r = WatchDarts.add(leg, score, darts)) {
            is WatchDarts.Result.Error -> status = r.message
            is WatchDarts.Result.Ok -> {
                status = null
                saveLeg(r.leg)
                if (r.leg.finished) {
                    dartsShowDone = r.leg.id
                    sendLeg(r.leg)
                    return
                }
            }
        }
        render()
    }

    private fun sendLeg(leg: DartsLeg) {
        if (dartsBusy) return
        dartsBusy = true
        dartsShowDone = leg.id
        Connect.sendToNexus(this, WatchDarts.payload(leg, System.currentTimeMillis())) { error ->
            dartsBusy = false
            if (error == null) {
                WatchDarts.decode(dartsPrefs().getString("leg", null))?.takeIf { it.id == leg.id }?.let { saveLeg(it.copy(sent = true)) }
                status = "De leg staat in NEXUS zodra het op je pc of gsm openstaat."
            } else {
                status = error
            }
            render()
        }
        render()
    }

    private fun dartsPrefs() = getSharedPreferences("darts", MODE_PRIVATE)

    private fun saveLeg(leg: DartsLeg) {
        dartsPrefs().edit().putString("leg", WatchDarts.encode(leg)).apply()
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

    /** Buttons side by side, for the quick scores. */
    private fun row(items: List<Pair<String, () -> Unit>>) {
        val line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for ((label, onClick) in items) {
            line.addView(
                Button(this).apply {
                    text = label
                    isAllCaps = false
                    minWidth = 0
                    minimumWidth = 0
                    setPadding(0, 0, 0, 0)
                    setOnClickListener { onClick() }
                },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(2); marginEnd = dp(2) },
            )
        }
        content.addView(line, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(4) })
    }
}
