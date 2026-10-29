import ExpoModulesCore
import Foundation
import ImageIO
import Vision

public class DocArchiveOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DocArchiveOcr")
    Constants(["isSupported": true])

    AsyncFunction("extractTextFromImage") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri), url.isFileURL,
            let source = CGImageSourceCreateWithURL(url as CFURL, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        promise.reject("ERR_OCR_IMAGE", "Could not read the local image. Import the image again.")
        return
      }

      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
      let orientationValue = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
      let orientation = CGImagePropertyOrientation(rawValue: orientationValue) ?? .up
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      request.automaticallyDetectsLanguage = true
      let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])

      do {
        try handler.perform([request])
        promise.resolve((request.results ?? []).compactMap { $0.topCandidates(1).first?.string })
      } catch {
        promise.reject("ERR_OCR_RECOGNITION", "Could not recognize text in this image: \(error.localizedDescription)")
      }
    }
  }
}
