/// A single audit checkpoint. There are 68 daily + 36 weekly (P2) + monthly
/// (P3) checkpoints. Seed-loaded; never edited at runtime.
class Checkpoint {
  const Checkpoint({
    required this.id,
    required this.sopId,
    required this.frequency,
    required this.sequence,
    required this.textEn,
    required this.textMr,
    this.evidenceEn,
    this.evidenceMr,
    required this.weight,
    required this.allowsNa,
    required this.requiresPhotoOnFail,
    required this.displayOrder,
  });

  factory Checkpoint.fromMap(Map<String, Object?> m) => Checkpoint(
        id: m['id']! as String,
        sopId: m['sop_id']! as String,
        frequency: m['frequency']! as String,
        sequence: m['sequence']! as int,
        textEn: m['text_en']! as String,
        textMr: m['text_mr']! as String,
        evidenceEn: m['evidence_en'] as String?,
        evidenceMr: m['evidence_mr'] as String?,
        weight: m['weight']! as int,
        allowsNa: (m['allows_na']! as int) == 1,
        requiresPhotoOnFail: (m['requires_photo_on_fail']! as int) == 1,
        displayOrder: m['display_order']! as int,
      );

  final String id; // '1.1' .. '8.8' / 'CW.7' etc.
  final String sopId;
  final String frequency; // 'daily' | 'weekly' | 'monthly'
  final int sequence;
  final String textEn;
  final String textMr;
  final String? evidenceEn;
  final String? evidenceMr;
  final int weight;
  final bool allowsNa;
  final bool requiresPhotoOnFail;
  final int displayOrder;

  String text(String locale) => locale == 'mr' ? textMr : textEn;
  String? evidence(String locale) => locale == 'mr' ? evidenceMr : evidenceEn;
}
