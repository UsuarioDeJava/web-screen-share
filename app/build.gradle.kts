plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// -PappVersion=2.3.1 (o workflow passa a versão do release). versionCode cresce junto.
val appVersion = (findProperty("appVersion") as String?)?.removePrefix("v") ?: "0.1.0"
val versionParts = appVersion.split('.', '-').mapNotNull { it.toIntOrNull() } + listOf(0, 0, 0)
val appVersionCode = versionParts[0] * 10000 + versionParts[1] * 100 + versionParts[2]

android {
    namespace = "com.webscreenshare.camera"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.webscreenshare.camera"
        minSdk = 26
        targetSdk = 35
        versionCode = maxOf(1, appVersionCode)
        versionName = appVersion
    }

    // Chave fixa pra o Android aceitar as atualizações por cima. Se os secrets
    // ANDROID_KEYSTORE_* existirem no CI, eles têm prioridade.
    signingConfigs {
        create("release") {
            val custom = System.getenv("ANDROID_KEYSTORE_FILE")
            storeFile = file(custom ?: "camera.keystore")
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "wsscamera"
            keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "wsscamera"
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: "wsscamera"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("io.github.webrtc-sdk:android:144.7559.15")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
