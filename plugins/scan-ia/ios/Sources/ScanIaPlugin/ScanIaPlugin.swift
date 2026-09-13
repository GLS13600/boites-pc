import Foundation
import UIKit
import Capacitor
import OnnxRuntimeBindings

// Mode IA du scan : fait tourner les réseaux sur la puce de l'iPhone.
//
// ONNX Runtime lit les MÊMES fichiers .onnx que la version web, et confie le calcul à
// Core ML (Neural Engine, carte graphique). Tout est embarqué dans l'appli : aucune
// requête réseau. Côté JavaScript, le module se lit sur `Capacitor.Plugins.ScanIa`.
//
// Les images arrivent en JPEG base64, déjà recadrées par la page : un JPEG de 256 px
// pèse ~20 Ko, là où les pixels bruts en flottants en pèseraient 800 à travers le pont.
@objc(ScanIaPlugin)
public class ScanIaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScanIaPlugin"
    public let jsName = "ScanIa"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "charge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "execute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "decharge", returnType: CAPPluginReturnPromise)
    ]

    // Une file à la fois : deux inférences simultanées sur la même puce se gêneraient.
    private let file = DispatchQueue(label: "guiguidex.scan-ia", qos: .userInitiated)
    private var env: ORTEnv?
    private var sessions: [String: ORTSession] = [:]

    enum Erreur: LocalizedError {
        case message(String)
        var errorDescription: String? {
            if case .message(let texte) = self { return texte }
            return nil
        }
    }

    // charge({ modeles: { classifieur: "scan/modele.onnx" }, unites: "ALL" })
    // `unites` : ALL, CPUAndNeuralEngine, CPUAndGPU, CPUOnly — ou CPU pour se passer
    // de Core ML, et mesurer ce qu'il apporte.
    @objc func charge(_ call: CAPPluginCall) {
        var modeles: [String: String] = [:]
        for (nom, valeur) in call.getObject("modeles") ?? [:] {
            if let chemin = valeur as? String { modeles[nom] = chemin }
        }
        let unites = call.getString("unites") ?? "ALL"
        file.async {
            do {
                if self.env == nil { self.env = try ORTEnv(loggingLevel: .warning) }
                var rapport: [String: Any] = [:]
                for (nom, chemin) in modeles {
                    let t0 = CFAbsoluteTimeGetCurrent()
                    guard let url = Self.urlPublique(chemin) else {
                        throw Erreur.message("modèle introuvable dans l'appli : \(chemin)")
                    }
                    self.sessions[nom] = try self.ouvre(url.path, unites: unites)
                    rapport[nom] = [
                        "ms": (CFAbsoluteTimeGetCurrent() - t0) * 1000,
                        "entrees": try self.sessions[nom]?.inputNames() ?? [],
                        "sorties": try self.sessions[nom]?.outputNames() ?? []
                    ]
                }
                call.resolve(["modeles": rapport, "unites": unites])
            } catch {
                call.reject("Chargement impossible : \(error.localizedDescription)")
            }
        }
    }

    // execute({ modele: "classifieur", images: [base64…], largeur: 256, hauteur: 256,
    //           normalisation: "brut" | "imagenet" })
    // Rend chaque sortie en flottants 32 bits encodés en base64, avec sa forme.
    @objc func execute(_ call: CAPPluginCall) {
        guard let nom = call.getString("modele"),
              let images = call.getArray("images") as? [String], !images.isEmpty else {
            call.reject("modele et images sont requis")
            return
        }
        let largeur = call.getInt("largeur") ?? 256
        let hauteur = call.getInt("hauteur") ?? 256
        let imagenet = call.getString("normalisation") == "imagenet"
        file.async {
            do {
                guard let session = self.sessions[nom] else { throw Erreur.message("modèle non chargé : \(nom)") }
                let t0 = CFAbsoluteTimeGetCurrent()
                let tenseur = try Self.tenseur(images, largeur: largeur, hauteur: hauteur, imagenet: imagenet)
                let t1 = CFAbsoluteTimeGetCurrent()
                guard let entree = try session.inputNames().first else { throw Erreur.message("modèle sans entrée") }
                let noms = try session.outputNames()
                let resultats = try session.run(withInputs: [entree: tenseur], outputNames: Set(noms), runOptions: nil)
                let t2 = CFAbsoluteTimeGetCurrent()
                var sorties: [String: Any] = [:]
                for (cle, valeur) in resultats {
                    let donnees = try valeur.tensorData() as Data
                    let forme = try valeur.tensorTypeAndShapeInfo().shape.map { $0.intValue }
                    sorties[cle] = ["donnees": donnees.base64EncodedString(), "forme": forme]
                }
                call.resolve([
                    "sorties": sorties,
                    "msPreparation": (t1 - t0) * 1000,
                    "msCalcul": (t2 - t1) * 1000
                ])
            } catch {
                call.reject("Analyse impossible : \(error.localizedDescription)")
            }
        }
    }

    @objc func decharge(_ call: CAPPluginCall) {
        file.async {
            self.sessions.removeAll()
            call.resolve()
        }
    }

    // ------------------------------------------------------------ outils

    private func ouvre(_ chemin: String, unites: String) throws -> ORTSession {
        guard let env = env else { throw Erreur.message("environnement ONNX absent") }
        if unites == "CPU" {
            let options = try ORTSessionOptions()
            try options.setGraphOptimizationLevel(.all)
            return try ORTSession(env: env, modelPath: chemin, sessionOptions: options)
        }
        // Core ML au format « ML Program », compilé une fois puis gardé en cache : les
        // ouvertures suivantes ne recompilent pas le modèle.
        do {
            return try ORTSession(env: env, modelPath: chemin,
                                  sessionOptions: try options(unites: unites, cache: Self.dossierCache()))
        } catch {
            // Une version d'ONNX Runtime qui ne connaîtrait pas le cache ne doit pas
            // priver du mode IA : on réessaie sans.
            return try ORTSession(env: env, modelPath: chemin, sessionOptions: try options(unites: unites, cache: nil))
        }
    }

    private func options(unites: String, cache: URL?) throws -> ORTSessionOptions {
        let options = try ORTSessionOptions()
        try options.setGraphOptimizationLevel(.all)
        var coreml: [AnyHashable: Any] = ["ModelFormat": "MLProgram", "MLComputeUnits": unites]
        if let cache = cache { coreml["ModelCacheDirectory"] = cache.path }
        try options.appendCoreMLExecutionProvider(withOptionsV2: coreml)
        return options
    }

    // Les fichiers web de l'appli sont embarqués sous `public/`, comme `dist/`.
    private static func urlPublique(_ chemin: String) -> URL? {
        guard let racine = Bundle.main.url(forResource: "public", withExtension: nil) else { return nil }
        let url = racine.appendingPathComponent(chemin)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    private static func dossierCache() -> URL {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let dossier = base.appendingPathComponent("scan-ia-coreml", isDirectory: true)
        try? FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
        return dossier
    }

    // JPEG base64 → tenseur [n, 3, hauteur, largeur] en flottants, planaire RGB.
    private static func tenseur(_ images: [String], largeur: Int, hauteur: Int, imagenet: Bool) throws -> ORTValue {
        let plan = largeur * hauteur
        let moyenne: [Float] = imagenet ? [0.485, 0.456, 0.406] : [0, 0, 0]
        let ecart: [Float] = imagenet ? [0.229, 0.224, 0.225] : [1, 1, 1]
        guard let tampon = NSMutableData(length: images.count * 3 * plan * MemoryLayout<Float>.stride) else {
            throw Erreur.message("mémoire insuffisante")
        }
        let valeurs = tampon.mutableBytes.bindMemory(to: Float.self, capacity: images.count * 3 * plan)
        for (i, texte) in images.enumerated() {
            let octets = try pixels(texte, largeur: largeur, hauteur: hauteur)
            let debut = i * 3 * plan
            for p in 0..<plan {
                let o = p * 4
                for c in 0..<3 {
                    valeurs[debut + c * plan + p] = (Float(octets[o + c]) / 255 - moyenne[c]) / ecart[c]
                }
            }
        }
        let forme: [NSNumber] = [NSNumber(value: images.count), 3, NSNumber(value: hauteur), NSNumber(value: largeur)]
        return try ORTValue(tensorData: tampon, elementType: .float, shape: forme)
    }

    // Décode un JPEG (ou PNG) base64 et le redessine à la taille voulue, en RGBA 8 bits.
    private static func pixels(_ texte: String, largeur: Int, hauteur: Int) throws -> [UInt8] {
        let brut = texte.components(separatedBy: ",").last ?? texte  // accepte une data URL
        guard let donnees = Data(base64Encoded: brut), let image = UIImage(data: donnees)?.cgImage else {
            throw Erreur.message("image illisible")
        }
        var octets = [UInt8](repeating: 0, count: largeur * hauteur * 4)
        let ok: Bool = octets.withUnsafeMutableBytes { tampon in
            guard let contexte = CGContext(data: tampon.baseAddress, width: largeur, height: hauteur,
                                           bitsPerComponent: 8, bytesPerRow: largeur * 4,
                                           space: CGColorSpaceCreateDeviceRGB(),
                                           bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
            contexte.interpolationQuality = .high
            contexte.draw(image, in: CGRect(x: 0, y: 0, width: largeur, height: hauteur))
            return true
        }
        if !ok { throw Erreur.message("contexte graphique indisponible") }
        return octets
    }
}
