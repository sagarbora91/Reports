/// Score engine for daily audits (Spec §6.1 – §6.4).
///
/// Pure functions only — no IO, no database. Audit submission code wires
/// the engine's output back to the `audits` table.
///
/// Hard rule (Spec §14.1 Rule #4): canonical test cases MUST pass. The
/// Workbook §5.1 daily case must produce 81 / 90 = 90.0% Good exactly.

/// A single audit result for scoring. `weight` is copied from the
/// checkpoint definition so this engine has no DB dependency.
class CheckpointMark {
  const CheckpointMark({
    required this.checkpointId,
    required this.result,
    required this.weight,
  });

  final String checkpointId;
  final Verdict result;
  final int weight; // 1 or 2

  /// `null` for NA (excluded from both numerator and denominator per §6.4).
  /// `0` for F, `weight` for P.
  double? get weightedPoints {
    switch (result) {
      case Verdict.pass:
        return weight.toDouble();
      case Verdict.fail:
        return 0.0;
      case Verdict.na:
        return null;
    }
  }
}

enum Verdict { pass, fail, na }

enum Band { excellent, good, fair, poor, critical }

/// Output of scoring a daily audit.
class ScoreResult {
  const ScoreResult({
    required this.rawScore,
    required this.maxScore,
    required this.compliancePct,
    required this.band,
    required this.passCount,
    required this.failCount,
    required this.naCount,
  });

  final double rawScore;
  final double maxScore;
  final double compliancePct; // 1 decimal, never round before band calc
  final Band band;
  final int passCount;
  final int failCount;
  final int naCount;

  @override
  String toString() =>
      'ScoreResult(raw=$rawScore, max=$maxScore, pct=$compliancePct%, band=$band, '
      'P=$passCount F=$failCount NA=$naCount)';
}

/// Computes a daily audit score per Spec §6.1.
ScoreResult scoreDaily(List<CheckpointMark> marks) {
  if (marks.isEmpty) {
    throw ArgumentError('scoreDaily: must have at least one mark');
  }

  var rawScore = 0.0;
  var maxScore = 0.0;
  var pass = 0;
  var fail = 0;
  var na = 0;

  for (final m in marks) {
    switch (m.result) {
      case Verdict.pass:
        rawScore += m.weight;
        maxScore += m.weight;
        pass++;
      case Verdict.fail:
        // raw += 0, but max still counts the weight
        maxScore += m.weight;
        fail++;
      case Verdict.na:
        // Excluded from both — touch nothing
        na++;
    }
  }

  if (maxScore == 0) {
    // Every mark was NA — undefined compliance. Per spec ambiguity, treat as
    // Excellent (no Fails) rather than divide-by-zero. Will need confirmation
    // from Sagar if this edge case ever surfaces in real data.
    return ScoreResult(
      rawScore: 0,
      maxScore: 0,
      compliancePct: 100.0,
      band: Band.excellent,
      passCount: pass,
      failCount: fail,
      naCount: na,
    );
  }

  // Round to 1 decimal — `band` then derived from the rounded value per §6.2.
  // Using `round` (banker's would change the math at boundaries).
  final pct = _round1((rawScore / maxScore) * 100.0);
  final band = bandFromCompliance(pct);

  return ScoreResult(
    rawScore: rawScore,
    maxScore: maxScore,
    compliancePct: pct,
    band: band,
    passCount: pass,
    failCount: fail,
    naCount: na,
  );
}

/// Strict band boundaries per Spec §6.2.
/// 89.9 → fair, 84.9 → poor, 79.9 → critical. Always use the rounded pct.
Band bandFromCompliance(double pct) {
  if (pct >= 95.0) return Band.excellent;
  if (pct >= 90.0) return Band.good;
  if (pct >= 85.0) return Band.fair;
  if (pct >= 80.0) return Band.poor;
  return Band.critical;
}

double _round1(double v) => (v * 10).round() / 10.0;
