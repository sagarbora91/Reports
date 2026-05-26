import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

/// Builds the global Flutter [ThemeData] matching the Saagar retail design
/// system. Headings use DM Serif Display; everything else uses DM Sans.
///
/// Fonts come from `google_fonts` for now (runtime download + cache). Before
/// the P1 release we bundle the TTFs to satisfy Spec §2's offline-first
/// requirement.
class AppTheme {
  static ThemeData light() {
    final display = GoogleFonts.dmSerifDisplayTextTheme();
    final body = GoogleFonts.dmSansTextTheme();

    final textTheme = body.copyWith(
      displayLarge: display.displayLarge?.copyWith(fontSize: 36),
      displayMedium: display.displayMedium?.copyWith(fontSize: 28),
      displaySmall: display.displaySmall?.copyWith(fontSize: 22),
      headlineMedium: display.headlineMedium?.copyWith(fontSize: 20),
      titleLarge: body.titleLarge?.copyWith(
        fontSize: 18,
        fontWeight: FontWeight.w600,
      ),
      titleMedium: body.titleMedium?.copyWith(
        fontSize: 16,
        fontWeight: FontWeight.w500,
      ),
      bodyLarge: body.bodyLarge?.copyWith(fontSize: 16),
      bodyMedium: body.bodyMedium?.copyWith(fontSize: 14),
      labelLarge: body.labelLarge?.copyWith(
        fontSize: 14,
        fontWeight: FontWeight.w600,
      ),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: AppColors.cream,
      colorScheme: const ColorScheme.light(
        primary: AppColors.navy,
        onPrimary: AppColors.white,
        secondary: AppColors.gold,
        onSecondary: AppColors.navy,
        surface: AppColors.white,
        onSurface: AppColors.gray800,
        error: AppColors.red,
        onError: AppColors.white,
      ),
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.navy,
        foregroundColor: AppColors.goldLight,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.dmSerifDisplay(
          fontSize: 22,
          color: AppColors.goldLight,
        ),
      ),
      cardTheme: CardTheme(
        color: AppColors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: const BorderSide(color: AppColors.gray200),
        ),
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.navy,
          foregroundColor: AppColors.white,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: GoogleFonts.dmSans(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.navy,
          side: const BorderSide(color: AppColors.navy, width: 1.5),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: GoogleFonts.dmSans(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.white,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.gray300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.gray300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.navy, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.red),
        ),
        labelStyle: GoogleFonts.dmSans(color: AppColors.gray600),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.gray200,
        thickness: 1,
        space: 1,
      ),
    );
  }

  AppTheme._();
}
