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
}
