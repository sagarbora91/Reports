import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'ui/screens/s01_splash/splash_screen.dart';
import 'ui/screens/s02_language/language_screen.dart';
import 'ui/screens/s03_first_setup/first_setup_screen.dart';
import 'ui/screens/s04_login/login_screen.dart';
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
        // S5+ routes added in subsequent W1.6 / W2 milestones.
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
