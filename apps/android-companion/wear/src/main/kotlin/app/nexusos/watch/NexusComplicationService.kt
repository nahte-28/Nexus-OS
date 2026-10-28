package app.nexusos.watch

import android.app.PendingIntent
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService.ComplicationRequestListener
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import app.nexusos.companion.PlannedNotice

/** The next notice on the watch face: its time (short) or its time and title (long). */
class NexusComplicationService : ComplicationDataSourceService() {
    override fun onComplicationRequest(request: ComplicationRequest, listener: ComplicationRequestListener) {
        val now = System.currentTimeMillis()
        listener.onComplicationData(build(request.complicationType, Glance.coming(this, now).firstOrNull(), now))
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        build(type, PlannedNotice("preview", System.currentTimeMillis() + 3_600_000, "Labo indienen", null), System.currentTimeMillis())

    private fun build(type: ComplicationType, next: PlannedNotice?, now: Long): ComplicationData? {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, WatchActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val description = plain(next?.let { "${WatchFormat.at(it.at, now)}: ${it.title}" } ?: "Niets gepland in NEXUS")
        return when (type) {
            ComplicationType.SHORT_TEXT ->
                ShortTextComplicationData.Builder(plain(next?.let { WatchFormat.short(it.at, now) } ?: "–"), description)
                    .setTitle(plain(next?.title?.take(8) ?: "NEXUS"))
                    .setTapAction(open)
                    .build()
            ComplicationType.LONG_TEXT ->
                LongTextComplicationData.Builder(plain(next?.title ?: "Niets gepland"), description)
                    .setTitle(plain(next?.let { WatchFormat.at(it.at, now) } ?: "NEXUS"))
                    .setTapAction(open)
                    .build()
            else -> null
        }
    }

    private fun plain(text: String) = PlainComplicationText.Builder(text).build()
}
