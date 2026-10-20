package app.nexusos.companion

import org.json.JSONArray

/** A newer companion APK published on GitHub. */
data class AvailableUpdate(val version: String, val build: Int, val url: String)

/** Pure parsing of the GitHub releases list, so it can be unit tested without Android. */
object UpdateCheck {
    const val RELEASES_API = "https://api.github.com/repos/nahte-28/Nexus-OS/releases?per_page=30"
    /** Only APKs from this repository's companion releases are ever downloaded. */
    const val DOWNLOAD_PREFIX = "https://github.com/nahte-28/Nexus-OS/releases/download/companion-v"
    private const val TAG_PREFIX = "companion-v"
    private const val APK_NAME = "nexus-companion.apk"

    /**
     * The newest release with a higher build number than [currentBuild]. The build number is the
     * last part of the version (companion-v0.8.42 is build 42) and equals the app's versionCode.
     */
    fun newest(releasesJson: String, currentBuild: Int): AvailableUpdate? {
        val releases = JSONArray(releasesJson)
        var best: AvailableUpdate? = null
        for (i in 0 until releases.length()) {
            val release = releases.getJSONObject(i)
            if (release.optBoolean("draft") || release.optBoolean("prerelease")) continue
            val version = release.optString("tag_name").removePrefix(TAG_PREFIX)
            if (version == release.optString("tag_name")) continue
            val build = version.substringAfterLast('.').toIntOrNull() ?: continue
            if (build <= currentBuild || (best != null && build <= best.build)) continue
            val assets = release.optJSONArray("assets") ?: continue
            for (j in 0 until assets.length()) {
                val asset = assets.getJSONObject(j)
                val url = asset.optString("browser_download_url")
                if (asset.optString("name") == APK_NAME && url.startsWith(DOWNLOAD_PREFIX)) {
                    best = AvailableUpdate(version, build, url)
                }
            }
        }
        return best
    }
}
