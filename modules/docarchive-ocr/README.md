# docArchive OCR

Local Expo module discovered from the app's `modules` directory. Rebuild the
native app after modifying it; Expo Go and browsers do not include this bridge.

`DocArchiveOcr.extractTextFromImage(fileUri)` recognizes image text on-device and
returns text blocks. Android bundles ML Kit's Latin recognizer in the binary
(`com.google.mlkit:text-recognition`), not the downloadable Play Services model.
iOS uses Apple Vision with accurate recognition and EXIF image orientation.
Neither implementation fetches documents or sends images to a server.

OCR is for printed text in supported languages, not a handwriting guarantee or a
PDF text extractor. Missing/invalid images and recognition failures reject the
operation; an image with no recognized text returns an empty array.

Native compilation and physical-device airplane-mode checks are required before
releasing a build. Source-contract tests do not replace device testing.
