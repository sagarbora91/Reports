import 'package:bcrypt/bcrypt.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../data/db/database.dart';

/// Logged-in user identity. Null when nobody is logged in.
class AuthUser {
  const AuthUser({
    required this.id,
    required this.name,
    required this.role,
    required this.languagePref,
  });

  final String id;
  final String name;
  final String role; // 'SM' | 'GM' | 'OWNER'
  final String languagePref;
}

class AuthState {
  const AuthState({
    this.user,
    this.failedAttempts = 0,
    this.lockoutUntil,
  });

  final AuthUser? user;
  final int failedAttempts;
  final DateTime? lockoutUntil;

  bool get isLockedOut =>
      lockoutUntil != null && DateTime.now().isBefore(lockoutUntil!);

  Duration get lockoutRemaining {
    if (lockoutUntil == null) return Duration.zero;
    final left = lockoutUntil!.difference(DateTime.now());
    return left.isNegative ? Duration.zero : left;
  }

  AuthState copyWith({
    AuthUser? user,
    int? failedAttempts,
    DateTime? lockoutUntil,
    bool clearUser = false,
    bool clearLockout = false,
  }) {
    return AuthState(
      user: clearUser ? null : (user ?? this.user),
      failedAttempts: failedAttempts ?? this.failedAttempts,
      lockoutUntil: clearLockout ? null : (lockoutUntil ?? this.lockoutUntil),
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState());

  /// Per Spec §5 S4: 5 wrong PINs within 60 seconds triggers a 60-second
  /// lockout. We track attempts in-memory only (cleared on app restart, which
  /// is fine — the lockout is a defence against the on-device shoulder-surfer,
  /// not a server-side brute force).
  static const _maxAttempts = 5;
  static const _lockoutDuration = Duration(seconds: 60);

  /// Look up a user by id from the local DB and verify their PIN.
  /// Returns true on success and updates [state.user]; false otherwise.
  Future<bool> tryLogin({required String userId, required String pin}) async {
    if (state.isLockedOut) return false;

    final db = AppDatabase.instance.db;
    final rows = await db.query(
      'users',
      where: 'id = ? AND is_active = 1',
      whereArgs: [userId],
    );
    if (rows.isEmpty) return _registerFailure();

    final row = rows.first;
    final hash = row['pin_hash']! as String;

    if (!BCrypt.checkpw(pin, hash)) return _registerFailure();

    // Success — clear lockout state and stamp last_login_at.
    await db.update(
      'users',
      {'last_login_at': DateTime.now().toUtc().toIso8601String()},
      where: 'id = ?',
      whereArgs: [userId],
    );
    state = AuthState(
      user: AuthUser(
        id: row['id']! as String,
        name: row['name']! as String,
        role: row['role']! as String,
        languagePref: row['language_pref']! as String,
      ),
    );
    return true;
  }

  bool _registerFailure() {
    final newCount = state.failedAttempts + 1;
    if (newCount >= _maxAttempts) {
      state = state.copyWith(
        failedAttempts: 0,
        lockoutUntil: DateTime.now().add(_lockoutDuration),
      );
    } else {
      state = state.copyWith(failedAttempts: newCount);
    }
    return false;
  }

  void logout() {
    state = const AuthState();
  }
}

final authProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) => AuthNotifier());

/// Bcrypt-hashes a 4-digit PIN. Cost 10 per Spec §4.1.
String hashPin(String pin) => BCrypt.hashpw(pin, BCrypt.gensalt(logRounds: 10));

/// Creates a new user row in the local DB and returns its UUID. Used by S3
/// First-Time Setup (creates Owner) and S29 Manage Users (creates SM/GM).
Future<String> createUser({
  required String name,
  required String role, // 'SM' | 'GM' | 'OWNER'
  required String pin,
  String? phone,
  String languagePref = 'en',
  String? createdBy,
}) async {
  final db = AppDatabase.instance.db;
  final id = const Uuid().v4();
  await db.insert('users', {
    'id': id,
    'name': name,
    'role': role,
    'pin_hash': hashPin(pin),
    'language_pref': languagePref,
    'phone': phone,
    'is_active': 1,
    'created_at': DateTime.now().toUtc().toIso8601String(),
    'created_by': createdBy,
  });
  return id;
}
