import ExpoModulesCore
import Foundation
import Network

/// The church's equipment on the local network, over UDP:
///
/// - the sound desk (a Behringer X32): one message out, and its answer back
///   (`exchange`, `send`; src/lib/mixer/link.ts);
/// - the video switcher (a Blackmagic ATEM): a short conversation, many
///   datagrams each way (`open`, `sendTo`, `receive`, `close`;
///   src/lib/switcher/link.ts).
///
/// These networks may have no internet, so the phone may send everything
/// else over cellular. These messages never go over cellular: the equipment
/// is only on the local network. The first one asks for the Local Network
/// permission (NSLocalNetworkUsageDescription, app.config.ts).
public class DeskLinkModule: Module {
  private let queue = DispatchQueue(label: "desk-link")

  /// A conversation (`open`): its connection, what has come in and not yet
  /// been asked for, and a `receive` waiting for the next datagram.
  private final class Session {
    let connection: NWConnection
    var inbox: [Data] = []
    var waiting: (promise: Promise, timer: DispatchWorkItem)?
    init(connection: NWConnection) { self.connection = connection }
  }
  /// Only touched on `queue`.
  private var sessions: [Int: Session] = [:]
  private var nextSession = 1

  public func definition() -> ModuleDefinition {
    Name("DeskLink")

    Function("isAvailable") { () -> Bool in
      return true
    }

    /// The phone's own address on Wi-Fi and its network mask, for looking
    /// for the equipment on that network (src/lib/localNetwork.ts); null when
    /// it isn't on Wi-Fi.
    Function("localNetwork") { () -> [String: String]? in
      return DeskLinkModule.wifiAddress()
    }

    /// Sends `message` to the desk and resolves with its first answer, or
    /// null if none came within `timeoutMs`.
    AsyncFunction("exchange") { (host: String, port: Int, message: [Int], timeoutMs: Int, promise: Promise) in
      self.exchange(host: host, port: port, message: message, timeoutMs: timeoutMs, wantAnswer: true, promise: promise)
    }

    /// Sends `message`, expecting no answer: resolves once it's sent.
    AsyncFunction("send") { (host: String, port: Int, message: [Int], promise: Promise) in
      self.exchange(host: host, port: port, message: message, timeoutMs: 1000, wantAnswer: false, promise: promise)
    }

    /// Starts a conversation: resolves with its id once it can send, or null.
    AsyncFunction("open") { (host: String, port: Int, promise: Promise) in
      self.queue.async { self.openSession(host: host, port: port, promise: promise) }
    }

    /// Sends one datagram in a conversation: true once it's sent.
    AsyncFunction("sendTo") { (id: Int, message: [Int], promise: Promise) in
      self.queue.async {
        guard let session = self.sessions[id] else {
          promise.resolve(false)
          return
        }
        let data = Data(message.map { UInt8(truncatingIfNeeded: $0) })
        session.connection.send(content: data, completion: .contentProcessed { error in
          promise.resolve(error == nil)
        })
      }
    }

    /// The next datagram in a conversation, or null if none comes within `timeoutMs`.
    AsyncFunction("receive") { (id: Int, timeoutMs: Int, promise: Promise) in
      self.queue.async {
        guard let session = self.sessions[id] else {
          promise.resolve(nil)
          return
        }
        if !session.inbox.isEmpty {
          promise.resolve(session.inbox.removeFirst().map { Int($0) })
          return
        }
        if let earlier = session.waiting {
          earlier.timer.cancel()
          earlier.promise.resolve(nil)
        }
        let timer = DispatchWorkItem { [weak self] in
          guard let session = self?.sessions[id], let waiting = session.waiting else { return }
          session.waiting = nil
          waiting.promise.resolve(nil)
        }
        session.waiting = (promise, timer)
        self.queue.asyncAfter(deadline: .now() + .milliseconds(max(1, timeoutMs)), execute: timer)
      }
    }

    /// Ends a conversation.
    Function("close") { (id: Int) in
      self.queue.async { self.closeSession(id) }
    }
  }

