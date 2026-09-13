// swift-tools-version: 5.9
import PackageDescription

// Module natif du mode IA. ONNX Runtime lit les MÊMES fichiers .onnx que la version
// web, et confie le calcul à Core ML : Neural Engine et carte graphique de l'iPhone.
// Aucun réseau : les modèles sont embarqués dans l'appli.
let package = Package(
    name: "GuiguidexScanIa",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "GuiguidexScanIa", targets: ["ScanIaPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/microsoft/onnxruntime-swift-package-manager.git", from: "1.24.2")
    ],
    targets: [
        .target(
            name: "ScanIaPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "onnxruntime", package: "onnxruntime-swift-package-manager")
            ],
            path: "ios/Sources/ScanIaPlugin")
    ]
)
