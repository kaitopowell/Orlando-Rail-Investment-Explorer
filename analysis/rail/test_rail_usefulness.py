"""Usefulness counts: savings buckets, marginal-over-existing, competitive-with-driving."""

import unittest

from .score import Link, Pair
from .usefulness import usefulness


class UsefulnessTests(unittest.TestCase):
    def test_buckets_and_total(self):
        built = [Link("x", "A", "B", 10, 100.0)]
        pairs = [Pair("A", "B", 100, 60.0, 20.0)]          # rail = 10 + 20 overhead = 30, saves 30
        u = usefulness(pairs, [], built, 20.0)
        self.assertEqual(u["job_minutes_saved"], 100 * 30)
        self.assertEqual(u["commuters_saving"], {"10": 100, "20": 100, "30": 100})
        self.assertEqual(u["top_pairs"], [])               # 100 workers is below the top-pair minimum

    def test_existing_rail_is_not_counted_as_a_gain(self):
        existing = [Link("e", "A", "B", 10, 0.0)]
        pairs = [Pair("A", "B", 1000, 60.0, 20.0)]
        u = usefulness(pairs, existing, [], 20.0)
        self.assertEqual(u["commuters_any"], 0)

    def test_competitive_with_driving_counts_only_new_viability(self):
        built = [Link("x", "A", "B", 10, 100.0)]
        pairs = [Pair("A", "B", 50, None, 20.0), Pair("A", "B", 70, 90.0, 20.0)]
        u = usefulness(pairs, [], built, 20.0)             # rail 30 min against driving 20: 30 <= 1.5 * 20, viable at both ratios
        self.assertEqual(u["rail_competitive_with_driving"], {"1.5": 120, "2.0": 120})
        u2 = usefulness(pairs, [], [Link("x", "A", "B", 25, 100.0)], 20.0)   # rail 45 min: above 1.5 * 20 and above 2.0 * 20, so not viable
        self.assertEqual(u2["rail_competitive_with_driving"], {"1.5": 0, "2.0": 0})

    def test_top_pairs_need_enough_workers(self):
        built = [Link("x", "A", "B", 10, 100.0), Link("y", "C", "D", 10, 100.0)]
        pairs = [Pair("A", "B", 5000, 80.0, 20.0), Pair("C", "D", 100, 200.0, 20.0)]
        u = usefulness(pairs, [], built, 20.0)
        self.assertEqual([(t["home"], t["work"]) for t in u["top_pairs"]], [("A", "B")])


if __name__ == "__main__":
    unittest.main()
