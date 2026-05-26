import '../db/database.dart';
import '../models/checkpoint.dart';
import '../models/sop.dart';

/// Read-only access to the seed-loaded SOPs and checkpoints.
class CheckpointRepository {
  CheckpointRepository._();
  static final CheckpointRepository instance = CheckpointRepository._();

  Future<List<Sop>> loadAllSops() async {
    final rows = await AppDatabase.instance.db.query(
      'sops',
      orderBy: 'display_order',
    );
    return rows.map(Sop.fromMap).toList();
  }

  /// All daily checkpoints in Workbook §2.10 time-block order.
  /// Returns 68 rows on a healthy seed.
  Future<List<Checkpoint>> loadDailyCheckpointsInAuditOrder() async {
    final rows = await AppDatabase.instance.db.query(
      'checkpoints',
      where: 'frequency = ?',
      whereArgs: ['daily'],
      orderBy: 'display_order',
    );
    return rows.map(Checkpoint.fromMap).toList();
  }

  Future<Sop> loadSop(String sopId) async {
    final rows = await AppDatabase.instance.db.query(
      'sops',
      where: 'id = ?',
      whereArgs: [sopId],
      limit: 1,
    );
    if (rows.isEmpty) {
      throw StateError('Unknown SOP: $sopId');
    }
    return Sop.fromMap(rows.first);
  }
}
