"""Route greedy: matches single-link greedy when every route is one link, and fixes its blind spot."""

import random
import unittest

from .fastgreedy import greedy_fast
from .routegreedy import greedy_routes
from .routes import build_routes, cheapest_path
from .score import Link, Pair, Params
from . import toy


def as_routes(links):
    return [(l.id, l.a, l.b, [l]) for l in links]


class RouteGreedyTests(unittest.TestCase):
    def test_single_link_routes_match_link_greedy(self):
        rng = random.Random(11)
        for trial in range(20):
            nodes = [f"n{i}" for i in range(7)]
            links = [Link(f"L{k}", *rng.sample(nodes, 2), minutes=rng.randint(2, 15), cost=rng.randint(50, 400))
                     for k in range(9)]
            pairs = []
            for _ in range(30):
                h, w = rng.sample(nodes, 2)
                pairs.append(Pair(h, w, rng.randint(1, 100), rng.choice([None, None, rng.randint(20, 90)]), rng.randint(5, 30)))
            params = Params(rng.choice([5, 10, 20]), rng.choice([1.5, 2.0, 3.0]))
            budget = rng.choice([300, 800, 5000])
            for measure in ("time_saved", "newly_connected"):
                a = greedy_fast(links, budget, pairs, params, measure)
                b = greedy_routes(as_routes(links), budget, pairs, params, measure)
                self.assertEqual([(s.link_id, round(s.gain, 6)) for s in a],
                                 [(s.route_id, round(s.gain, 6)) for s in b], (trial, measure))

    def test_route_sees_benefit_that_single_links_cannot(self):
        # toy pair A-E needs all four links; link-by-link greedy never reaches it with a tight budget
        only_ae = [Pair("A", "E", jobs=40, transit_min=None, car_min=30)]
        budget = 700
        single = greedy_fast(toy.LINKS, budget, only_ae, toy.PARAMS, "newly_connected")
        self.assertEqual(single, [])                       # each link alone gains nothing
        route = [("A>E", "A", "E", list(toy.LINKS))]
        steps = greedy_routes(route, budget, only_ae, toy.PARAMS, "newly_connected")
        self.assertEqual([s.route_id for s in steps], ["A>E"])
        self.assertEqual(steps[0].gain, 40)

    def test_shared_links_are_paid_for_once(self):
        ab, bc, bd = Link("AB", "A", "B", 5, 100), Link("BC", "B", "C", 5, 100), Link("BD", "B", "D", 5, 100)
        pairs = [Pair("A", "C", 100, 90, 10), Pair("A", "D", 50, 90, 10)]
        routes = [("A>C", "A", "C", [ab, bc]), ("A>D", "A", "D", [ab, bd])]
        steps = greedy_routes(routes, 1000, pairs, Params(5, 2.0), "time_saved")
        self.assertEqual([s.route_id for s in steps], ["A>C", "A>D"])
        self.assertEqual(steps[0].cost, 200)
        self.assertEqual(steps[1].cost, 100)               # AB already built
        self.assertEqual(steps[1].new_link_ids, ("BD",))

    def test_budget_stops_at_first_route_that_does_not_fit(self):
        routes = [("A>E", "A", "E", list(toy.LINKS))]
        self.assertEqual(greedy_routes(routes, 500, toy.PAIRS, toy.PARAMS, "time_saved"), [])

    def test_smaller_budget_is_a_prefix(self):
        routes = build_routes(toy.LINKS, ["A", "C", "E"])
        big = greedy_routes(routes, 10_000, toy.PAIRS, toy.PARAMS, "time_saved")
        small = greedy_routes(routes, big[0].total_cost, toy.PAIRS, toy.PARAMS, "time_saved")
        self.assertEqual(small, big[:1])


class RouteBuildingTests(unittest.TestCase):
    def test_cheapest_path_by_cost_not_hops(self):
        links = [Link("AB", "A", "B", 5, 500), Link("AC", "A", "C", 5, 100), Link("CB", "C", "B", 5, 100)]
        self.assertEqual([l.id for l in cheapest_path(links, "A", "B")], ["AC", "CB"])

    def test_unconnected_anchors_give_no_route(self):
        links = [Link("AB", "A", "B", 5, 100), Link("CD", "C", "D", 5, 100)]
        self.assertEqual(build_routes(links, ["A", "D"]), [])

    def test_duplicate_chains_are_listed_once(self):
        routes = build_routes(toy.LINKS, ["A", "C", "E"])
        ids = [frozenset(l.id for l in r[3]) for r in routes]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(routes), 3)    # A-C, A-E, C-E


if __name__ == "__main__":
    unittest.main()
