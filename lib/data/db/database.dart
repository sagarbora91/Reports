import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import 'schema.dart';
import 'seed_loader.dart';

/// Singleton wrapper around the SQLite database for the audit app.
///
/// Spec §2 mandates `sqflite` and offline-first behaviour — the app must
/// boot and be usable without network. Firestore sync is an upload-side
/// concern handled elsewhere; this class only owns the local store.
class AppDatabase {
  static final AppDatabase instance = AppDatabase._();
  AppDatabase._();

  Database? _db;

  /// True after [open] has completed; reopening is a no-op.
  bool get isOpen => _db != null;

  Database get db {
    final d = _db;
    if (d == null) {
      throw StateError('AppDatabase.open() must complete before db access.');
    }
    return d;
  }

  Future<void> open() async {
    if (_db != null) return;

    final docsDir = await getApplicationDocumentsDirectory();
    final dbPath = p.join(docsDir.path, 'saagar_audit.db');

    _db = await openDatabase(
      dbPath,
      version: Schema.currentVersion,
      onConfigure: (db) async {
        // sqflite disables FK enforcement by default — turn it on per spec
        // §4 (every cross-table relation has ON DELETE semantics declared).
        await db.execute('PRAGMA foreign_keys = ON');
      },
      onCreate: (db, version) async {
        final batch = db.batch();
        for (final stmt in Schema.createStatements) {
          batch.execute(stmt);
        }
        await batch.commit(noResult: true);
        await SeedLoader.loadAll(db);
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        // Per spec §4.15, migrations go through sqflite_migration_plan when
        // we cross schema versions. v1 → v1 is a no-op; real migrations land
        // when the first column or table change ships.
      },
    );
  }

  Future<void> close() async {
    await _db?.close();
    _db = null;
  }

  /// True if the `users` table is empty — used by S1 splash to decide
  /// whether to route to S3 First-Time Setup or straight to S4 Login.
  Future<bool> isFirstLaunch() async {
    final rows = await db.rawQuery('SELECT COUNT(*) AS n FROM users');
    final n = rows.first['n'] as int? ?? 0;
    return n == 0;
  }
}
