import 'package:uuid/uuid.dart';

import '../db/database.dart';
import '../models/cro.dart';

class CroRepository {
  CroRepository._();
  static final CroRepository instance = CroRepository._();

  Future<List<Cro>> listActive() async {
    final rows = await AppDatabase.instance.db.query(
      'cros',
      where: 'is_active = 1',
      orderBy: 'name COLLATE NOCASE',
    );
    return rows.map(Cro.fromMap).toList();
  }

  Future<String> add({
    required String name,
    required String counter,
    String shift = 'flexible',
  }) async {
    final id = const Uuid().v4();
    await AppDatabase.instance.db.insert('cros', {
      'id': id,
      'name': name,
      'counter': counter,
      'shift': shift,
      'is_active': 1,
      'joined_at': DateTime.now().toUtc().toIso8601String(),
    });
    return id;
  }

  Future<void> deactivate(String id) async {
    await AppDatabase.instance.db.update(
      'cros',
      {'is_active': 0},
      where: 'id = ?',
      whereArgs: [id],
    );
  }
}
