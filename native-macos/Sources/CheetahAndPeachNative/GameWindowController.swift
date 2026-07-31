import AppKit
import Metal
import OSLog
import WebKit

@MainActor
final class GameWindowController: NSWindowController, NSWindowDelegate, WKNavigationDelegate {
    private let logger = Logger(
        subsystem: "com.grey.cheetahandpeach",
        category: "window"
    )
    private let webView: WKWebView
    private var webServer: LocalWebServer?
    private var rendererVerificationWorkItem: DispatchWorkItem?
    private var didVerifyRenderer = false

    init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsAirPlayForMediaPlayback = false
        configuration.mediaTypesRequiringUserActionForPlayback = [.audio, .video]
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: """
                window.__CHEETAH_PEACH_NATIVE__ = true;
                window.__CHEETAH_PEACH_NATIVE_ERRORS__ = [];
                window.addEventListener('error', function (event) {
                  window.__CHEETAH_PEACH_NATIVE_ERRORS__.push(
                    String(event.message || 'window error')
                  );
                });
                window.addEventListener('unhandledrejection', function (event) {
                  window.__CHEETAH_PEACH_NATIVE_ERRORS__.push(
                    String(event.reason?.stack || event.reason || 'unhandled rejection')
                  );
                });
                """,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        webView = WKWebView(frame: .zero, configuration: configuration)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        super.init(window: window)

        window.delegate = self
        window.title = "The Cheetah & The Peach"
        window.backgroundColor = NSColor(red: 0.025, green: 0.03, blue: 0.05, alpha: 1)
        window.minSize = NSSize(width: 960, height: 600)
        window.center()
        window.setFrameAutosaveName("CheetahAndPeachMainWindow")
        window.contentView = webView

        configureViews()
        verifyMetalDevice()
        startBundledGame()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func configureViews() {
        webView.navigationDelegate = self
        webView.alphaValue = 1
        webView.underPageBackgroundColor = .black
        webView.autoresizingMask = [.width, .height]
        if ProcessInfo.processInfo.environment["CHEETAH_NATIVE_INSPECT"] == "1" {
            webView.isInspectable = true
        }
    }

    private func verifyMetalDevice() {
        guard let device = MTLCreateSystemDefaultDevice() else {
            logger.error("Metal device is unavailable")
            NativeHealth.shared.mark("metal=unavailable")
            return
        }
        logger.info("Metal device ready: \(device.name, privacy: .public)")
        NativeHealth.shared.mark("metal=ready")
    }

    private func startBundledGame() {
        guard let resources = Bundle.main.resourceURL else {
            reportLoadError("APP RESOURCES ARE UNAVAILABLE")
            return
        }

        let webRoot = resources.appendingPathComponent("WebApp", isDirectory: true)
        let server = LocalWebServer(root: webRoot)
        webServer = server
        server.start { [weak self] result in
            Task { @MainActor in
                guard let self else { return }
                switch result {
                case let .success(url):
                    self.logger.info("Loading bundled game")
                    NativeHealth.shared.mark("server=ready")
                    self.webView.load(URLRequest(url: url))
                case let .failure(error):
                    self.logger.error("Bundle server failed: \(error.localizedDescription)")
                    self.reportLoadError(error.localizedDescription.uppercased())
                }
            }
        }
    }

    private func reportLoadError(_ message: String) {
        logger.error("Native web load failure: \(message, privacy: .public)")
        NativeHealth.shared.mark("web=failed")
    }

    private func beginRendererVerification() {
        rendererVerificationWorkItem?.cancel()
        didVerifyRenderer = false
        verifyRenderer(attempt: 0)
    }

    private func verifyRenderer(attempt: Int) {
        guard !didVerifyRenderer else { return }
        let script = """
        (() => {
          const canvas = document.querySelector('canvas');
          let gl = null;
          try {
            gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
          } catch (_) {}
          let renderer = '';
          if (gl) {
            const info = gl.getExtension('WEBGL_debug_renderer_info');
            renderer = String(
              info
                ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
                : gl.getParameter(gl.RENDERER)
            );
          }
          return {
            ready: document.documentElement.dataset.webglReady === 'true',
            canvas: Boolean(canvas),
            width: canvas?.width || 0,
            height: canvas?.height || 0,
            webgl: Boolean(gl),
            renderer,
            errors: (window.__CHEETAH_PEACH_NATIVE_ERRORS__ || []).slice(-6).join(' | ')
          };
        })()
        """

        webView.evaluateJavaScript(script) { [weak self] result, error in
            Task { @MainActor in
                guard let self, !self.didVerifyRenderer else { return }

                let report = result as? [String: Any]
                let ready = report?["ready"] as? Bool ?? false
                let canvas = report?["canvas"] as? Bool ?? false
                let webgl = report?["webgl"] as? Bool ?? false
                let width = report?["width"] as? Int ?? 0
                let height = report?["height"] as? Int ?? 0
                let renderer = report?["renderer"] as? String ?? "unknown"
                let errors = report?["errors"] as? String ?? ""

                if ready && canvas && webgl && width > 0 && height > 0 {
                    self.didVerifyRenderer = true
                    NativeHealth.shared.mark("canvas=ready")
                    NativeHealth.shared.mark("web=ready")
                    self.logger.info(
                        "WebGL frame ready \(width)x\(height), renderer: \(renderer, privacy: .public)"
                    )
                    return
                }

                if attempt >= 47 {
                    let evaluationError = error?.localizedDescription ?? "none"
                    self.logger.error(
                        """
                        WebGL readiness timed out; canvas=\(canvas), webgl=\(webgl), \
                        size=\(width)x\(height), renderer=\(renderer, privacy: .public), \
                        evaluation=\(evaluationError, privacy: .public), \
                        javascript=\(errors, privacy: .public)
                        """
                    )
                    NativeHealth.shared.mark("canvas=failed")
                    return
                }

                let work = DispatchWorkItem { [weak self] in
                    self?.verifyRenderer(attempt: attempt + 1)
                }
                self.rendererVerificationWorkItem = work
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: work)
            }
        }
    }

    @objc
    func reloadGame(_ sender: Any?) {
        rendererVerificationWorkItem?.cancel()
        webView.reload()
    }

    func setApplicationActive(_ active: Bool) {
        if !active {
            webView.evaluateJavaScript("window.dispatchEvent(new Event('blur'));")
        } else {
            webView.evaluateJavaScript("window.dispatchEvent(new Event('focus'));")
        }
    }

    func shutdown() {
        rendererVerificationWorkItem?.cancel()
        rendererVerificationWorkItem = nil
        webView.stopLoading()
        webServer?.stop()
        webServer = nil
    }

    func windowWillClose(_ notification: Notification) {
        shutdown()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        NativeHealth.shared.mark("document=ready")
        beginRendererVerification()
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        reportLoadError(error.localizedDescription.uppercased())
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        reportLoadError(error.localizedDescription.uppercased())
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        logger.error("WebKit content process terminated; reloading bundled game")
        NativeHealth.shared.mark("web=terminated")
        webView.reload()
    }
}
