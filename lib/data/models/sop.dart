/// One of the 8 P1 SOPs. Seed-loaded; never edited at runtime.
class Sop {
  const Sop({
    required this.id,
    required this.number,
    required this.nameEn,
    required this.nameMr,
    required this.weight,
    required this.isCritical,
    required this.displayOrder,
  });

  factory Sop.fromMap(Map<String, Object?> m) => Sop(
        id: m['id']! as String,
        number: m['number']! as int,
        nameEn: m['name_en']! as String,
        nameMr: m['name_mr']! as String,
        weight: m['weight']! as int,
        isCritical: (m['is_critical']! as int) == 1,
        displayOrder: m['display_order']! as int,
      );

  final String id; // 'SOP1' .. 'SOP8'
  final int number; // 1..8
  final String nameEn;
  final String nameMr;
  final int weight; // 1 or 2
  final bool isCritical; // ★ Cash & Inventory
  final int displayOrder; // §2.10 time-block order

  String name(String locale) => locale == 'mr' ? nameMr : nameEn;
}
