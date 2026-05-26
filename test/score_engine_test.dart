import 'package:flutter_test/flutter_test.dart';
import 'package:saagar_audit_app/domain/score_engine.dart';

/// The canonical test cases here MUST pass — they encode Workbook §5.1 and
/// the band boundaries from Spec §6.2. If these go red, the engine is wrong
/// (or the spec changed and the engine needs an update to match).
void main() {
  group('Band boundaries (Spec §6.2)', () {
    test('≥95.0 is excellent', () {
      expect(bandFromCompliance(100.0), Band.excellent);
      expect(bandFromCompliance(95.0), Band.excellent);
    });

    test('94.9 is good (not excellent)', () {
      expect(bandFromCompliance(94.9), Band.good);
    });

    test('≥90.0 is good', () {
      expect(bandFromCompliance(90.0), Band.good);
      expect(bandFromCompliance(94.9), Band.good);
    });

    test('89.9 is fair (the most-missed boundary per Workbook §1.5)', () {
      expect(bandFromCompliance(89.9), Band.fair);
    });

    test('≥85.0 is fair', () {
      expect(bandFromCompliance(85.0), Band.fair);
      expect(bandFromCompliance(89.9), Band.fair);
    });

    test('84.9 is poor', () {
      expect(bandFromCompliance(84.9), Band.poor);
    });

    test('≥80.0 is poor', () {
      expect(bandFromCompliance(80.0), Band.poor);
      expect(bandFromCompliance(84.9), Band.poor);
    });

    test('79.9 is critical', () {
      expect(bandFromCompliance(79.9), Band.critical);
    });

    test('below 80 is critical', () {
      expect(bandFromCompliance(0.0), Band.critical);
      expect(bandFromCompliance(50.0), Band.critical);
      expect(bandFromCompliance(79.9), Band.critical);
    });
  });

  group('NA handling (Spec §6.4)', () {
    test('5 NAs at weight 2 reduce max by 10', () {
      // Setup: 100 wt-1 P (max 100) - replace 5 with NA at wt 2.
      // After: max = 100 + (5 NAs excluded, but they weren't in the original 100)
      // Cleaner: 90 wt-1 P + 5 NAs at wt 2 → raw=90, max=90 → 100%
      final marks = <CheckpointMark>[
        for (var i = 0; i < 90; i++)
          CheckpointMark(checkpointId: 'p$i', result: Verdict.pass, weight: 1),
        for (var i = 0; i < 5; i++)
          CheckpointMark(checkpointId: 'na$i', result: Verdict.na, weight: 2),
      ];
      final r = scoreDaily(marks);
      expect(r.rawScore, 90);
      expect(r.maxScore, 90); // NAs at wt 2 do NOT add to max
      expect(r.naCount, 5);
      expect(r.compliancePct, 100.0);
      expect(r.band, Band.excellent);
    });

    test('Adding NA does not change the percentage', () {
      // 80 P + 20 F (wt 1 each) = 80/100 = 80% Poor
      final base = <CheckpointMark>[
        for (var i = 0; i < 80; i++)
          CheckpointMark(checkpointId: 'p$i', result: Verdict.pass, weight: 1),
        for (var i = 0; i < 20; i++)
          CheckpointMark(checkpointId: 'f$i', result: Verdict.fail, weight: 1),
      ];
      final r1 = scoreDaily(base);
      expect(r1.compliancePct, 80.0);
      expect(r1.band, Band.poor);

      // Add 5 NA — percentage stays the same.
      final withNa = [
        ...base,
        for (var i = 0; i < 5; i++)
          CheckpointMark(checkpointId: 'na$i', result: Verdict.na, weight: 2),
      ];
      final r2 = scoreDaily(withNa);
      expect(r2.compliancePct, 80.0);
      expect(r2.band, Band.poor);
    });
  });

  group('Workbook §5.1 canonical daily test (MUST equal 81/90 = 90.0% Good)',
      () {
    test('produces 81/90 = 90.0% Good exactly', () {
      // 12 observations per the canonical test case:
      //   F1: 1.4 F (wt 1) → 0
      //   F2: 2.1+2.2 P (wt 1+1) → 2
      //   F3: 3.x F (wt 1) → 0  [picked 3.7]
      //   F4: 4.x P (wt 1) → 1  [picked 4.1]
      //   F5: 5.x F (wt 1) → 0  [picked 5.6]
      //   F6: 6.5 P (wt 2) → 2
      //   F7: 6.11 F (wt 2) → 0
      //   F8: 6.9 F (wt 2) → 0
      //   F9: 7.1 P (wt 2) → 2
      //   F10: 7.3 P (wt 2) → 2
      //   F11: 7.8 F (wt 2) → 0
      //   F12: 8.x P (wt 1) → 1  [picked 8.4]
      //   --- 13 explicit marks: 10 earned of 19 max ---
      //   Plus 55 P on remaining checkpoints worth 71 weighted points.
      //   Total: 10 + 71 = 81 earned, 19 + 71 = 90 max → 90.0% exact.
      final explicit = <CheckpointMark>[
        const CheckpointMark(
            checkpointId: '1.4', result: Verdict.fail, weight: 1),
        const CheckpointMark(
            checkpointId: '2.1', result: Verdict.pass, weight: 1),
        const CheckpointMark(
            checkpointId: '2.2', result: Verdict.pass, weight: 1),
        const CheckpointMark(
            checkpointId: '3.7', result: Verdict.fail, weight: 1),
        const CheckpointMark(
            checkpointId: '4.1', result: Verdict.pass, weight: 1),
        const CheckpointMark(
            checkpointId: '5.6', result: Verdict.fail, weight: 1),
        const CheckpointMark(
            checkpointId: '6.5', result: Verdict.pass, weight: 2),
        const CheckpointMark(
            checkpointId: '6.11', result: Verdict.fail, weight: 2),
        const CheckpointMark(
            checkpointId: '6.9', result: Verdict.fail, weight: 2),
        const CheckpointMark(
            checkpointId: '7.1', result: Verdict.pass, weight: 2),
        const CheckpointMark(
            checkpointId: '7.3', result: Verdict.pass, weight: 2),
        const CheckpointMark(
            checkpointId: '7.8', result: Verdict.fail, weight: 2),
        const CheckpointMark(
            checkpointId: '8.4', result: Verdict.pass, weight: 1),
      ];

      // Remaining 55 checkpoints — fill with the seed weight distribution so
      // the unmarked-weight total is 71. The seed has 68 daily checkpoints;
      // explicit covers 13, so 55 remain.
      // Weight breakdown of remaining checkpoints (derived from seed):
      //   SOP1 remaining: 1.1,1.2,1.3,1.5,1.6 → 5 × wt 1 = 5
      //   SOP2 remaining: 2.3,2.4,2.5,2.6,2.7,2.8 → 6 × wt 1 = 6
      //   SOP3 remaining: 3.1,3.2,3.3,3.4,3.5,3.6 → 6 × wt 1 = 6
      //   SOP4 remaining: 4.2,4.3,4.4,4.5,4.6,4.7,4.8 → 7 × wt 1 = 7
      //   SOP5 remaining: 5.1,5.2,5.3,5.4,5.5,5.7,5.8,5.9 → 8 × wt 1 = 8
      //   SOP6 remaining: 6.1,6.2,6.3,6.4,6.6,6.7,6.8,6.10,6.12 → 9 × wt 2 = 18
      //   SOP7 remaining: 7.2,7.4,7.5,7.6,7.7,7.9,7.10 → 7 × wt 2 = 14
      //   SOP8 remaining: 8.1,8.2,8.3,8.5,8.6,8.7,8.8 → 7 × wt 1 = 7
      //   Sum count: 5+6+6+7+8+9+7+7 = 55 ✓
      //   Sum weighted: 5+6+6+7+8+18+14+7 = 71 ✓
      final remaining = <CheckpointMark>[
        // SOP1 (5 × wt 1)
        for (final id in ['1.1', '1.2', '1.3', '1.5', '1.6'])
          CheckpointMark(checkpointId: id, result: Verdict.pass, weight: 1),
        // SOP2 (6 × wt 1)
        for (final id in ['2.3', '2.4', '2.5', '2.6', '2.7', '2.8'])
          CheckpointMark(checkpointId: id, result: Verdict.pass, weight: 1),
        // SOP3 (6 × wt 1)
        for (final id in ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6'])
          CheckpointMark(checkpointId: id, result: Verdict.pass, weight: 1),
        // SOP4 (7 × wt 1)
        for (final id in ['4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8'])
          CheckpointMark(checkpointId: id, result: Verdict.pass, weight: 1),
        // SOP5 (8 × wt 1)
        for (final id in [
          '5.1', '5.2', '5.3', '5.4', '5.5', '5.7', '5.8', '5.9',
        ])
          CheckpointMark(checkpointId: id, result: Verdict.pass, weight: 1),
        // SOP6 (9 × wt 2)
        for (final id in [
          '6.1', '6.2', '6.3', '6.4', '6.6', '6.7', '6.8', '6.10', '6.12',
        ])
          CheckpointMark(checkpointId: id, result: Verdict.pass, weight: 2),
        // SOP7 (7 × wt 2)
        for (final id in [
          '7.2', '7.4', '7.5', '7.6', '7.7', '7.9', '7.10',
        ])
          CheckpointMark(checkpointId: id, result: Verdict.pass, weight: 2),
        // SOP8 (7 × wt 1)
        for (final id in ['8.1', '8.2', '8.3', '8.5', '8.6', '8.7', '8.8'])
          CheckpointMark(checkpointId: id, result: Verdict.pass, weight: 1),
      ];

      final all = [...explicit, ...remaining];
      expect(all.length, 68,
          reason: 'Daily audit has exactly 68 checkpoints (Workbook §2).');

      final r = scoreDaily(all);
      expect(r.rawScore, 81, reason: 'Workbook §5.1 canonical raw = 81');
      expect(r.maxScore, 90, reason: 'Workbook §5.1 canonical max = 90');
      expect(r.compliancePct, 90.0,
          reason: 'Workbook §5.1 canonical compliance = 90.0%');
      expect(r.band, Band.good,
          reason: 'Workbook §5.1 canonical band = Good');
      // Explicit observations: 7 P (2.1, 2.2, 4.1, 6.5, 7.1, 7.3, 8.4)
      // + 6 F (1.4, 3.7, 5.6, 6.11, 6.9, 7.8). Remaining 55 all P.
      expect(r.passCount, 62, reason: '7 explicit P + 55 implicit P = 62');
      expect(r.failCount, 6);
      expect(r.naCount, 0);
    });
  });
}
