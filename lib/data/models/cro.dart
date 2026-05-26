/// Customer-facing retail staff (Chief Retail Officer). CROs are NOT app
/// users — they appear as dropdown options when attributing audit findings.
class Cro {
  const Cro({
    required this.id,
    required this.name,
    required this.counter,
    required this.shift,
    required this.isActive,
    required this.joinedAt,
  });

  factory Cro.fromMap(Map<String, Object?> m) => Cro(
        id: m['id']! as String,
        name: m['name']! as String,
        counter: m['counter']! as String,
        shift: m['shift']! as String,
        isActive: (m['is_active']! as int) == 1,
        joinedAt: DateTime.parse(m['joined_at']! as String),
      );

  final String id;
  final String name;
  final String counter; // 'Titan' | 'Helios'
  final String shift; // 'morning' | 'afternoon' | 'flexible'
  final bool isActive;
  final DateTime joinedAt;
}
