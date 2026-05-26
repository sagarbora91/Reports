/// A daily, weekly, or monthly audit. Immutable after `status='submitted'`
/// per Spec §3 audit-immutability rule — only Owner can HIDE.
class Audit {
  const Audit({
    required this.id,
    required this.auditType,
    required this.auditDate,
    required this.weekNumber,
    this.monthNumber,
    required this.year,
    required this.auditorId,
    required this.deviceId,
    required this.status,
    this.rawScore,
    this.maxScore,
    this.compliancePct,
    this.band,
    this.failCount = 0,
    this.passCount = 0,
    this.naCount = 0,
    this.cashVarianceRupees,
    this.draftStartedAt,
    this.submittedAt,
    this.verifiedAt,
    this.verifierId,
    this.supersedesAuditId,
    this.hiddenAt,
    this.hiddenBy,
    this.hiddenReason,
    this.notes,
  });

  factory Audit.fromMap(Map<String, Object?> m) => Audit(
        id: m['id']! as String,
        auditType: m['audit_type']! as String,
        auditDate: m['audit_date']! as String,
        weekNumber: m['week_number']! as int,
        monthNumber: m['month_number'] as int?,
        year: m['year']! as int,
        auditorId: m['auditor_id']! as String,
        deviceId: m['device_id']! as String,
        status: m['status']! as String,
        rawScore: (m['raw_score'] as num?)?.toDouble(),
        maxScore: (m['max_score'] as num?)?.toDouble(),
        compliancePct: (m['compliance_pct'] as num?)?.toDouble(),
        band: m['band'] as String?,
        failCount: m['fail_count'] as int? ?? 0,
        passCount: m['pass_count'] as int? ?? 0,
        naCount: m['na_count'] as int? ?? 0,
        cashVarianceRupees: (m['cash_variance_rupees'] as num?)?.toDouble(),
        draftStartedAt: m['draft_started_at'] as String?,
        submittedAt: m['submitted_at'] as String?,
        verifiedAt: m['verified_at'] as String?,
        verifierId: m['verifier_id'] as String?,
        supersedesAuditId: m['supersedes_audit_id'] as String?,
        hiddenAt: m['hidden_at'] as String?,
        hiddenBy: m['hidden_by'] as String?,
        hiddenReason: m['hidden_reason'] as String?,
        notes: m['notes'] as String?,
      );

  final String id;
  final String auditType; // 'daily' | 'weekly' | 'monthly'
  final String auditDate; // YYYY-MM-DD
  final int weekNumber;
  final int? monthNumber;
  final int year;
  final String auditorId;
  final String deviceId;
  final String status; // 'draft' | 'submitted' | 'verified' | 'hidden'
  final double? rawScore;
  final double? maxScore;
  final double? compliancePct;
  final String? band;
  final int failCount;
  final int passCount;
  final int naCount;
  final double? cashVarianceRupees;
  final String? draftStartedAt;
  final String? submittedAt;
  final String? verifiedAt;
  final String? verifierId;
  final String? supersedesAuditId;
  final String? hiddenAt;
  final String? hiddenBy;
  final String? hiddenReason;
  final String? notes;

  bool get isDraft => status == 'draft';
  bool get isSubmitted => status == 'submitted';
}
