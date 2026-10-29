plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    // The same namespace as the companion, so the shared code below finds its resources (R).
    namespace = "app.nexusos.companion"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.nexusos.watch"
        // Android 12 (Wear OS 4 and newer): keystore keys for ECDH key agreement.
        minSdk = 31
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"
    }

    sourceSets["main"].apply {
        // The watch signs in, decrypts and keeps the safety net exactly like the companion: it
        // compiles the companion's code and adds its own screen. Unused classes (the notification
        // listener, the updater) are compiled too but not in the manifest, so they never run.
        java.srcDirs("../app/src/main/kotlin", "src/main/kotlin")
        res.srcDirs("../app/src/main/res")
    }

    signingConfigs {
        // The companion's fixed key, so every build installs over the previous one.
        getByName("debug") {
            storeFile = file("../app/nexus-dev.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // A tile and a watch-face complication with what is coming.
    implementation("androidx.wear.tiles:tiles:1.4.1")
    implementation("androidx.wear.protolayout:protolayout:1.2.1")
    implementation("androidx.wear.watchface:watchface-complications-data:1.2.1")
    implementation("androidx.wear.watchface:watchface-complications-data-source:1.2.1")
    implementation("com.google.guava:guava:33.3.1-android")
    testImplementation("junit:junit:4.13.2")
}
