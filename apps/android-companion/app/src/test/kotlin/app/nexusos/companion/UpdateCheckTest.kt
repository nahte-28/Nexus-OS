package app.nexusos.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UpdateCheckTest {
    private fun release(tag: String, asset: String = "nexus-companion.apk", draft: Boolean = false) =
        """{"tag_name":"$tag","draft":$draft,"prerelease":false,"assets":[{"name":"$asset","browser_download_url":"https://github.com/nahte-28/Nexus-OS/releases/download/$tag/$asset"}]}"""

    private val releases = "[" + listOf(
        release("companion-v0.8.12"),
        release("companion-v0.8.15"),
        release("companion-v0.8.20", draft = true),
        release("desktop-v0.8.30", "nexus-os-setup.exe"),
        release("companion-v0.8.18", "other.zip"),
    ).joinToString(",") + "]"

    @Test
    fun picksTheNewestPublishedApk() {
        val update = UpdateCheck.newest(releases, 10)!!
        assertEquals("0.8.15", update.version)
        assertEquals(15, update.build)
    }

    @Test
    fun nothingWhenAlreadyNewest() {
        assertNull(UpdateCheck.newest(releases, 15))
    }
    @Test
    fun theWatchTakesItsOwnApkFromTheSameRelease() {
        val tag = "companion-v1.0.41"
        val base = "https://github.com/nahte-28/Nexus-OS/releases/download/$tag"
        val both = """[{"tag_name":"$tag","draft":false,"prerelease":false,"assets":[{"name":"nexus-companion.apk","browser_download_url":"$base/nexus-companion.apk"},{"name":"nexus-watch.apk","browser_download_url":"$base/nexus-watch.apk"}]}]"""
        val update = UpdateCheck.newest(both, 40, UpdateCheck.apkFor("app.nexusos.watch"))!!
        assertEquals(41, update.build)
        assertEquals("$base/nexus-watch.apk", update.url)
        assertEquals("$base/nexus-companion.apk", UpdateCheck.newest(both, 40)!!.url)
        assertNull(UpdateCheck.newest(releases, 10, UpdateCheck.WATCH_APK))
        assertEquals(UpdateCheck.COMPANION_APK, UpdateCheck.apkFor("app.nexusos.companion"))
    }
}
