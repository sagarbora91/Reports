import 'dart:io';

import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Capture + compress + persist evidence photos.
///
/// Spec §4.8: auto-compress to 1280px long edge, JPEG 80%. Originals are
/// discarded after the compressed file is on disk.
class PhotoService {
  PhotoService._();
  static final PhotoService instance = PhotoService._();

  final ImagePicker _picker = ImagePicker();

  /// Open the device camera and return the saved compressed file path, or
  /// null if the user cancelled.
  Future<String?> captureAndStore({required String auditId}) async {
    final raw = await _picker.pickImage(
      source: ImageSource.camera,
      // Hint to the OS picker; we still compress below in case it didn't
      // honour the hint.
      maxWidth: 2560,
      imageQuality: 90,
    );
    if (raw == null) return null;

    final docsDir = await getApplicationDocumentsDirectory();
    final outDir = Directory(p.join(docsDir.path, 'photos', auditId));
    if (!outDir.existsSync()) outDir.createSync(recursive: true);

    final outPath = p.join(
      outDir.path,
      '${DateTime.now().millisecondsSinceEpoch}.jpg',
    );

    final compressed = await FlutterImageCompress.compressAndGetFile(
      raw.path,
      outPath,
      quality: 80,
      minWidth: 1280,
      minHeight: 1280,
      format: CompressFormat.jpeg,
    );

    if (compressed == null) {
      // Compression failed — keep the original.
      await File(raw.path).copy(outPath);
    }

    // Best-effort cleanup of the original temp file. If it lives in the
    // picker cache the OS will purge it eventually anyway.
    try {
      final original = File(raw.path);
      if (original.existsSync() && raw.path != outPath) {
        await original.delete();
      }
    } catch (_) {
      // Ignore — cleanup is best-effort.
    }

    return outPath;
  }

  Future<int> fileSize(String path) async {
    final f = File(path);
    if (!f.existsSync()) return 0;
    return f.length();
  }
}
