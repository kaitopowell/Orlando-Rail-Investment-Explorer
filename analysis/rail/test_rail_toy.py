"""Tests on the toy example in toy.py. Every expected number below was worked out by hand."""

import unittest

from . import toy
from .greedy import greedy
from .score import Link, Pair, Params, newly_connected, rail_minutes, report, time_saved


def by_id(*ids):
    return [l for l in toy.LINKS if l.id in ids]


class RailMinutes(unittest.TestCase):
    def test_path_plus_overhead(self):
        # A->C over AB and BC: 5 + 5 + 10 overhead = 20
        self.assertEqual(rail_minutes(by_id("AB", "BC"), "A", "C", toy.PARAMS), 20)

    def test_no_path_is_none(self):
        self.assertIsNone(rail_minutes(by_id("AB"), "A", "C", toy.PARAMS))

    def test_same_node_is_none(self):
        self.assertIsNone(rail_minutes(by_id("AB"), "A", "A", toy.PARAMS))

    def test_links_work_in_both_directions(self):
        self.assertEqual(rail_minutes(by_id("AB"), "B", "A", toy.PARAMS), 15)


class TimeSaved(unittest.TestCase):
    def test_single_links(self):
        # AB: pair P1 (40 jobs) 30 -> 15 min = 15 * 40
        self.assertEqual(time_saved(by_id("AB"), toy.PAIRS, toy.PARAMS), 600)
        # BC alone: only P2 uses it and P2 has no transit baseline, so nothing is saved
        self.assertEqual(time_saved(by_id("BC"), toy.PAIRS, toy.PARAMS), 0)
        # CD: P3 (20 jobs) 20 -> 15 min = 5 * 20
        self.assertEqual(time_saved(by_id("CD"), toy.PAIRS, toy.PARAMS), 100)

    def test_rail_slower_than_transit_saves_nothing(self):
        # DE: P6 transit 12 min, rail 5 + 10 = 15 min, so nobody switches
        self.assertEqual(time_saved(by_id("DE"), toy.PAIRS, toy.PARAMS), 0)

    def test_network_effect(self):
        # A->C needs both AB and BC: 100 jobs * (60 - 20) = 4000, plus P1 600
        self.assertEqual(time_saved(by_id("AB", "BC"), toy.PAIRS, toy.PARAMS), 4600)

    def test_everything_built(self):
        # P1 600, P3 100, P4 4000, P5 3000, P6 0, P8 2400
        self.assertEqual(time_saved(toy.LINKS, toy.PAIRS, toy.PARAMS), 10100)


class NewlyConnected(unittest.TestCase):
    def test_competitive_pair(self):
        # P2 B->C: rail 15 min, car 15, ratio 2.0 -> 15 <= 30, so its 50 jobs count
        self.assertEqual(newly_connected(by_id("BC"), toy.PAIRS, toy.PARAMS), 50)

    def test_needs_every_link(self):
        # P7 A->E needs all four links
        self.assertEqual(newly_connected(by_id("AB", "BC", "CD"), toy.PAIRS, toy.PARAMS), 50)
        self.assertEqual(newly_connected(toy.LINKS, toy.PAIRS, toy.PARAMS), 90)

    def test_ratio_boundary(self):
        # P2: rail 15 vs car 15. Exactly at the ratio counts; just under does not.
        pairs = [Pair("B", "C", jobs=50, transit_min=None, car_min=15)]
        self.assertEqual(newly_connected(by_id("BC"), pairs, Params(10.0, 1.0)), 50)
        self.assertEqual(newly_connected(by_id("BC"), pairs, Params(10.0, 0.99)), 0)

    def test_pairs_with_transit_are_not_counted(self):
        self.assertEqual(newly_connected(toy.LINKS, [toy.PAIRS[0]], toy.PARAMS), 0)

    def test_reported_separately(self):
        self.assertEqual(report(by_id("AB", "BC", "CD"), toy.PAIRS, toy.PARAMS),
                         {"time_saved": 7700, "newly_connected": 50})


class GreedyTimeSaved(unittest.TestCase):
    def objective(self, built):
        return time_saved(built, toy.PAIRS, toy.PARAMS)

    def test_budget_500(self):
        steps = greedy(toy.LINKS, 500, self.objective)
        self.assertEqual([s.link_id for s in steps], ["AB", "BC", "CD"])
        self.assertEqual([s.gain for s in steps], [600, 4000, 3100])
        self.assertEqual([s.total_cost for s in steps], [100, 300, 400])
        self.assertEqual(steps[-1].total_score, 7700)
        # DE (300) would bring spending to 700 > 500, so the plan stops

    def test_budget_700_builds_everything(self):
        steps = greedy(toy.LINKS, 700, self.objective)
        self.assertEqual([s.link_id for s in steps], ["AB", "BC", "CD", "DE"])
        self.assertEqual(steps[-1].gain, 2400)
        self.assertEqual(steps[-1].total_score, 10100)

    def test_zero_budget_builds_nothing(self):
        self.assertEqual(greedy(toy.LINKS, 0, self.objective), [])

    def test_smaller_budget_is_a_prefix_of_the_larger_plan(self):
        small = [s.link_id for s in greedy(toy.LINKS, 300, self.objective)]
        large = [s.link_id for s in greedy(toy.LINKS, 700, self.objective)]
        self.assertEqual(large[:len(small)], small)

    def test_deterministic(self):
        self.assertEqual(greedy(toy.LINKS, 700, self.objective), greedy(toy.LINKS, 700, self.objective))


class GreedyNewlyConnected(unittest.TestCase):
    def test_known_limit_of_greedy(self):
        objective = lambda built: newly_connected(built, toy.PAIRS, toy.PARAMS)
        steps = greedy(toy.LINKS, 700, objective)
        # BC alone connects P2's 50 jobs. After that, no single link adds anything,
        # because P7 (40 jobs) needs all four links. Greedy cannot see that.
        self.assertEqual([s.link_id for s in steps], ["BC"])
        self.assertEqual(steps[-1].total_score, 50)
        # building everything would give 90, so greedy is not optimal here
        self.assertEqual(objective(toy.LINKS), 90)


class Ties(unittest.TestCase):
    def test_equal_ratio_goes_to_smaller_id(self):
        links = [Link("Z", "A", "B", 5, 100), Link("M", "A", "B", 5, 100)]
        pairs = [Pair("A", "B", jobs=10, transit_min=40, car_min=10)]
        objective = lambda built: time_saved(built, pairs, toy.PARAMS)
        steps = greedy(links, 100, objective)
        self.assertEqual([s.link_id for s in steps], ["M"])

    def test_non_positive_cost_is_rejected(self):
        with self.assertRaises(ValueError):
            greedy([Link("X", "A", "B", 5, 0)], 100, lambda built: 0)


if __name__ == "__main__":
    unittest.main()
