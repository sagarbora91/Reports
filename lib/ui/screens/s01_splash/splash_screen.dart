import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../data/db/database.dart';
import '../../../providers/locale_provider.dart';
import '../../theme/app_colors.dart';

/// S1 Splash — boots the app, restores language pref, and routes the user.
///
/// Routing:
///   * no language saved              → /language (S2)
///   * language saved + no users      → /setup (S3)
///   * language saved + users exist   → /login (S4)
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _route());
  }

  Future<void> _route() async {
    await ref.read(localeProvider.notifier).load();
    if (!mounted) return;

    final locale = ref.read(localeProvider);
    if (locale == null) {
      context.goNamed('s02_language');
      return;
    }

    final isFirstLaunch = await AppDatabase.instance.isFirstLaunch();
    if (!mounted) return;

    if (isFirstLaunch) {
      context.goNamed('s03_first_setup');
    } else {
      context.goNamed('s04_login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.navy,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Saagar',
              style: TextStyle(
                fontFamily: 'DMSerifDisplay',
                fontSize: 56,
                color: AppColors.goldLight,
              ),
            ),
            SizedBox(height: 8),
            Text(
              'Audit',
              style: TextStyle(
                fontFamily: 'DMSans',
                fontSize: 18,
                letterSpacing: 4,
                color: AppColors.white,
              ),
            ),
            SizedBox(height: 64),
            SizedBox(
              width: 32,
              height: 32,
              child: CircularProgressIndicator(
                strokeWidth: 2.4,
                valueColor: AlwaysStoppedAnimation(AppColors.goldLight),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
