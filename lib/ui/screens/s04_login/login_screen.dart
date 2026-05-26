import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../data/db/database.dart';
import '../../../providers/auth_provider.dart';
import '../../theme/app_colors.dart';
import '../../widgets/pin_numpad.dart';

/// S4 Login.
///
/// Per Spec §5 S4:
///   * Name dropdown sorted with Owner first, then GM, then SM (alpha within).
///   * 4-digit PIN via custom in-app numpad (no OS keyboard).
///   * 5 wrong attempts in 60s → 60-second lockout with countdown + shake.
///
/// On success, navigates to S5 Home (not yet built — for Week 1 we show a
/// placeholder confirmation).
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  List<Map<String, Object?>> _users = const [];
  String? _selectedUserId;
  bool _shakeNumpad = false;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> _loadUsers() async {
    final db = AppDatabase.instance.db;
    // Owner first, then GM, then SM. Alphabetical within role.
    final rows = await db.rawQuery('''
      SELECT id, name, role FROM users
      WHERE is_active = 1
      ORDER BY
        CASE role
          WHEN 'OWNER' THEN 0
          WHEN 'GM'    THEN 1
          WHEN 'SM'    THEN 2
        END,
        name COLLATE NOCASE
    ''');
    setState(() {
      _users = rows;
      _selectedUserId = rows.isNotEmpty ? rows.first['id'] as String : null;
      _loading = false;
    });
  }

  Future<void> _onPin(String pin) async {
    final uid = _selectedUserId;
    if (uid == null) return;

    final ok =
        await ref.read(authProvider.notifier).tryLogin(userId: uid, pin: pin);
    if (!mounted) return;

    if (ok) {
      context.goNamed('s05_home');
      return;
    }

    final auth = ref.read(authProvider);
    setState(() {
      _shakeNumpad = !_shakeNumpad;
      if (auth.isLockedOut) {
        _error =
            'Too many wrong attempts. Try again in ${auth.lockoutRemaining.inSeconds}s.';
      } else {
        _error = 'Wrong PIN. ${5 - auth.failedAttempts} attempts left.';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final auth = ref.watch(authProvider);
    final locked = auth.isLockedOut;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Saagar Audit'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Select your name',
                style: TextStyle(
                  fontFamily: 'DMSans',
                  fontSize: 14,
                  color: AppColors.gray600,
                ),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: _selectedUserId,
                items: [
                  for (final u in _users)
                    DropdownMenuItem(
                      value: u['id'] as String,
                      child: Text('${u['name']}  ·  ${u['role']}'),
                    ),
                ],
                onChanged: locked
                    ? null
                    : (v) => setState(() => _selectedUserId = v),
              ),
              const SizedBox(height: 32),
              const Text(
                'Enter your 4-digit PIN',
                textAlign: TextAlign.center,
                style: TextStyle(fontFamily: 'DMSans', fontSize: 14),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: Center(
                  child: locked
                      ? _buildLockout(auth.lockoutRemaining)
                      : PinNumpad(
                          onPinComplete: _onPin,
                          shake: _shakeNumpad,
                        ),
                ),
              ),
              if (_error != null) ...[
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontFamily: 'DMSans',
                    color: AppColors.red,
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLockout(Duration remaining) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.lock_clock_outlined,
            size: 48, color: AppColors.red),
        const SizedBox(height: 12),
        Text(
          'Locked. Try again in ${remaining.inSeconds}s.',
          style: const TextStyle(
            fontFamily: 'DMSans',
            fontSize: 16,
            color: AppColors.red,
          ),
        ),
      ],
    );
  }
}
