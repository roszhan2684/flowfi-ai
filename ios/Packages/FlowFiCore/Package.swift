// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "FlowFiCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "FlowFiCore", targets: ["FlowFiCore"])],
    targets: [
        .target(name: "FlowFiCore"),
        .testTarget(name: "FlowFiCoreTests", dependencies: ["FlowFiCore"]),
    ]
)
