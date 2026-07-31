import Foundation
import Network
import OSLog

enum LocalWebServerError: LocalizedError {
    case missingWebRoot(URL)
    case listenerFailed(String)

    var errorDescription: String? {
        switch self {
        case let .missingWebRoot(url):
            "Bundled web app is missing at \(url.path)"
        case let .listenerFailed(message):
            "Local web server failed: \(message)"
        }
    }
}

/**
 * Tiny loopback-only static server.
 *
 * Vite's production build uses root-relative audio and sketchbook URLs. Serving
 * the bundle over a random localhost port preserves those URLs, gives WebKit a
 * stable origin for localStorage, and avoids spawning a Node/Python child.
 */
final class LocalWebServer: @unchecked Sendable {
    private let root: URL
    private let queue = DispatchQueue(label: "com.grey.cheetahandpeach.webserver")
    private let logger = Logger(
        subsystem: "com.grey.cheetahandpeach",
        category: "webserver"
    )
    private var listener: NWListener?

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    func start(completion: @escaping @Sendable (Result<URL, Error>) -> Void) {
        queue.async { [weak self] in
            guard let self else { return }
            guard FileManager.default.fileExists(atPath: self.root.path) else {
                completion(.failure(LocalWebServerError.missingWebRoot(self.root)))
                return
            }

            do {
                let parameters = NWParameters.tcp
                parameters.allowLocalEndpointReuse = true
                parameters.requiredLocalEndpoint = .hostPort(
                    host: "127.0.0.1",
                    port: .any
                )

                let listener = try NWListener(using: parameters)
                self.listener = listener
                listener.newConnectionHandler = { [weak self] connection in
                    self?.handle(connection)
                }
                listener.stateUpdateHandler = { [weak self] state in
                    guard let self else { return }
                    switch state {
                    case .ready:
                        guard let port = listener.port,
                              let url = URL(string: "http://127.0.0.1:\(port.rawValue)/")
                        else {
                            completion(.failure(
                                LocalWebServerError.listenerFailed("listener has no port")
                            ))
                            return
                        }
                        self.logger.info("Serving bundled game on loopback port \(port.rawValue)")
                        completion(.success(url))
                    case let .failed(error):
                        completion(.failure(
                            LocalWebServerError.listenerFailed(error.localizedDescription)
                        ))
                    default:
                        break
                    }
                }
                listener.start(queue: self.queue)
            } catch {
                completion(.failure(error))
            }
        }
    }

    func stop() {
        queue.async { [weak self] in
            self?.listener?.cancel()
            self?.listener = nil
        }
    }

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(
            minimumIncompleteLength: 1,
            maximumLength: 32 * 1024
        ) { [weak self] data, _, _, error in
            guard let self else {
                connection.cancel()
                return
            }
            guard error == nil,
                  let data,
                  let request = String(data: data, encoding: .utf8)
            else {
                connection.cancel()
                return
            }
            self.respond(to: request, on: connection)
        }
    }

    private func respond(to request: String, on connection: NWConnection) {
        let lines = request.components(separatedBy: "\r\n")
        let first = lines.first?.split(separator: " ") ?? []
        guard first.count >= 2, first[0] == "GET" || first[0] == "HEAD" else {
            send(status: "405 Method Not Allowed", body: Data(), type: "text/plain", on: connection)
            return
        }

        let rawTarget = String(first[1])
        let pathOnly = rawTarget.split(separator: "?", maxSplits: 1).first.map(String.init) ?? "/"
        let decoded = pathOnly.removingPercentEncoding ?? pathOnly
        let relative = decoded == "/" ? "index.html" : String(decoded.drop(while: { $0 == "/" }))
        guard !relative.contains("..") else {
            send(status: "403 Forbidden", body: Data(), type: "text/plain", on: connection)
            return
        }

        let file = root.appendingPathComponent(relative).standardizedFileURL
        let allowedPrefix = root.path.hasSuffix("/") ? root.path : root.path + "/"
        guard file.path.hasPrefix(allowedPrefix),
              let fullData = try? Data(contentsOf: file)
        else {
            send(status: "404 Not Found", body: Data(), type: "text/plain", on: connection)
            return
        }

        let rangeHeader = lines.first {
            $0.lowercased().hasPrefix("range:")
        }
        let wantsBody = first[0] == "GET"

        if let range = parseRange(rangeHeader, length: fullData.count) {
            let body = fullData.subdata(in: range)
            let extra = [
                "Accept-Ranges: bytes",
                "Content-Range: bytes \(range.lowerBound)-\(range.upperBound - 1)/\(fullData.count)",
            ]
            send(
                status: "206 Partial Content",
                body: wantsBody ? body : Data(),
                declaredLength: body.count,
                type: mimeType(for: file.pathExtension),
                extraHeaders: extra,
                on: connection
            )
        } else {
            send(
                status: "200 OK",
                body: wantsBody ? fullData : Data(),
                declaredLength: fullData.count,
                type: mimeType(for: file.pathExtension),
                extraHeaders: ["Accept-Ranges: bytes"],
                on: connection
            )
        }
    }

    private func parseRange(_ header: String?, length: Int) -> Range<Int>? {
        guard let header,
              let value = header.split(separator: ":", maxSplits: 1).last?
                .trimmingCharacters(in: .whitespaces),
              value.hasPrefix("bytes=")
        else { return nil }

        let bounds = value.dropFirst(6).split(separator: "-", maxSplits: 1)
        guard let startText = bounds.first,
              let start = Int(startText),
              start >= 0,
              start < length
        else { return nil }

        let requestedEnd = bounds.count > 1 ? Int(bounds[1]) : nil
        let end = min(length, (requestedEnd ?? (length - 1)) + 1)
        return start..<max(start, end)
    }

    private func send(
        status: String,
        body: Data,
        declaredLength: Int? = nil,
        type: String,
        extraHeaders: [String] = [],
        on connection: NWConnection
    ) {
        let headers = ([
            "HTTP/1.1 \(status)",
            "Content-Type: \(type)",
            "Content-Length: \(declaredLength ?? body.count)",
            "Cache-Control: no-store",
            "Connection: close",
        ] + extraHeaders + ["", ""]).joined(separator: "\r\n")

        var response = Data(headers.utf8)
        response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": "text/html; charset=utf-8"
        case "js", "mjs": "text/javascript; charset=utf-8"
        case "css": "text/css; charset=utf-8"
        case "json": "application/json"
        case "svg": "image/svg+xml"
        case "png": "image/png"
        case "jpg", "jpeg": "image/jpeg"
        case "webp": "image/webp"
        case "mp3": "audio/mpeg"
        case "ogg", "opus": "audio/ogg"
        case "wav": "audio/wav"
        case "woff2": "font/woff2"
        default: "application/octet-stream"
        }
    }
}
