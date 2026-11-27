package com.webscreenshare.camera

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera1Enumerator
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraEnumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RendererCommon
import org.webrtc.RtpParameters
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule
import java.util.concurrent.Executors

/**
 * Câmera + WebRTC. Publica por WHIP no app do PC (rede local, sem STUN/TURN).
 * Vídeo H.264 (packetization-mode=1), áudio Opus: o mesmo que o app do PC aceita do OBS.
 */
class Streamer(
    private val context: Context,
    private val renderer: SurfaceViewRenderer,
    private val onState: (State, String?) -> Unit,
) {
    enum class State { IDLE, CONNECTING, LIVE }

    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private val egl = EglBase.create()
    private val factory: PeerConnectionFactory
    private val enumerator: CameraEnumerator
    private val videoSource: VideoSource
    private val videoTrack: VideoTrack
    private var audioSource: AudioSource? = null
    private var audioTrack: AudioTrack? = null
    private var capturer: CameraVideoCapturer? = null
    private var helper: SurfaceTextureHelper? = null
    private var quality = QUALITIES[0]
    private var front = false

    private var pc: PeerConnection? = null
    private var attempt = 0
    private var host: String? = null
    private var token: String? = null
    private var location: String? = null

    init {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions()
        )
        val adm = JavaAudioDeviceModule.builder(context.applicationContext)
            .setUseHardwareAcousticEchoCanceler(true)
            .setUseHardwareNoiseSuppressor(true)
            .createAudioDeviceModule()
        factory = PeerConnectionFactory.builder()
            .setAudioDeviceModule(adm)
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl.eglBaseContext, false, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl.eglBaseContext))
            .createPeerConnectionFactory()
        adm.release()

        renderer.init(egl.eglBaseContext, null)
        renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
        renderer.setEnableHardwareScaler(true)

        enumerator = if (Camera2Enumerator.isSupported(context)) Camera2Enumerator(context) else Camera1Enumerator(true)
        videoSource = factory.createVideoSource(false)
        videoTrack = factory.createVideoTrack("camera", videoSource)
        videoTrack.addSink(renderer)
    }

    val hasFrontAndBack: Boolean
        get() = enumerator.deviceNames.any { enumerator.isFrontFacing(it) } &&
            enumerator.deviceNames.any { enumerator.isBackFacing(it) }

    private fun cameraName(front: Boolean): String? =
        enumerator.deviceNames.firstOrNull { if (front) enumerator.isFrontFacing(it) else enumerator.isBackFacing(it) }
            ?: enumerator.deviceNames.firstOrNull()

    fun startCamera(front: Boolean, quality: Quality) {
        this.front = front
        this.quality = quality
        if (capturer != null) return
        val name = cameraName(front) ?: return
        val cap = enumerator.createCapturer(name, null) ?: return
        val h = SurfaceTextureHelper.create("camera", egl.eglBaseContext)
        cap.initialize(h, context.applicationContext, videoSource.capturerObserver)
        cap.startCapture(quality.width, quality.height, quality.fps)
        capturer = cap
        helper = h
        renderer.setMirror(enumerator.isFrontFacing(name))
    }

    fun stopCamera() {
        capturer?.let { runCatching { it.stopCapture() }; it.dispose() }
        capturer = null
        helper?.dispose()
        helper = null
    }

    fun switchCamera(front: Boolean) {
        this.front = front
        val name = cameraName(front) ?: return
        capturer?.switchCamera(object : CameraVideoCapturer.CameraSwitchHandler {
            override fun onCameraSwitchDone(isFrontCamera: Boolean) { main.post { renderer.setMirror(isFrontCamera) } }
            override fun onCameraSwitchError(error: String?) {}
        }, name)
    }

    fun setQuality(q: Quality) {
        quality = q
        capturer?.changeCaptureFormat(q.width, q.height, q.fps)
        applyBitrate()
    }

    /** Com permissão, a faixa de áudio sempre existe (mudo = silêncio), pra ligar o mic no meio da transmissão. */
    fun setMic(on: Boolean, allowed: Boolean) {
        if (allowed && audioTrack == null) {
            val constraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            }
            audioSource = factory.createAudioSource(constraints)
            audioTrack = factory.createAudioTrack("mic", audioSource)
        }
        audioTrack?.setEnabled(on && allowed)
    }

    val live: Boolean get() = pc != null

    fun start(host: String, token: String) {
        if (pc != null) return
        this.host = host
        this.token = token
        val run = ++attempt
        onState(State.CONNECTING, null)

        val config = PeerConnection.RTCConfiguration(emptyList()).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
            tcpCandidatePolicy = PeerConnection.TcpCandidatePolicy.DISABLED
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_ONCE
        }
        val peer = factory.createPeerConnection(config, Observer(run)) ?: return fail(run, "WebRTC indisponível")
        pc = peer

        val video = peer.addTransceiver(
            videoTrack,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_ONLY, listOf("camera"))
        )
        val h264 = factory.getRtpSenderCapabilities(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO).codecs
            .filter { it.name.equals("H264", true) && it.parameters["packetization-mode"] == "1" }
            .sortedBy { if (it.parameters["profile-level-id"]?.startsWith("42e0") == true) 0 else 1 }
        if (h264.isEmpty()) return fail(run, "Este celular não tem codificador H.264")
        video.setCodecPreferences(h264)

        audioTrack?.let { track ->
            val audio = peer.addTransceiver(
                track,
                RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_ONLY, listOf("camera"))
            )
            val opus = factory.getRtpSenderCapabilities(MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO).codecs
                .filter { it.name.equals("opus", true) }
            if (opus.isNotEmpty()) audio.setCodecPreferences(opus)
        }

        peer.createOffer(object : Sdp() {
            override fun onCreateSuccess(desc: SessionDescription) {
                peer.setLocalDescription(object : Sdp() {
                    override fun onSetSuccess() {
                        // Sem trickle: espera os candidatos da rede local (rápido) e manda a oferta inteira.
                        main.postDelayed({ send(run) }, 2500)
                    }
                    override fun onSetFailure(error: String?) = fail(run, "Falha no WebRTC")
                }, desc)
            }
            override fun onCreateFailure(error: String?) = fail(run, "Falha no WebRTC")
        }, MediaConstraints())
    }

    private var sent = 0

    private fun send(run: Int) {
        val peer = pc ?: return
        if (run != attempt || sent == run) return
        sent = run
        val offer = peer.localDescription?.description ?: return fail(run, "Falha no WebRTC")
        val h = host ?: return
        val t = token ?: return
        io.execute {
            try {
                val r = PcLink.publish(h, t, offer)
                main.post {
                    if (run != attempt || pc !== peer) {
                        r.location?.let { loc -> io.execute { PcLink.stop(h, t, loc) } }
                        return@post
                    }
                    location = r.location
                    // Sem a extensão de orientação: o WebRTC gira os quadros antes de codificar.
                    val answer = r.body.lines().filterNot { it.contains("urn:3gpp:video-orientation") }
                        .joinToString("\r\n")
                    peer.setRemoteDescription(object : Sdp() {
                        override fun onSetSuccess() { main.post { applyBitrate() } }
                        override fun onSetFailure(error: String?) = fail(run, "O PC não aceitou o vídeo")
                    }, SessionDescription(SessionDescription.Type.ANSWER, answer))
                }
            } catch (e: PcError) {
                fail(run, e.message ?: "Erro", e.status)
            } catch (e: Exception) {
                fail(run, "Sem conexão com o PC")
            }
        }
    }

    /** Taxa fixa: o PC não manda estimativa de banda, então sem isso o vídeo ficaria em ~300 kbps. */
    private fun applyBitrate() {
        val peer = pc ?: return
        val sender = peer.transceivers.firstOrNull { it.mediaType == MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO }?.sender ?: return
        val params = sender.parameters
        params.degradationPreference = RtpParameters.DegradationPreference.MAINTAIN_FRAMERATE
        params.encodings.forEach {
            it.maxBitrateBps = quality.bitrate
            it.minBitrateBps = quality.bitrate / 2
            it.maxFramerate = quality.fps
        }
        sender.setParameters(params)
        peer.setBitrate(quality.bitrate / 2, quality.bitrate, quality.bitrate)
    }

    /** Erro de pareamento (401) faz a tela voltar pro pareamento. */
    var onUnauthorized: (() -> Unit)? = null

    private fun fail(run: Int, message: String, status: Int = 0) {
        main.post {
            if (run != attempt) return@post
            close()
            onState(State.IDLE, message)
            if (status == 401) onUnauthorized?.invoke()
        }
    }

    private fun close() {
        attempt++
        val peer = pc ?: return
        pc = null
        val h = host
        val t = token
        val loc = location
        location = null
        if (h != null && t != null && loc != null) io.execute { PcLink.stop(h, t, loc) }
        peer.dispose()
    }

    fun stop() {
        close()
        onState(State.IDLE, null)
    }

    fun release() {
        close()
        stopCamera()
        audioTrack?.dispose()
        audioSource?.dispose()
        videoTrack.dispose()
        videoSource.dispose()
        renderer.release()
        factory.dispose()
        egl.release()
        io.shutdown()
    }

    private inner class Observer(private val run: Int) : PeerConnection.Observer {
        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
            main.post {
                if (run != attempt) return@post
                when (newState) {
                    PeerConnection.PeerConnectionState.CONNECTED -> onState(State.LIVE, null)
                    PeerConnection.PeerConnectionState.FAILED,
                    PeerConnection.PeerConnectionState.DISCONNECTED -> fail(run, "A conexão com o PC caiu")
                    else -> {}
                }
            }
        }
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {
            if (state == PeerConnection.IceGatheringState.COMPLETE) main.post { send(run) }
        }
        override fun onSignalingChange(state: PeerConnection.SignalingState) {}
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {}
        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onIceCandidate(candidate: IceCandidate) {}
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
        override fun onAddStream(stream: MediaStream) {}
        override fun onRemoveStream(stream: MediaStream) {}
        override fun onDataChannel(channel: DataChannel) {}
        override fun onRenegotiationNeeded() {}
    }

    private open class Sdp : SdpObserver {
        override fun onCreateSuccess(desc: SessionDescription) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(error: String?) {}
        override fun onSetFailure(error: String?) {}
    }
}
