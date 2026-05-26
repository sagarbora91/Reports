import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';

import 'db/database.dart';

/// Per-install device identity. The UUID persists across app restarts but
/// resets on reinstall (SharedPreferences is wiped). Good enough for Spec
/// §4.2 — used to attribute audits and cap_log to a device.
class DeviceService {
  DeviceService._();
  static final DeviceService instance = DeviceService._();

  static const _prefKey = 'device_id';
  String? _cachedId;

  Future<String> getId() async {
    final cached = _cachedId;
    if (cached != null) return cached;

    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_prefKey);
    if (id == null) {
      id = const Uuid().v4();
      await prefs.setString(_prefKey, id);
    }
    _cachedId = id;

    // Upsert into devices table so audit FKs resolve.
    final db = AppDatabase.instance.db;
    await db.insert(
      'devices',
      {
        'id': id,
        'last_seen_at': DateTime.now().toUtc().toIso8601String(),
        'sync_state': 'synced',
      },
      conflictAlgorithm: ConflictAlgorithm.ignore,
    );
    return id;
  }
}
