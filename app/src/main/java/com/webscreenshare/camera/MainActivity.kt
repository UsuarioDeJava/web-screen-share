package com.webscreenshare.camera

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.webrtc.SurfaceViewRenderer
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private val io = Executors.newSingleThreadExecutor()
    private var streamer: Streamer? = null
    private var pairing = 0

    private lateinit var pairView: View
    private lateinit var streamView: View
    private lateinit var ip: EditText
    private lateinit var scan: Button
    private lateinit var connect: Button
    private lateinit var cancelPair: Button
    private lateinit var pairStatus: TextView
    private lateinit var preview: SurfaceViewRenderer
    private lateinit var state: TextView
    private lateinit var pcName: TextView
    private lateinit var error: TextView
    private lateinit var camera: Button
    private lateinit var mic: Button
    private lateinit var quality: Button
    private lateinit var toggle: Button

    private val scanner = registerForActivityResult(ScanContract()) { result ->
        val text = result.contents ?: return@registerForActivityResult
        val qr = PcLink.parseQr(text)
        if (qr == null) pairStatus.text = "QR code não é do app do PC" else pairWith(qr.hosts, qr.code)
    }

    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        if (granted(Manifest.permission.CAMERA)) openCamera() else showError(getString(R.string.no_camera))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)
        pairView = findViewById(R.id.pair)
        streamView = findViewById(R.id.stream)
        ip = findViewById(R.id.ip)
        scan = findViewById(R.id.scan)
        connect = findViewById(R.id.connect)
        cancelPair = findViewById(R.id.cancelPair)
        pairStatus = findViewById(R.id.pairStatus)
        preview = findViewById(R.id.preview)
        state = findViewById(R.id.state)
        pcName = findViewById(R.id.pcName)
        error = findViewById(R.id.error)
        camera = findViewById(R.id.camera)
        mic = findViewById(R.id.mic)
        quality = findViewById(R.id.quality)
        toggle = findViewById(R.id.toggle)

        scan.setOnClickListener {
            scanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("")
                .setBeepEnabled(false).setOrientationLocked(false))
        }
        connect.setOnClickListener { connectByIp() }
        ip.setOnEditorActionListener { _, action, event ->
            if (action == EditorInfo.IME_ACTION_GO || event?.keyCode == KeyEvent.KEYCODE_ENTER) { connectByIp(); true } else false
        }
        cancelPair.setOnClickListener { pairing++; setPairBusy(false, "") }

        camera.setOnClickListener {
            prefs.front = !prefs.front
            streamer?.switchCamera(prefs.front)
            renderButtons()
        }
        mic.setOnClickListener {
            if (!granted(Manifest.permission.RECORD_AUDIO)) {
                permissions.launch(arrayOf(Manifest.permission.RECORD_AUDIO))
                return@setOnClickListener
            }
            prefs.mic = !prefs.mic
            streamer?.setMic(prefs.mic, true)
            renderButtons()
        }
        quality.setOnClickListener {
            prefs.quality = (prefs.quality + 1) % QUALITIES.size
            streamer?.setQuality(QUALITIES[prefs.quality])
            renderButtons()
        }
        toggle.setOnClickListener {
            val s = streamer ?: return@setOnClickListener
            if (s.live) s.stop() else {
                val host = prefs.host
                val token = prefs.token
                if (host == null || token == null) return@setOnClickListener showPair()
                error.visibility = View.GONE
                s.start(host, token)
            }
        }
        findViewById<Button>(R.id.forget).setOnClickListener {
            streamer?.stop()
            prefs.forget()
            showPair()
        }

        if (prefs.token != null && prefs.host != null) showStream() else showPair()
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    // ---------- pareamento ----------

    private fun showPair() {
        closeCamera()
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        streamView.visibility = View.GONE
        pairView.visibility = View.VISIBLE
        prefs.host?.substringBefore(':')?.let { if (ip.text.isEmpty()) ip.setText(it) }
    }

    private fun setPairBusy(busy: Boolean, text: String) {
        scan.isEnabled = !busy
        connect.isEnabled = !busy
        ip.isEnabled = !busy
        cancelPair.visibility = if (busy) View.VISIBLE else View.GONE
        pairStatus.text = text
    }

    private fun connectByIp() {
        val host = PcLink.normalize(ip.text.toString())
        if (host == null) { pairStatus.text = "IP inválido"; return }
        pairWith(listOf(host), null)
    }

    private fun pairWith(hosts: List<String>, code: String?) {
        val run = ++pairing
        setPairBusy(true, getString(R.string.connecting))
        io.execute {
            var host: String? = null
            for (h in hosts) {
                if (runCatching { PcLink.info(h) }.isSuccess) { host = h; break }
            }
            if (host == null) {
                runOnUiThread { if (run == pairing) setPairBusy(false, "PC não encontrado. App aberto e no mesmo Wi-Fi?") }
                return@execute
            }
            if (code == null) runOnUiThread { if (run == pairing) pairStatus.text = getString(R.string.waiting_pc) }
            val result = runCatching { PcLink.pair(host, code) }
            runOnUiThread {
                if (run != pairing) return@runOnUiThread
                result.onSuccess {
                    prefs.host = host
                    prefs.token = it.token
                    prefs.pcName = it.name
                    setPairBusy(false, "")
                    showStream()
                }.onFailure {
                    setPairBusy(false, if (it is PcError) it.message ?: "Erro" else "Sem conexão com o PC")
                }
            }
        }
    }

    // ---------- câmera ----------

    private fun showStream() {
        pairView.visibility = View.GONE
        streamView.visibility = View.VISIBLE
        pcName.text = prefs.pcName ?: prefs.host
        error.visibility = View.GONE
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        renderButtons()
        val missing = listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO).filterNot(::granted)
        if (missing.isEmpty()) openCamera() else permissions.launch(missing.toTypedArray())
    }

    private fun openCamera() {
        if (streamView.visibility != View.VISIBLE) return
        val s = streamer ?: Streamer(this, preview) { st, message -> renderState(st, message) }.also {
            it.onUnauthorized = { prefs.forget(); showPair(); pairStatus.text = "Pareamento removido no PC" }
            streamer = it
        }
        s.setMic(prefs.mic, granted(Manifest.permission.RECORD_AUDIO))
        s.startCamera(prefs.front, QUALITIES[prefs.quality])
        camera.isEnabled = s.hasFrontAndBack
        renderButtons()
    }

    private fun closeCamera() {
        streamer?.release()
        streamer = null
    }

    private fun renderState(st: Streamer.State, message: String?) {
        when (st) {
            Streamer.State.IDLE -> { state.text = getString(R.string.ready); state.setTextColor(getColor(R.color.text)) }
            Streamer.State.CONNECTING -> { state.text = getString(R.string.connecting); state.setTextColor(getColor(R.color.text)) }
            Streamer.State.LIVE -> { state.text = getString(R.string.live); state.setTextColor(getColor(R.color.live)) }
        }
        if (message != null) showError(message)
        renderButtons()
    }

    private fun showError(message: String) {
        error.text = message
        error.visibility = View.VISIBLE
    }

    private fun renderButtons() {
        val live = streamer?.live == true
        camera.text = getString(if (prefs.front) R.string.front_cam else R.string.back_cam)
        mic.text = getString(if (prefs.mic && granted(Manifest.permission.RECORD_AUDIO)) R.string.mic_on else R.string.mic_off)
        quality.text = QUALITIES[prefs.quality].label
        toggle.text = getString(if (live) R.string.stop else R.string.start)
        toggle.isSelected = live
    }

    override fun onStart() {
        super.onStart()
        if (streamView.visibility == View.VISIBLE && streamer == null && granted(Manifest.permission.CAMERA)) openCamera()
    }

    // Em segundo plano o Android corta a câmera: encerra a transmissão.
    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) closeCamera()
    }

    override fun onDestroy() {
        closeCamera()
        io.shutdown()
        super.onDestroy()
    }
}
