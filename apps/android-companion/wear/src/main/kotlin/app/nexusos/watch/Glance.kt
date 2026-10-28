package app.nexusos.watch

import android.content.ComponentName
import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import app.nexusos.companion.PlannedNotice
import app.nexusos.companion.Safety

/** What the tile and the complication show: the coming notices of the safety plan. */
object Glance {
    fun coming(context: Context, now: Long = System.currentTimeMillis()): List<PlannedNotice> =
        Safety.load(context).pending().filter { it.at > now - Safety.grace }

    /** Asks Wear OS to redraw the tile and the complication, e.g. after a new plan arrived. */
    fun refresh(context: Context) {
        runCatching { TileService.getUpdater(context).requestUpdate(NexusTileService::class.java) }
        runCatching {
            ComplicationDataSourceUpdateRequester.create(context, ComponentName(context, NexusComplicationService::class.java)).requestUpdateAll()
        }
    }
}
