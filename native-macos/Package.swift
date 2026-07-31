// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "CheetahAndPeachNative",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(
            name: "CheetahAndPeachNative",
            targets: ["CheetahAndPeachNative"]
        ),
    ],
    targets: [
        .executableTarget(
            name: "CheetahAndPeachNative",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("Metal"),
                .linkedFramework("Network"),
                .linkedFramework("WebKit"),
            ]
        ),
    ]
)
