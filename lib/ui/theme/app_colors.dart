import 'package:flutter/material.dart';

/// Saagar Traders retail design system colours.
///
/// These are LOCKED — same palette is used across all Saagar HTML tools and
/// the spec mandates the app match that visual language.
class AppColors {
  // Brand
  static const navy = Color(0xFF0D2340);
  static const navyMid = Color(0xFF1A3A5C);
  static const navyLight = Color(0xFF264D7A);
  static const gold = Color(0xFFB8922A);
  static const goldLight = Color(0xFFD4A843);
  static const goldPale = Color(0xFFFDF6E3);
  static const cream = Color(0xFFFAF8F3);
  static const white = Color(0xFFFFFFFF);

  // Status — score bands (spec §6.2)
  static const excellent = Color(0xFF166534); // ≥95%
  static const good = Color(0xFF15803D); // ≥90%
  static const fair = Color(0xFFB45309); // ≥85%
  static const poor = Color(0xFFB91C1C); // ≥80%
  static const critical = Color(0xFFB91C1C); // <80% (same red, but used with stronger emphasis)

  // Status — semantic
  static const red = Color(0xFFB91C1C);
  static const redPale = Color(0xFFFEF2F2);
  static const amber = Color(0xFFB45309);
  static const amberPale = Color(0xFFFFFBEB);
  static const green = Color(0xFF166534);
  static const greenPale = Color(0xFFF0FDF4);
  static const greenMid = Color(0xFFBBF7D0);

  // Greys
  static const gray100 = Color(0xFFF4F4F5);
  static const gray200 = Color(0xFFE4E4E7);
  static const gray300 = Color(0xFFD4D4D8);
  static const gray400 = Color(0xFFA1A1AA);
  static const gray600 = Color(0xFF52525B);
  static const gray800 = Color(0xFF27272A);

  AppColors._();
}

/// Returns the band colour for a compliance percentage per spec §6.2.
/// Strict boundaries — 89.9 is FAIR, 84.9 is POOR, 79.9 is CRITICAL.
Color bandColor(double pct) {
  if (pct >= 95.0) return AppColors.excellent;
  if (pct >= 90.0) return AppColors.good;
  if (pct >= 85.0) return AppColors.fair;
  if (pct >= 80.0) return AppColors.poor;
  return AppColors.critical;
}
