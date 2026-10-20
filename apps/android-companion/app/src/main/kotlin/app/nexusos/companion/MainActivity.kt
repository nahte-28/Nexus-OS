package app.nexusos.companion

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import java.text.DateFormat
import java.util.Date

/** Production address of the NEXUS web app; editable on the login screen. */
private const val DEFAULT_HOST = "nexus-os-lime.vercel.app"

/** One screen: log in, grant notification access, choose devices and apps, see the log. */
class MainActivity : Activity() {
    private lateinit var store: Store
    private lateinit var scroll: ScrollView
    private lateinit var content: LinearLayout
    private var status: String? = null
    private var busy = false
    private var askedNotifications = false
    private val onChange: () -> Unit = { render() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = Store(this)
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(32))
        }
        scroll = ScrollView(this).apply {
            addView(content)
            // Android 15 draws apps edge to edge: keep content clear of the status and navigation bars.
            setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                insets
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
        Connect.refreshDevices(this)
        Connect.receive(this)
        Inbox.poke()
        if (Updater.state is Updater.State.Idle) Updater.check(this)
    }

    override fun onPause() {
        Connect.removeListener(onChange)
        super.onPause()
    }

    private fun render() {
        val y = scroll.scrollY
        content.removeAllViews()
        heading("NEXUS Companion", 24f)
        text("Stuurt de meldingen die jij kiest end-to-end versleuteld naar je pc.", muted = true)
        Connect.notice?.let { space(); text(it) }
        if (store.signedIn) dashboard() else loginForm()
        scroll.post { scroll.scrollTo(0, y) }
    }

    private fun loginForm() {
        section("Inloggen")
        text("Gebruik hetzelfde account als in NEXUS op je pc.", muted = true)
        val host = input("Adres van je NEXUS-webapp", InputType.TYPE_TEXT_VARIATION_URI).apply {
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
                status = error
                render()
            }
            render()
        }
        status?.let { text(it) }
    }

    private fun dashboard() {
        text("Aangemeld als ${store.email}", muted = true)
        DeviceKey.publicKey()?.let { text("Code van deze gsm: ${ConnectCrypto.fingerprint(it)}", muted = true) }

        section("Meldingstoegang")
        val granted = getSystemService(NotificationManager::class.java)
            ?.isNotificationListenerAccessGranted(ComponentName(this, RelayService::class.java)) == true
        if (granted) {
            text("Meldingstoegang staat aan.")
        } else {
            text(
                "NEXUS heeft toegang tot je meldingen nodig. Staat de schakelaar grijs (beperkte instelling)? " +
                    "Open dan App-info, tik op ⋮ rechtsboven en kies \"Beperkte instellingen toestaan\".",
            )
            button("Meldingstoegang openen", primary = true) {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
            button("App-info openen") {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            }
        }
        content.addView(
            Switch(this).apply {
                text = "Doorsturen pauzeren"
                isChecked = store.paused
                setOnCheckedChangeListener { _, checked -> store.paused = checked }
                setPadding(0, dp(8), 0, dp(8))
            },
        )

        section("Naar deze apparaten")
        val ownId = store.deviceId
        val targets = store.devices.filter { !it.revoked && it.id != ownId && it.platform != "android" }
        if (targets.isEmpty()) {
            text("Nog geen pc of browser gekoppeld. Meld je aan in NEXUS op je pc en tik op Vernieuwen.", muted = true)
        } else {
            text("Vergelijk de code met die in Apparaten op je pc voor je een apparaat aanvinkt.", muted = true)
            for (device in targets) {
                content.addView(
                    CheckBox(this).apply {
                        text = "${device.name}\ncode ${ConnectCrypto.fingerprint(device.publicKey)}"
                        isChecked = device.id in store.recipients
                        setOnCheckedChangeListener { _, checked ->
                            store.recipients = if (checked) store.recipients + device.id else store.recipients - device.id
                        }
                        setPadding(dp(4), dp(6), 0, dp(6))
                    },
                )
            }
        }
        row {
            button("Vernieuwen", parent = it) { Connect.refreshDevices(this) { error -> status = error; render() } }
            button("Testmelding sturen", parent = it) {
                Connect.sendTest(this) { error ->
                    status = error ?: "Testmelding verstuurd. Kijk bij Meldingen op je pc."
                    render()
                }
            }
        }
        status?.let { text(it) }

        fromNexus(granted)

        section("Apps")
        text(
            "Elke app staat standaard uit. Kies per app wat je deelt. Codes in inlog- en verificatieberichten worden gemaskeerd.",
            muted = true,
        )
        val apps = store.seenApps().entries.sortedBy { it.value.lowercase() }
        if (apps.isEmpty()) text("Nog geen apps gezien. Ze verschijnen hier zodra ze een melding tonen.", muted = true)
        for ((app, appName) in apps) appRow(app, appName)

        updates()

        section("Logboek")
        text("Wat er werd doorgestuurd, zonder inhoud.", muted = true)
        val log = store.audit().take(15)
        if (log.isEmpty()) text("Nog niets doorgestuurd.", muted = true)
        val format = DateFormat.getTimeInstance(DateFormat.SHORT)
        for (entry in log) text("${format.format(Date(entry.at))} · ${entry.appName} · ${entry.mode.label.lowercase()} · ${entry.result}")

        space()
        button("Afmelden") {
            Connect.signOut(this) { status = null; render() }
        }
    }

    /** The other direction: what NEXUS on the pc sends to this phone and the watch. */
    private fun fromNexus(listenerGranted: Boolean) {
        section("Van NEXUS naar gsm en horloge")
        text(
            when {
                Inbox.connected -> "Live verbonden. Meldingen die je in NEXUS naar deze gsm stuurt, verschijnen meteen."
                listenerGranted -> "Even geen live verbinding. De companion probeert opnieuw, en wachtende meldingen komen ook binnen als je deze app opent."
                else -> "Zet meldingstoegang aan, dan blijft de companion op de achtergrond luisteren naar NEXUS."
            },
        )
        val received = store.receivedAt
        if (received > 0) {
            text("Laatste melding van NEXUS: ${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(received))}", muted = true)
        }
        if (!Notifier.enabled(this)) {
            text("Meldingen van de companion staan uit. Zet ze aan om berichten van NEXUS te zien.")
            button("Meldingen toestaan", primary = true) {
                val canAsk = Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                if (canAsk && !askedNotifications) {
                    askedNotifications = true
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
                } else {
                    startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
                }
            }
        }
        val power = getSystemService(PowerManager::class.java)
        if (power != null && !power.isIgnoringBatteryOptimizations(packageName)) {
            text("OxygenOS kan de verbinding verbreken om batterij te sparen. Sta de companion toe op de achtergrond te blijven.", muted = true)
            button("Batterijoptimalisatie uitzetten") {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            }
        }
        text(
            "Op je horloge verschijnen ze als de horloge-app meldingen van NEXUS Companion doorstuurt. " +
                "Zie je ze niet? Zet NEXUS Companion aan bij de meldingen in de OHealth-app.",
            muted = true,
        )
    }

    private fun updates() {
        section("Updates")
        when (val state = Updater.state) {
            Updater.State.Idle, Updater.State.Checking -> text("Zoeken naar een nieuwe versie…", muted = true)
            Updater.State.Current -> text("Je hebt de nieuwste versie.", muted = true)
            is Updater.State.Failed -> text(state.error)
            is Updater.State.Downloading -> text("Versie ${state.update.version} wordt gedownload…")
            is Updater.State.Available -> {
                text("Versie ${state.update.version} is beschikbaar. Je gegevens en instellingen blijven behouden.")
                button("Nu bijwerken", primary = true) {
                    if (packageManager.canRequestPackageInstalls()) {
                        Updater.install(this)
                    } else {
                        status = "Sta NEXUS Companion toe om apps te installeren en tik daarna opnieuw op Nu bijwerken."
                        startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                    }
                }
            }
        }
        if (Updater.state !is Updater.State.Available) {
            button("Zoeken naar updates") { Updater.check(this) }
        }
    }

    private fun appRow(app: String, appName: String) {
        row { line ->
            line.addView(
                TextView(this).apply { text = appName; textSize = 15f },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
            )
            val modes = ShareMode.entries
            line.addView(
                Spinner(this).apply {
                    adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, modes.map { it.label })
                    setSelection(modes.indexOf(store.mode(app)), false)
                    onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                        override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                            store.setMode(app, modes[position])
                        }

                        override fun onNothingSelected(parent: AdapterView<*>?) = Unit
                    }
                },
            )
        }
    }

    // Small view helpers for the programmatic layout.

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun heading(value: String, size: Float) {
        content.addView(TextView(this).apply { text = value; textSize = size; setTypeface(typeface, Typeface.BOLD) })
    }

    private fun section(title: String) {
        space()
        heading(title, 18f)
    }

    private fun space() {
        content.addView(View(this), LinearLayout.LayoutParams(1, dp(16)))
    }

    private fun text(value: String, muted: Boolean = false) {
        content.addView(
            TextView(this).apply {
                text = value
                textSize = 14f
                if (muted) alpha = 0.7f
                setPadding(0, dp(2), 0, dp(2))
            },
        )
    }

    private fun input(hint: String, variation: Int): EditText = EditText(this).apply {
        this.hint = hint
        inputType = InputType.TYPE_CLASS_TEXT or variation
        isSingleLine = true
        content.addView(this)
    }

    private fun button(label: String, primary: Boolean = false, parent: LinearLayout = content, onClick: () -> Unit) {
        val view = Button(this).apply {
            text = label
            isAllCaps = false
            if (primary) setTypeface(typeface, Typeface.BOLD)
            setOnClickListener { onClick() }
        }
        if (parent === content) parent.addView(view) else parent.addView(view, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    }

    private fun row(build: (LinearLayout) -> Unit) {
        val line = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        build(line)
        content.addView(line)
    }
}
