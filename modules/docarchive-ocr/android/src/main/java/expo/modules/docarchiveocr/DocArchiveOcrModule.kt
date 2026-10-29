package expo.modules.docarchiveocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DocArchiveOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DocArchiveOcr")
    Constants("isSupported" to true)

    AsyncFunction("extractTextFromImage") { uriString: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_OCR_CONTEXT", "The OCR application context is unavailable. Reopen the app.", null)
        return@AsyncFunction
      }

      try {
        val uri = Uri.parse(uriString)
        require(uri.scheme == "file") { "OCR requires a local file:// image URI." }
        val image = InputImage.fromFilePath(context, uri)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
          recognizer.process(image).addOnCompleteListener { task ->
            recognizer.close()
            if (task.isSuccessful) {
              promise.resolve(task.result.textBlocks.map { it.text })
            } else {
              promise.reject(
                "ERR_OCR_RECOGNITION",
                "Could not recognize text in this image. Try a clear photo of printed text.",
                task.exception
              )
            }
          }
        } catch (error: Exception) {
          recognizer.close()
          throw error
        }
      } catch (error: Exception) {
        promise.reject("ERR_OCR_IMAGE", "Could not read the local image: ${error.message}", error)
      }
    }
  }
}
