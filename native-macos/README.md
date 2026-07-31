# AppKit/WebKit diagnostic fallback

This preserved Swift target is no longer the shipped native host. On the current
Mac, WKWebView reports a healthy WebGL canvas but presents a black compositor
surface. It remains in the repository as a diagnostic fallback; the release
script packages the exact web build with Chromium/ANGLE Metal instead. See
`../native-electron/README.md`.

This target still contains:

- an AppKit lifecycle and full-window WKWebView;
- an in-process, loopback-only server for the production web bundle;
- WebGL/document/Metal health diagnostics;
- clean server and window shutdown.

Build the fallback directly only for investigation:

```bash
swift build --package-path native-macos -c release
```

Do not use this target for the distributed `.app` until its current WebKit
compositor failure has been resolved and visually re-verified.
