import AppKit
import OSLog

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let logger = Logger(
        subsystem: "com.grey.cheetahandpeach",
        category: "lifecycle"
    )
    private var gameWindowController: GameWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NativeHealth.shared.reset()
        let controller = GameWindowController()
        gameWindowController = controller
        installMenus()
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)

        NSApp.activate(ignoringOtherApps: true)
        logger.info("Native host launched")
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        gameWindowController?.setApplicationActive(true)
    }

    func applicationWillResignActive(_ notification: Notification) {
        gameWindowController?.setApplicationActive(false)
    }

    func applicationWillTerminate(_ notification: Notification) {
        gameWindowController?.shutdown()
        logger.info("Native host stopped cleanly")
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func installMenus() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(
            withTitle: "About The Cheetah & The Peach",
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
            keyEquivalent: ""
        )
        appMenu.addItem(.separator())
        appMenu.addItem(
            withTitle: "Quit The Cheetah & The Peach",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        appItem.submenu = appMenu
        main.addItem(appItem)

        let gameItem = NSMenuItem()
        let gameMenu = NSMenu(title: "Game")
        let reload = NSMenuItem(
            title: "Reload World",
            action: #selector(GameWindowController.reloadGame(_:)),
            keyEquivalent: "r"
        )
        reload.target = gameWindowController
        gameMenu.addItem(reload)
        gameMenu.addItem(.separator())
        gameMenu.addItem(
            withTitle: "Enter Full Screen",
            action: #selector(NSWindow.toggleFullScreen(_:)),
            keyEquivalent: "f"
        ).keyEquivalentModifierMask = [.command, .control]
        gameItem.submenu = gameMenu
        main.addItem(gameItem)

        NSApp.mainMenu = main
    }
}