  /// The IPv4 address and mask of en0, the Wi-Fi interface.
  private static func wifiAddress() -> [String: String]? {
    var list: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&list) == 0, let first = list else { return nil }
    defer { freeifaddrs(list) }
    let numeric = { (sa: UnsafeMutablePointer<sockaddr>) -> String in
      var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
      getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST)
      return String(cString: host)
    }
    for entry in sequence(first: first, next: { $0.pointee.ifa_next }) {
      let iface = entry.pointee
      guard let addr = iface.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET),
        String(cString: iface.ifa_name) == "en0", let mask = iface.ifa_netmask
      else { continue }
      return ["address": numeric(addr), "netmask": numeric(mask)]
    }
    return nil
  }

  private func openSession(host: String, port: Int, promise: Promise) {
    guard let nwPort = NWEndpoint.Port(rawValue: UInt16(clamping: port)) else {
      promise.resolve(nil)
      return
    }
    let params = NWParameters.udp
    params.prohibitedInterfaceTypes = [.cellular]
    let connection = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: params)
    let id = nextSession
    nextSession += 1
    sessions[id] = Session(connection: connection)
    var answered = false
    let answer: (Int?) -> Void = { value in
      if answered { return }
      answered = true
      if value == nil { self.closeSession(id) }
      promise.resolve(value)
    }
    connection.stateUpdateHandler = { state in
      switch state {
      case .ready:
        answer(id)
        self.receiveLoop(id)
      case .failed, .cancelled, .waiting:
        answer(nil)
      default:
        break
      }
    }
    connection.start(queue: queue)
    queue.asyncAfter(deadline: .now() + 2) { answer(nil) }
  }

  /// Takes in every datagram as it comes, for `receive`.
  private func receiveLoop(_ id: Int) {
    guard let session = sessions[id] else { return }
    session.connection.receiveMessage { [weak self] content, _, _, error in
      guard let self = self, let session = self.sessions[id] else { return }
      if let content = content, !content.isEmpty {
        if let waiting = session.waiting {
          session.waiting = nil
          waiting.timer.cancel()
          waiting.promise.resolve(content.map { Int($0) })
        } else {
          session.inbox.append(content)
        }
      }
      if error == nil { self.receiveLoop(id) }
    }
  }

  private func closeSession(_ id: Int) {
    guard let session = sessions.removeValue(forKey: id) else { return }
    if let waiting = session.waiting {
      waiting.timer.cancel()
      waiting.promise.resolve(nil)
    }
    session.connection.cancel()
  }

  private func exchange(host: String, port: Int, message: [Int], timeoutMs: Int, wantAnswer: Bool, promise: Promise) {
    guard let nwPort = NWEndpoint.Port(rawValue: UInt16(clamping: port)) else {
      promise.resolve(nil)
      return
    }
    let params = NWParameters.udp
    params.prohibitedInterfaceTypes = [.cellular]
    let connection = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: params)
    var finished = false
    // Everything below runs on `queue`, so `finished` needs no lock.
    let finish: ([Int]?) -> Void = { answer in
      if finished { return }
      finished = true
      connection.cancel()
      promise.resolve(answer)
    }
    connection.stateUpdateHandler = { state in
      switch state {
      case .ready:
        let data = Data(message.map { UInt8(truncatingIfNeeded: $0) })
        connection.send(content: data, completion: .contentProcessed { error in
          if error != nil || !wantAnswer {
            finish(nil)
            return
          }
          connection.receiveMessage { content, _, _, error in
            if let content = content, error == nil {
              finish(content.map { Int($0) })
            } else {
              finish(nil)
            }
          }
        })
      case .failed, .cancelled:
        finish(nil)
      case .waiting:
        // No way to the desk (not on its Wi-Fi, or Local Network not allowed).
        finish(nil)
      default:
        break
      }
    }
    connection.start(queue: queue)
    queue.asyncAfter(deadline: .now() + .milliseconds(max(50, timeoutMs))) {
      finish(nil)
    }
  }
}
