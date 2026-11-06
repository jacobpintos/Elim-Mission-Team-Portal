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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The church's equipment on the local network, over UDP:
 *
 * - the sound desk (a Behringer X32): one message out, and its answer back
 *   (`exchange`, `send`; src/lib/mixer/link.ts);
 * - the video switcher (a Blackmagic ATEM): a short conversation, many
 *   datagrams each way (`open`, `sendTo`, `receive`, `close`;
 *   src/lib/switcher/link.ts).
 *
 * These networks may have no internet, so Android keeps using mobile data
 * for everything else. These messages are sent on the Wi-Fi network itself:
 * the equipment is only there.
 */
class DeskLinkModule : Module() {
  /** Conversations (`open`), by id. */
  private val sessions = ConcurrentHashMap<Int, DatagramSocket>()
  private val nextSession = AtomicInteger(1)

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

    /** Starts a conversation: its id, or null if it can't be. */
    AsyncFunction("open") Coroutine { host: String, port: Int ->
      withContext(Dispatchers.IO) {
        try {
          val socket = DatagramSocket()
          wifi()?.bindSocket(socket)
          socket.connect(InetAddress.getByName(host), port)
          val id = nextSession.getAndIncrement()
          sessions[id] = socket
          id
        } catch (e: Exception) {
          null
        }
      }
    }

    /** Sends one datagram in a conversation: true once it's sent. */
    AsyncFunction("sendTo") Coroutine { id: Int, message: List<Int> ->
      withContext(Dispatchers.IO) {
        val socket = sessions[id] ?: return@withContext false
        try {
          val bytes = ByteArray(message.size) { message[it].toByte() }
          socket.send(DatagramPacket(bytes, bytes.size))
          true
        } catch (e: Exception) {
          false
        }
      }
    }

    /** The next datagram in a conversation, or null if none comes within `timeoutMs`. */
    AsyncFunction("receive") Coroutine { id: Int, timeoutMs: Int ->
      withContext(Dispatchers.IO) {
        val socket = sessions[id] ?: return@withContext null
        try {
          socket.soTimeout = maxOf(1, timeoutMs)
          val buffer = ByteArray(2048)
          val packet = DatagramPacket(buffer, buffer.size)
          socket.receive(packet)
          buffer.copyOf(packet.length).map { it.toInt() and 0xff }
        } catch (e: Exception) {
          null
        }
      }
    }

    /** Ends a conversation. */
    Function("close") { id: Int ->
      sessions.remove(id)?.close()
      Unit
    }

    OnDestroy {
      sessions.values.forEach { it.close() }
      sessions.clear()
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
