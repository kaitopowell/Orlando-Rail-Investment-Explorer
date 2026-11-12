"""Planning on top of existing rail: marginal scores, connected growth, tree growth."""

import unittest

from .network import merge_anchors, merge_links, merge_pairs
from .routegreedy import greedy_routes
from .score import Link, Pair, Params

PARAMS = Params(overhead_min=0.0, ratio=2.0)


def routes_of(links):
    return [(l.id, l.a, l.b, [l]) for l in links]


class ExistingRailTests(unittest.TestCase):
    def test_existing_rail_is_free_and_not_counted_as_a_gain(self):
        existing = [Link("e1", "S", "T", minutes=10, cost=0.0)]
        pairs = [Pair("S", "T", jobs=10, transit_min=60, car_min=20)]
        # the only candidate adds nothing for S-T, so nothing is built and the score stays at zero
        steps = greedy_routes(routes_of([Link("x", "T", "U", 5, 100)]), 1000, pairs, PARAMS, "time_saved",
                              existing_links=existing)
        self.assertEqual(steps, [])

    def test_new_link_uses_existing_rail_to_reach_further(self):
        existing = [Link("e1", "S", "T", minutes=10, cost=0.0)]
        pairs = [Pair("S", "U", jobs=10, transit_min=60, car_min=20)]
        steps = greedy_routes(routes_of([Link("x", "T", "U", 5, 100)]), 1000, pairs, PARAMS, "time_saved",
                              existing_links=existing)
        self.assertEqual(len(steps), 1)
        self.assertAlmostEqual(steps[0].gain, 10 * (60 - 15))     # S-T on SunRail (10) + T-U new (5)


class GrowthRuleTests(unittest.TestCase):
    def setUp(self):
        self.existing = [Link("e1", "S", "T", minutes=10, cost=0.0)]
        # a floating pair far from the network pays well, but cannot be built until something connects it
        self.floating = Link("f", "X", "Y", 5, 100)
        self.bridge = Link("b", "T", "X", 5, 100)
        self.pairs = [Pair("X", "Y", 1000, 90, 10), Pair("S", "X", 1, 90, 10)]

    def test_connected_growth_blocks_floating_route(self):
        steps = greedy_routes(routes_of([self.floating, self.bridge]), 150, self.pairs, PARAMS, "time_saved",
                              existing_links=self.existing, seed_nodes=["S", "T"], require_connected=True)
        self.assertEqual([s.route_id for s in steps], ["b"])      # floating link only after it has a bridge

    def test_without_the_rule_the_floating_route_is_built_first(self):
        steps = greedy_routes(routes_of([self.floating, self.bridge]), 150, self.pairs, PARAMS, "time_saved",
                              existing_links=self.existing, seed_nodes=["S", "T"])
        self.assertEqual(steps[0].route_id, "f")

    def test_tree_growth_blocks_closing_a_loop(self):
        ring = [Link("a", "S", "A", 5, 50), Link("c", "A", "T", 5, 50)]
        pairs = [Pair("S", "A", 100, 90, 10), Pair("A", "T", 100, 90, 10)]
        route = [("ring", "S", "T", ring)]          # both links attach to the network at S and T
        loose = greedy_routes(route, 1000, pairs, PARAMS, "time_saved", existing_links=self.existing,
                              seed_nodes=["S", "T"], require_connected=True)
        tree = greedy_routes(route, 1000, pairs, PARAMS, "time_saved", existing_links=self.existing,
                             seed_nodes=["S", "T"], tree_growth=True)
        self.assertEqual(len(loose), 1)
        self.assertEqual(tree, [])


class MergeTests(unittest.TestCase):
    def test_merge_drops_loops_duplicates_and_station_to_station_links(self):
        nm = {"c1": "st:A", "c2": "st:A", "c3": "st:B", "c4": "c4"}
        existing = [Link("e", "st:A", "st:B", 5, 0.0)]
        links = [Link("l1", "c1", "c2", 3, 10),        # both ends become st:A: dropped
                 Link("l2", "c1", "c3", 3, 10),        # st:A to st:B duplicates existing rail: dropped
                 Link("l3", "c1", "c4", 3, 30), Link("l4", "c2", "c4", 3, 20)]   # parallel: cheaper kept
        out = merge_links(links, nm, existing)
        self.assertEqual([(l.id, l.a, l.b) for l in out], [("l4", "st:A", "c4")])

    def test_merge_pairs_and_anchors(self):
        nm = {"c1": "st:A", "c2": "st:A", "c3": "c3"}
        pairs = [Pair("c1", "c2", 5, 10, 5), Pair("c1", "c3", 7, None, 8)]
        self.assertEqual([(p.home, p.work, p.jobs) for p in merge_pairs(pairs, nm)], [("st:A", "c3", 7)])
        self.assertEqual(merge_anchors(["c1", "c2", "c3"], nm), ["c3", "st:A"])


if __name__ == "__main__":
    unittest.main()
