import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Persisted UI language. Spec §1 Decision 6: user picks EN or MR at login,
/// one language at a time. We store it in SharedPreferences and rehydrate on
/// app boot.
class LocaleNotifier extends StateNotifier<Locale?> {
  LocaleNotifier() : super(null);

  static const _prefKey = 'language_pref';

  /// Returns null if no language picked yet (S2 first-launch case).
  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(_prefKey);
    if (code != null) state = Locale(code);
  }

  Future<void> set(Locale locale) async {
    state = locale;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, locale.languageCode);
  }
}

final localeProvider =
    StateNotifierProvider<LocaleNotifier, Locale?>((ref) => LocaleNotifier());
