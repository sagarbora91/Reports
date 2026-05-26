/// An evidence photo attached to a Fail or a CAP.
///
/// Spec §4.4: max 5 per Fail, auto-compress to 1280px JPEG 80%.
class Photo {
  const Photo({
    required this.id,
    this.auditResultId,
    this.capId,
    required this.context,
    required this.localPath,
    this.cloudUrl,
    this.thumbLocalPath,
    this.uploadStatus = 'pending',
    required this.capturedAt,
    this.capturedLat,
    this.capturedLng,
    this.uploadedBy,
    this.fileSizeBytes,
  });

  factory Photo.fromMap(Map<String, Object?> m) => Photo(
        id: m['id']! as String,
        auditResultId: m['audit_result_id'] as String?,
        capId: m['cap_id'] as String?,
        context: m['context']! as String,
        localPath: m['local_path']! as String,
        cloudUrl: m['cloud_url'] as String?,
        thumbLocalPath: m['thumb_local_path'] as String?,
        uploadStatus: m['upload_status']! as String,
        capturedAt: m['captured_at']! as String,
        capturedLat: (m['captured_lat'] as num?)?.toDouble(),
        capturedLng: (m['captured_lng'] as num?)?.toDouble(),
        uploadedBy: m['uploaded_by'] as String?,
        fileSizeBytes: m['file_size_bytes'] as int?,
      );

  final String id;
  final String? auditResultId;
  final String? capId;
  final String context; // 'fail_evidence' | 'cap_progress' | 'cap_verification'
  final String localPath;
  final String? cloudUrl;
  final String? thumbLocalPath;
  final String uploadStatus;
  final String capturedAt;
  final double? capturedLat;
  final double? capturedLng;
  final String? uploadedBy;
  final int? fileSizeBytes;
}
