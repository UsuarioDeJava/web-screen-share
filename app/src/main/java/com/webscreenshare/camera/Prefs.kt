package com.webscreenshare.camera

import android.content.Context

class Prefs(context: Context) {
    private val p = context.getSharedPreferences("wsscam", Context.MODE_PRIVATE)

    /** "ip:porta" do PC pareado. */
    var host: String?
        get() = p.getString("host", null)
        set(v) = p.edit().putString("host", v).apply()

    var token: String?
        get() = p.getString("token", null)
        set(v) = p.edit().putString("token", v).apply()

    var pcName: String?
        get() = p.getString("pcName", null)
        set(v) = p.edit().putString("pcName", v).apply()

    var front: Boolean
        get() = p.getBoolean("front", false)
        set(v) = p.edit().putBoolean("front", v).apply()

    var mic: Boolean
        get() = p.getBoolean("mic", false)
        set(v) = p.edit().putBoolean("mic", v).apply()

    var quality: Int
        get() = p.getInt("quality", 0)
        set(v) = p.edit().putInt("quality", v).apply()

    fun forget() = p.edit().remove("host").remove("token").remove("pcName").apply()
}

data class Quality(val label: String, val width: Int, val height: Int, val fps: Int, val bitrate: Int)

val QUALITIES = listOf(
    Quality("720p", 1280, 720, 30, 4_000_000),
    Quality("1080p", 1920, 1080, 30, 8_000_000),
    Quality("1080p60", 1920, 1080, 60, 12_000_000),
)
