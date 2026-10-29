/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(`../../modules/docarchive-ocr/${path}`, import.meta.url), 'utf8');
}

describe('owned native OCR module source contracts', () => {
  it('uses the SDK58 Gradle plugin rather than the removed legacy script', () => {
    const gradle = source('android/build.gradle');
    expect(gradle).toContain("id 'com.android.library'");
    expect(gradle).toContain("id 'expo-module-gradle-plugin'");
    expect(gradle).toMatch(/expoModule\s*\{\s*v2 true/);
    expect(gradle).not.toContain('ExpoModulesCorePlugin.gradle');
    expect(gradle).not.toContain('apply from');
  });

  it('bundles the Latin recognition model instead of downloading a Play Services model', () => {
    const gradle = source('android/build.gradle');
    expect(gradle).toContain("implementation 'com.google.mlkit:text-recognition:16.0.1'");
    expect(gradle).not.toMatch(/play-services|com\.google\.android\.gms/);
    const android = source('android/src/main/java/expo/modules/docarchiveocr/DocArchiveOcrModule.kt');
    expect(android).toContain('TextRecognizerOptions.DEFAULT_OPTIONS');
    expect(android).toContain('InputImage.fromFilePath(context, uri)');
    expect(android).toContain('uri.scheme == "file"');
    expect(android).toMatch(/addOnCompleteListener\s*\{ task ->\s*recognizer.close\(\)/);
    expect(android).toContain('ERR_OCR_RECOGNITION');
    expect(android).toContain('ERR_OCR_IMAGE');
  });

  it('registers both platform implementations with the same optional bridge name', () => {
    const config = JSON.parse(source('expo-module.config.json'));
    expect(config.platforms).toEqual(['apple', 'android']);
    expect(config.android.modules).toEqual(['expo.modules.docarchiveocr.DocArchiveOcrModule']);
    expect(config.apple.modules).toEqual(['DocArchiveOcrModule']);
    const android = source('android/src/main/java/expo/modules/docarchiveocr/DocArchiveOcrModule.kt');
    const ios = source('ios/DocArchiveOcrModule.swift');
    for (const implementation of [android, ios]) {
      expect(implementation).toContain('Name("DocArchiveOcr")');
      expect(implementation).toContain('"isSupported"');
      expect(implementation).toContain('AsyncFunction("extractTextFromImage")');
    }
    expect(JSON.parse(source('package.json')).name).toBe('docarchive-ocr');
  });

  it('uses accurate local Vision OCR with EXIF orientation and an ExpoModulesCore pod', () => {
    const ios = source('ios/DocArchiveOcrModule.swift');
    expect(ios).toContain('url.isFileURL');
    expect(ios).toContain('CGImageSourceCreateWithURL');
    expect(ios).toContain('kCGImagePropertyOrientation');
    expect(ios).toContain('VNImageRequestHandler(cgImage: image, orientation: orientation');
    expect(ios).toContain('request.recognitionLevel = .accurate');
    expect(ios).toContain('try handler.perform([request])');
    expect(ios).toContain('ERR_OCR_RECOGNITION');
    const podspec = source('ios/DocArchiveOcr.podspec');
    expect(podspec).toContain("s.dependency 'ExpoModulesCore'");
    expect(podspec).toContain("s.frameworks = 'Vision', 'ImageIO'");
  });
});
