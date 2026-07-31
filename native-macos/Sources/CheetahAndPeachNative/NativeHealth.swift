import Darwin
import Foundation

@MainActor
final class NativeHealth {
    static let shared = NativeHealth()

    private let fileURL = URL(
        fileURLWithPath: "/tmp/cheetahandpeach-native-health-\(getuid())"
    )
    private var stages = Set<String>()

    private init() {}

    func reset() {
        stages.removeAll()
        try? FileManager.default.removeItem(at: fileURL)
    }

    func mark(_ stage: String) {
        stages.insert(stage)
        let report = stages.sorted().joined(separator: "\n") + "\n"
        try? report.write(to: fileURL, atomically: true, encoding: .utf8)
    }
}
