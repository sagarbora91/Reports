import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'ui/screens/s01_splash/splash_screen.dart';
import 'ui/screens/s02_language/language_screen.dart';
import 'ui/screens/s03_first_setup/first_setup_screen.dart';
import 'ui/screens/s04_login/login_screen.dart';
import 'ui/screens/s05_home/home_screen.dart';
import 'ui/screens/s06_start_audit/start_audit_screen.dart';
import 'ui/screens/s07_checkpoint/checkpoint_screen.dart';
import 'ui/screens/s08_fail_detail/fail_detail_screen.dart';
import 'ui/theme/app_theme.dart';

/// Root app widget. Owns the [GoRouter] and the [MaterialApp] config.
class SaagarAuditApp extends ConsumerWidget {
  const SaagarAuditApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(
          path: '/',
          name: 's01_splash',
          builder: (_, __) => const SplashScreen(),
        ),
        GoRoute(
          path: '/language',
          name: 's02_language',
          builder: (_, __) => const LanguageScreen(),
        ),
        GoRoute(
          path: '/setup',
          name: 's03_first_setup',
          builder: (_, __) => const FirstSetupScreen(),
        ),
        GoRoute(
          path: '/login',
          name: 's04_login',
          builder: (_, __) => const LoginScreen(),
        ),
        GoRoute(
          path: '/home',
          name: 's05_home',
          builder: (_, __) => const HomeScreen(),
        ),
        GoRoute(
          path: '/audit/start',
          name: 's06_start_audit',
          builder: (_, __) => const StartAuditScreen(),
        ),
        GoRoute(
          path: '/audit/checkpoint',
          name: 's07_checkpoint',
          builder: (_, __) => const CheckpointScreen(),
        ),
        GoRoute(
          path: '/audit/fail-detail',
          name: 's08_fail_detail',
          builder: (_, __) => const FailDetailScreen(),
        ),
        // S9 Photo Capture is folded into S8 (inline camera launch).
        // S10–S32 land in Week 3+.
      ],
    );

    return MaterialApp.router(
      title: 'Saagar Audit',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: router,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('en'),
        Locale('mr'),
      ],
    );
  }
}
