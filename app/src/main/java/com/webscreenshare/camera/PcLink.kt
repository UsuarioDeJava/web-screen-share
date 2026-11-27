package com.webscreenshare.camera

import android.net.Uri
import android.os.Build
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Porta padrão do app do PC pra câmera (veja PROTOCOLO.md). */
const val DEFAULT_PORT = 38219

class PcError(val status: Int, message: String) : IOException(message)

class Response(val status: Int, val body: String, val location: String?)

/** Conversa com o app de desktop na rede local. Chamadas bloqueantes: use fora da thread principal. */
object PcLink {

    /** "192.168.0.10" ou "192.168.0.10:1234" -> "192.168.0.10:porta". */
    fun normalize(input: String): String? {
        val s = input.trim().removePrefix("http://").trimEnd('/')
        val m = Regex("""^((?:\d{1,3}\.){3}\d{1,3})(?::(\d{1,5}))?$""").matchEntire(s) ?: return null
        if (m.groupValues[1].split('.').any { it.toInt() > 255 }) return null
        val port = m.groupValues[2].ifEmpty { DEFAULT_PORT.toString() }.toInt()
        if (port !in 1..65535) return null
        return "${m.groupValues[1]}:$port"
    }

    class Qr(val hosts: List<String>, val code: String)

    /** wsscam://pair?h=192.168.0.10,10.0.0.2&p=38219&c=CODIGO */
    fun parseQr(text: String): Qr? {
        val uri = runCatching { Uri.parse(text.trim()) }.getOrNull() ?: return null
        if (uri.scheme != "wsscam") return null
        val code = uri.getQueryParameter("c")?.takeIf { it.matches(Regex("^[A-Za-z0-9_-]{16,128}$")) } ?: return null
        val port = uri.getQueryParameter("p") ?: DEFAULT_PORT.toString()
        val hosts = (uri.getQueryParameter("h") ?: "").split(',').mapNotNull { normalize("$it:$port") }
        return if (hosts.isEmpty()) null else Qr(hosts, code)
    }

    private fun request(
        host: String, path: String, method: String = "GET", body: String? = null,
        type: String? = null, token: String? = null, connectMs: Int = 3000, readMs: Int = 10000,
    ): Response {
        val c = URL("http://$host$path").openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = connectMs
            c.readTimeout = readMs
            c.instanceFollowRedirects = false
            c.useCaches = false
            if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", type ?: "application/json")
                c.outputStream.use { it.write(body.toByteArray()) }
            }
            val status = c.responseCode
            val stream = if (status >= 400) c.errorStream else c.inputStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            return Response(status, text, c.getHeaderField("Location"))
        } finally {
            c.disconnect()
        }
    }

    private fun fail(r: Response, fallback: String): Nothing {
        val text = r.body.trim().takeIf { it.isNotEmpty() && it.length < 200 && !it.startsWith("{") && !it.startsWith("<") }
        throw PcError(r.status, text ?: fallback)
    }

    /** Nome do PC, se nesse endereço estiver o app. */
    fun info(host: String): String {
        val r = request(host, "/camera", connectMs = 2000, readMs = 3000)
        if (r.status != 200) fail(r, "Não é o app do PC")
        val json = JSONObject(r.body)
        if (json.optString("app") != "wss-camera") throw PcError(0, "Não é o app do PC")
        return json.optString("name", "PC")
    }

    class Pairing(val token: String, val name: String)

    /** Com código (QR) entra na hora; sem código, o PC pergunta e a resposta demora até ~60 s. */
    fun pair(host: String, code: String?): Pairing {
        val body = JSONObject().put("device", Build.MODEL ?: "Celular")
        if (code != null) body.put("code", code)
        val r = request(host, "/camera/pair", "POST", body.toString(), readMs = 70000)
        when (r.status) {
            200 -> {
                val json = JSONObject(r.body)
                val token = json.optString("token")
                if (!token.matches(Regex("^[A-Za-z0-9_-]{32,256}$"))) throw PcError(0, "Resposta inválida do PC")
                return Pairing(token, json.optString("name", "PC"))
            }
            403 -> fail(r, "Recusado no PC")
            408 -> fail(r, "Ninguém respondeu no PC")
            else -> fail(r, "Erro ${r.status}")
        }
    }

    /** WHIP: manda a oferta, recebe a resposta e o endereço da sessão. */
    fun publish(host: String, token: String, offer: String): Response {
        val r = request(host, "/camera/whip", "POST", offer, "application/sdp", token, readMs = 20000)
        if (r.status != 201) fail(r, when (r.status) {
            401 -> "Pareamento removido no PC"
            409 -> "Já tem uma transmissão do OBS"
            503 -> "Entre na sala no app do PC"
            else -> "Erro ${r.status}"
        })
        return r
    }

    fun stop(host: String, token: String, location: String) {
        val path = if (location.startsWith("/")) location else "/" + location.substringAfter("://").substringAfter('/')
        runCatching { request(host, path, "DELETE", token = token, readMs = 3000) }
    }
}
