package expo.modules.desklink

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The church's sound desk (a Behringer X32), over its own Wi-Fi: one UDP
 * message out, and the desk's answer back (src/lib/mixer/link.ts).
 *
 * The desk's Wi-Fi has no internet, so Android keeps using mobile data for
 * everything else. These messages are sent on the Wi-Fi network itself: the
 * desk is only there.
 */
class DeskLinkModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeskLink")

    Function("isAvailable") { true }

    /** Sends `message` to the desk and gives back its first answer, or null if none came in time. */
    AsyncFunction("exchange") Coroutine { host: String, port: Int, message: List<Int>, timeoutMs: Int ->
      withContext(Dispatchers.IO) { exchange(host, port, message, timeoutMs, true) }
    }

    /** Sends `message`, expecting no answer. */
    AsyncFunction("send") Coroutine { host: String, port: Int, message: List<Int> ->
      withContext(Dispatchers.IO) {
        exchange(host, port, message, 0, false)
        Unit
      }
    }
  }

  /** The Wi-Fi network, if the phone is on one. */
  private fun wifi(): Network? {
    val context = appContext.reactContext ?: return null
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return null
    @Suppress("DEPRECATION")
    return cm.allNetworks.firstOrNull {
      cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    }
  }

  private fun exchange(host: String, port: Int, message: List<Int>, timeoutMs: Int, wantAnswer: Boolean): List<Int>? {
    return try {
      DatagramSocket().use { socket ->
        wifi()?.bindSocket(socket)
        val bytes = ByteArray(message.size) { message[it].toByte() }
        socket.send(DatagramPacket(bytes, bytes.size, InetAddress.getByName(host), port))
        if (!wantAnswer) return null
        socket.soTimeout = maxOf(50, timeoutMs)
        val buffer = ByteArray(2048)
        val packet = DatagramPacket(buffer, buffer.size)
        try {
          socket.receive(packet)
          buffer.copyOf(packet.length).map { it.toInt() and 0xff }
        } catch (e: SocketTimeoutException) {
          null
        }
      }
    } catch (e: Exception) {
      // Not on the desk's Wi-Fi, or no such address: nothing answered.
      null
    }
  }
}
