import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../data/db/database.dart';
import '../../../providers/locale_provider.dart';
import '../../theme/app_colors.dart';

/// S2 Language Selection (first launch only).
///
/// Spec §1 Decision 6: bilingual UI, one language at a time. After
/// selection, routes to S3 (first-time setup) if no users exist, else S4.
class LanguageScreen extends ConsumerWidget {
  const LanguageScreen({super.key});

  Future<void> _pick(BuildContext context, WidgetRef ref, String code) async {
    await ref.read(localeProvider.notifier).set(Locale(code));
    if (!context.mounted) return;

    final firstLaunch = await AppDatabase.instance.isFirstLaunch();
    if (!context.mounted) return;
    context.goNamed(firstLaunch ? 's03_first_setup' : 's04_login');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              const Text(
                'Choose your language\nतुमची भाषा निवडा',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: 'DMSerifDisplay',
                  fontSize: 28,
                  color: AppColors.navy,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 56),
              _buildButton(
                context,
                label: 'English',
                onPressed: () => _pick(context, ref, 'en'),
              ),
              const SizedBox(height: 16),
              _buildButton(
                context,
                label: 'मराठी',
                onPressed: () => _pick(context, ref, 'mr'),
              ),
              const Spacer(),
              const Text(
                'You can change this later from Settings.\nहे तुम्ही नंतर सेटिंग्जमधून बदलू शकता.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: 'DMSans',
                  fontSize: 13,
                  color: AppColors.gray600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildButton(
    BuildContext context, {
    required String label,
    required VoidCallback onPressed,
  }) {
    return SizedBox(
      height: 64,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: AppColors.gold, width: 2),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontFamily: 'DMSerifDisplay',
            fontSize: 22,
            color: AppColors.navy,
          ),
        ),
      ),
    );
  }
}
