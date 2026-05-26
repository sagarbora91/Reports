import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'data/db/database.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Open SQLite, run migrations, load seed JSON on first launch.
  await AppDatabase.instance.open();

  // Firebase is initialized lazily on first sync attempt (offline-first per
  // spec §2 — the app must boot and work without network).

  runApp(const ProviderScope(child: SaagarAuditApp()));
}
