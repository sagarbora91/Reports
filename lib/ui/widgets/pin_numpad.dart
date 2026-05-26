import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_colors.dart';

/// Custom in-app PIN numpad (Spec §5 S4: "no OS keyboard for security").
///
/// Renders 4 PIN dots + a 3×4 number grid (1-9, blank, 0, backspace).
/// Calls [onPinComplete] as soon as the 4th digit is entered.
class PinNumpad extends StatefulWidget {
  const PinNumpad({
    required this.onPinComplete,
    this.shake = false,
    super.key,
  });

  final void Function(String pin) onPinComplete;

  /// Set true to trigger an error shake animation (used after a wrong PIN).
  final bool shake;

  @override
  State<PinNumpad> createState() => _PinNumpadState();
}

class _PinNumpadState extends State<PinNumpad>
    with SingleTickerProviderStateMixin {
  String _pin = '';
  late final AnimationController _shakeController;

  @override
  void initState() {
    super.initState();
    _shakeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 360),
    );
  }

  @override
  void didUpdateWidget(PinNumpad oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.shake && !oldWidget.shake) {
      HapticFeedback.heavyImpact();
      _shakeController.forward(from: 0).then((_) {
        if (mounted) setState(() => _pin = '');
      });
    }
  }

  @override
  void dispose() {
    _shakeController.dispose();
    super.dispose();
  }

  void _onDigit(String d) {
    if (_pin.length >= 4) return;
    HapticFeedback.selectionClick();
    setState(() => _pin = '$_pin$d');
    if (_pin.length == 4) {
      widget.onPinComplete(_pin);
    }
  }

  void _onBackspace() {
    if (_pin.isEmpty) return;
    HapticFeedback.selectionClick();
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _shakeController,
      builder: (context, child) {
        final dx =
            (_shakeController.value * 8) * (1 - _shakeController.value) * 4;
        final phase = (_shakeController.value * 6).floor() % 2 == 0 ? 1 : -1;
        return Transform.translate(
          offset: Offset(dx * phase, 0),
          child: child,
        );
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildDots(),
          const SizedBox(height: 32),
          _buildGrid(),
        ],
      ),
    );
  }

  Widget _buildDots() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < 4; i++)
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 10),
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i < _pin.length ? AppColors.navy : AppColors.gray200,
              border: Border.all(color: AppColors.navy, width: 1.5),
            ),
          ),
      ],
    );
  }

  Widget _buildGrid() {
    Widget cell(Widget child, {VoidCallback? onTap}) {
      return InkResponse(
        onTap: onTap,
        radius: 36,
        child: SizedBox(
          width: 72,
          height: 72,
          child: Center(child: child),
        ),
      );
    }

    Widget digit(int n) => cell(
          Text(
            '$n',
            style: const TextStyle(
              fontFamily: 'DMSerifDisplay',
              fontSize: 30,
              color: AppColors.navy,
            ),
          ),
          onTap: () => _onDigit('$n'),
        );

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [digit(1), digit(2), digit(3)],
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [digit(4), digit(5), digit(6)],
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [digit(7), digit(8), digit(9)],
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(width: 72, height: 72),
            digit(0),
            cell(
              const Icon(Icons.backspace_outlined, color: AppColors.gray600),
              onTap: _onBackspace,
            ),
          ],
        ),
      ],
    );
  }
}
