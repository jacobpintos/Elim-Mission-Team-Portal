import ExpoModulesCore
import ShazamKit

/// Names the recording the microphone hears, by Shazam's catalogue.
///
/// One call listens until Shazam knows the song, is sure it does not, or the
/// time given runs out — whichever is first — and answers with its title and
/// artist, or nil. SHManagedSession does the recording itself; it needs
/// iOS 17, and on anything older this answers nil at once.
public class ShazamMatchModule: Module {
  // The session listening now, if any; held as AnyObject so the class can be
  // declared on iOS versions that have no SHManagedSession.
  private var current: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("ShazamMatch")

    Function("isAvailable") { () -> Bool in
      if #available(iOS 17.0, *) {
        return true
      }
      return false
    }

    AsyncFunction("match") { (timeoutSeconds: Double, promise: Promise) in
      guard #available(iOS 17.0, *) else {
        promise.resolve(nil)
        return
      }
      self.cancelCurrent()
      let session = SHManagedSession()
      self.current = session

      Task {
        let timeout = Task {
          try? await Task.sleep(nanoseconds: UInt64(max(timeoutSeconds, 1) * 1_000_000_000))
          if !Task.isCancelled {
            session.cancel()
          }
        }
        let result = await session.result()
        timeout.cancel()
        if self.current === session {
          self.current = nil
        }

        switch result {
        case .match(let match):
          var found: [String: Any] = [:]
          if let item = match.mediaItems.first {
            if let title = item.title {
              found["title"] = title
            }
            if let artist = item.artist {
              found["artist"] = artist
            }
          }
          promise.resolve(found.isEmpty ? nil : found)
        case .noMatch:
          promise.resolve(nil)
        case .error(let error, _):
          promise.reject("ERR_SHAZAM_MATCH", error.localizedDescription)
        @unknown default:
          promise.resolve(nil)
        }
      }
    }

    Function("cancel") {
      self.cancelCurrent()
    }
  }

  private func cancelCurrent() {
    if #available(iOS 17.0, *), let session = current as? SHManagedSession {
      session.cancel()
    }
    current = nil
  }
}
