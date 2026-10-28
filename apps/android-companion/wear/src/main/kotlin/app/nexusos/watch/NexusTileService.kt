package app.nexusos.watch

import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

private const val RESOURCES_VERSION = "1"
private const val SHOWN = 3
private val WHITE = argb(0xFFFFFFFF.toInt())
private val MUTED = argb(0xFFB0B8C8.toInt())
private val ACCENT = argb(0xFF22D3EE.toInt())

/** A tile with the next few deadlines, reminders and appointments; tapping it opens the app. */
class NexusTileService : TileService() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val now = System.currentTimeMillis()
        val coming = Glance.coming(this, now)
        val column = LayoutElementBuilders.Column.Builder()
            .setWidth(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(text("NEXUS", 14f, ACCENT, bold = true))
            .addContent(space(6f))
        if (coming.isEmpty()) {
            column.addContent(text("Niets gepland", 15f, WHITE))
            column.addContent(text("Open NEXUS op je pc", 12f, MUTED))
        }
        for (n in coming.take(SHOWN)) {
            column.addContent(text(WatchFormat.at(n.at, now), 12f, MUTED))
            column.addContent(text(n.title, 14f, WHITE, bold = true))
            column.addContent(space(4f))
        }
        if (coming.size > SHOWN) column.addContent(text("en nog ${coming.size - SHOWN}", 12f, MUTED))

        val open = ModifiersBuilders.Clickable.Builder()
            .setId("open")
            .setOnClick(
                ActionBuilders.LaunchAction.Builder()
                    .setAndroidActivity(
                        ActionBuilders.AndroidActivity.Builder()
                            .setPackageName(packageName)
                            .setClassName(WatchActivity::class.java.name)
                            .build(),
                    )
                    .build(),
            )
            .build()
        val root = LayoutElementBuilders.Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setClickable(open)
                    .setPadding(
                        ModifiersBuilders.Padding.Builder()
                            .setStart(dp(24f)).setEnd(dp(24f)).setTop(dp(20f)).setBottom(dp(20f))
                            .build(),
                    )
                    .build(),
            )
            .addContent(column.build())
            .build()
        val tile = TileBuilders.Tile.Builder()
            .setResourcesVersion(RESOURCES_VERSION)
            // Times like "morgen" change, and notices go by: redraw at least every quarter.
            .setFreshnessIntervalMillis(15 * 60_000L)
            .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(root))
            .build()
        return Futures.immediateFuture(tile)
    }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        Futures.immediateFuture(ResourceBuilders.Resources.Builder().setVersion(RESOURCES_VERSION).build())

    private fun text(value: String, size: Float, color: androidx.wear.protolayout.ColorBuilders.ColorProp, bold: Boolean = false) =
        LayoutElementBuilders.Text.Builder()
            .setText(value)
            .setMaxLines(1)
            .setFontStyle(
                LayoutElementBuilders.FontStyle.Builder()
                    .setSize(sp(size))
                    .setColor(color)
                    .setWeight(if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD else LayoutElementBuilders.FONT_WEIGHT_NORMAL)
                    .build(),
            )
            .build()

    private fun space(height: Float) = LayoutElementBuilders.Spacer.Builder().setHeight(dp(height)).build()
}
