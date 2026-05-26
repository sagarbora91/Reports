/// A single P/F/NA mark on one checkpoint within an audit.
class AuditResult {
  const AuditResult({
    required this.id,
    required this.auditId,
    required this.checkpointId,
    required this.result,
    this.weightedPoints,
    this.findingText,
    this.croId,
    required this.createdAt,
  });

  factory AuditResult.fromMap(Map<String, Object?> m) => AuditResult(
        id: m['id']! as String,
        auditId: m['audit_id']! as String,
        checkpointId: m['checkpoint_id']! as String,
        result: m['result']! as String,
        weightedPoints: (m['weighted_points'] as num?)?.toDouble(),
        findingText: m['finding_text'] as String?,
        croId: m['cro_id'] as String?,
        createdAt: m['created_at']! as String,
      );

  final String id;
  final String auditId;
  final String checkpointId;
  final String result; // 'P' | 'F' | 'NA'
  final double? weightedPoints; // null for NA
  final String? findingText;
  final String? croId;
  final String createdAt;
}
