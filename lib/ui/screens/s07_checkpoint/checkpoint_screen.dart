import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../data/models/checkpoint.dart';
import '../../../data/repositories/checkpoint_repository.dart';
import '../../../providers/draft_audit_provider.dart';
import '../../theme/app_colors.dart';

/// S7 Checkpoint Screen — the heart of the daily audit flow.
///
/// Per Spec §5 S7:
///   * Top progress bar "Checkpoint N of 68"
///   * SOP context chip (color-coded; critical SOPs ★ in gold)
///   * Three big buttons PASS / FAIL / NA
///   * PASS auto-advances after 200ms
///   * FAIL → S8 (Fail Detail)
///   * NA → modal asking reason, then advances
class CheckpointScreen extends ConsumerStatefulWidget {
  const CheckpointScreen({super.key});

  @override
  ConsumerState<CheckpointScreen> createState() => _CheckpointScreenState();
}

class _CheckpointScreenState extends ConsumerState<CheckpointScreen> {
  Map<String, String> _sopNamesById = const {};

  @override
  void initState() {
    super.initState();
    _loadSopNames();
  }

  Future<void> _loadSopNames() async {
    final sops = await CheckpointRepository.instance.loadAllSops();
    if (!mounted) return;
    setState(() {
      _sopNamesById = {for (final s in sops) s.id: s.nameEn};
    });
  }

  Future<void> _onPass(Checkpoint cp) async {
    await ref.read(draftAuditProvider.notifier).mark(Verdict.pass);
    // Tiny "good" haptic + slight pause so the user sees the tick.
    await Future<void>.delayed(const Duration(milliseconds: 200));
    if (!mounted) return;
    _maybeFinishOrAdvance();
  }

  Future<void> _onFail(Checkpoint cp) async {
    // Persist as F with empty finding for now — S8 will fill the detail and
    // call completeFailDetail() to advance.
    await ref.read(draftAuditProvider.notifier).mark(Verdict.fail);
    if (!mounted) return;
    await context.pushNamed('s08_fail_detail');
    // After S8 pops we expect currentIndex to have advanced. If user backed
    // out, stay put — they can mark again.
  }

  Future<void> _onNa(Checkpoint cp) async {
    final reason = await _askNaReason(cp);
    if (reason == null) return; // user cancelled
    await ref
        .read(draftAuditProvider.notifier)
        .mark(Verdict.na, findingText: reason);
    if (!mounted) return;
    _maybeFinishOrAdvance();
  }

  void _maybeFinishOrAdvance() {
    final state = ref.read(draftAuditProvider);
    if (state.currentIndex >= state.checkpoints.length) {
      // Audit complete — for Week 2 just bounce back to Home; submission
      // lands in W3 (S10/S11).
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'All checkpoints marked. Submit screen (S10) lands in week 3.',
          ),
        ),
      );
      context.goNamed('s05_home');
    }
    // Otherwise the provider already advanced currentIndex; the build will
    // rerun and show the next checkpoint.
  }

  Future<String?> _askNaReason(Checkpoint cp) async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Why is ${cp.id} not applicable?'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 200,
          decoration: const InputDecoration(
            hintText: 'e.g. counter closed today, no high-value sales',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final r = controller.text.trim();
              if (r.length < 3) return;
              Navigator.of(ctx).pop(r);
            },
            child: const Text('Mark N/A'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(draftAuditProvider);
    final cp = state.currentCheckpoint;

    if (!state.isActive || cp == null) {
      return const Scaffold(
        body: Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'No active draft audit. Go back to Home and start one.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    final total = state.checkpoints.length;
    final n = state.currentIndex + 1;
    final progress = n / total;
    final sopName = _sopNamesById[cp.sopId] ?? cp.sopId;
    final isCritical = cp.sopId == 'SOP6' || cp.sopId == 'SOP7';

    return Scaffold(
      appBar: AppBar(
        title: Text('Checkpoint $n of $total'),
        leading: state.currentIndex == 0
            ? IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => context.goNamed('s05_home'),
              )
            : IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () =>
                    ref.read(draftAuditProvider.notifier).goBack(),
              ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            LinearProgressIndicator(
              value: progress,
              minHeight: 4,
              backgroundColor: AppColors.gray200,
              color: AppColors.gold,
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Row(
                children: [
                  _sopChip(sopName, cp.sopId, isCritical),
                  const SizedBox(width: 8),
                  Text(
                    'CP ${cp.id}',
                    style: const TextStyle(
                      color: AppColors.gray400,
                      fontFamily: 'DMSans',
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      cp.textEn,
                      style: const TextStyle(
                        fontFamily: 'DMSerifDisplay',
                        fontSize: 28,
                        color: AppColors.navy,
                        height: 1.25,
                      ),
                    ),
                    if (cp.evidenceEn != null) ...[
                      const SizedBox(height: 12),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.lightbulb_outline,
                            size: 16,
                            color: AppColors.gray400,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Evidence: ${cp.evidenceEn}',
                              style: const TextStyle(
                                fontFamily: 'DMSans',
                                color: AppColors.gray600,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (cp.requiresPhotoOnFail) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.redPale,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: AppColors.red),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.camera_alt_outlined,
                                size: 14, color: AppColors.red),
                            SizedBox(width: 6),
                            Text(
                              'Photo required if FAIL',
                              style: TextStyle(
                                color: AppColors.red,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            _verdictButtons(cp),
            _miniStats(state),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _sopChip(String name, String sopId, bool isCritical) {
    final bg = isCritical ? AppColors.goldPale : AppColors.gray100;
    final fg = isCritical ? AppColors.gold : AppColors.navy;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (isCritical)
            const Padding(
              padding: EdgeInsets.only(right: 4),
              child:
                  Icon(Icons.star_rounded, color: AppColors.gold, size: 14),
            ),
          Text(
            name,
            style: TextStyle(
              color: fg,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _verdictButtons(Checkpoint cp) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: [
          SizedBox(
            width: double.infinity,
            height: 60,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.green,
                foregroundColor: AppColors.white,
              ),
              onPressed: () => _onPass(cp),
              child: const Text(
                'PASS',
                style: TextStyle(
                  fontFamily: 'DMSerifDisplay',
                  fontSize: 22,
                  letterSpacing: 2,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            height: 60,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.red,
                foregroundColor: AppColors.white,
              ),
              onPressed: () => _onFail(cp),
              child: const Text(
                'FAIL',
                style: TextStyle(
                  fontFamily: 'DMSerifDisplay',
                  fontSize: 22,
                  letterSpacing: 2,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          if (cp.allowsNa)
            SizedBox(
              width: double.infinity,
              height: 48,
              child: OutlinedButton(
                onPressed: () => _onNa(cp),
                child: const Text(
                  'N/A',
                  style: TextStyle(
                    fontFamily: 'DMSans',
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.5,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _miniStats(DraftAuditState state) {
    Widget pill(String label, int count, Color color) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Column(
          children: [
            Text(
              '$count',
              style: TextStyle(
                fontFamily: 'DMSerifDisplay',
                fontSize: 20,
                color: color,
              ),
            ),
            Text(
              label,
              style: const TextStyle(
                fontFamily: 'DMSans',
                fontSize: 11,
                color: AppColors.gray600,
              ),
            ),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          pill('PASS', state.passCount, AppColors.green),
          pill('FAIL', state.failCount, AppColors.red),
          pill('N/A', state.naCount, AppColors.gray600),
        ],
      ),
    );
  }
}
