import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;
import 'package:sqflite/sqflite.dart';

/// Loads JSON seed data into the database on first launch.
///
/// Seeds the immutable reference rows (SOPs, checkpoints) — never user data.
/// The `users` table starts empty so S3 First-Time Setup is triggered.
class SeedLoader {
  static Future<void> loadAll(Database db) async {
    await _loadSops(db);
    await _loadCheckpoints(db);
  }

  static Future<void> _loadSops(Database db) async {
    final raw = await rootBundle.loadString('assets/seed/sops.json');
    final List<dynamic> rows = jsonDecode(raw) as List<dynamic>;
    final batch = db.batch();
    for (final row in rows.cast<Map<String, dynamic>>()) {
      // Seed JSON allows comment-rows (keys prefixed with `_`) for human notes.
      // Skip them; only real data rows have `id`.
      if (row['id'] == null) continue;
      batch.insert('sops', {
        'id': row['id'],
        'number': row['number'],
        'name_en': row['name_en'],
        'name_mr': row['name_mr'],
        'weight': row['weight'],
        'is_critical': row['is_critical'],
        'display_order': row['display_order'],
      });
    }
    await batch.commit(noResult: true);
  }

  static Future<void> _loadCheckpoints(Database db) async {
    final raw = await rootBundle.loadString('assets/seed/checkpoints.json');
    final List<dynamic> rows = jsonDecode(raw) as List<dynamic>;
    final batch = db.batch();
    for (final row in rows.cast<Map<String, dynamic>>()) {
      if (row['id'] == null) continue;
      batch.insert('checkpoints', {
        'id': row['id'],
        'sop_id': row['sop_id'],
        'frequency': row['frequency'],
        'sequence': row['sequence'],
        'text_en': row['text_en'],
        'text_mr': row['text_mr'],
        'evidence_en': row['evidence_en'],
        'evidence_mr': row['evidence_mr'],
        'weight': row['weight'],
        'allows_na': row['allows_na'],
        'requires_photo_on_fail': row['requires_photo_on_fail'],
        'display_order': row['display_order'],
      });
    }
    await batch.commit(noResult: true);
  }

  SeedLoader._();
}
