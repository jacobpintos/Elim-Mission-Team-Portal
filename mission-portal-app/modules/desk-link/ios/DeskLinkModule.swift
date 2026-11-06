import ExpoModulesCore
import Network

/// The church's sound desk (a Behringer X32), over its own Wi-Fi: one UDP
/// message out, and the desk's answer back (src/lib/mixer/link.ts).
///
/// The desk's Wi-Fi has no internet, so the phone may send everything else
/// over cellular. These messages never go over cellular: the desk is only
/// on the local network. The first one asks for the Local Network permission
/// (NSLocalNetworkUsageDescription, app.config.ts).
public class DeskLinkModule: Module {
  private let queue = DispatchQueue(label: "desk-link")

  public func definition() -> ModuleDefinition {
    Name("DeskLink")

    Function("isAvailable") { () -> Bool in
      return true
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
