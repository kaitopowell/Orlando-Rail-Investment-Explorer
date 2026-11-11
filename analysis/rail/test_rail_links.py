"""Hand-checkable tests for link classification and pricing (synthetic geometry, not real rail)."""

import unittest

from . import rail_params as P
from .links import (Projector, build_passenger_index, build_rail_graph, classify_connection,
                    classify_all, price, minutes_for, build_links)

PROJ = Projector(28.5)
LAT = 28.5
# points roughly 0.01 deg of longitude apart (about 0.98 km at this latitude)
X = [-81.40 + 0.01 * i for i in range(8)]


def line(lons, lat=LAT, **props):
    return {"type": "Feature", "properties": props,
            "geometry": {"type": "LineString", "coordinates": [(x, lat) for x in lons]}}


def empty_index():
    return build_passenger_index([], PROJ)


def km(a, b):
    return ((a[0] - b[0]) * PROJ.kx) if a[1] == b[1] else None


class ClassifyTests(unittest.TestCase):
    def setUp(self):
        self.a, self.b = (X[0], LAT), (X[5], LAT)
        self.straight = abs(X[5] - X[0]) * PROJ.kx

    def graph(self, features, passenger_lines=()):
        return build_rail_graph(features, PROJ, build_passenger_index(passenger_lines, PROJ))

    def test_freight_corridor_uses_real_rail_length(self):
        g = self.graph([line(X[:6])])
        info = classify_connection(self.a, self.b, self.straight, g, PROJ)
        self.assertEqual(info["cls"], "freight_corridor")
        self.assertAlmostEqual(info["rail_km"], self.straight, places=3)
        self.assertEqual(info["passenger_km"], 0.0)

    def test_passenger_shape_makes_it_passenger_corridor(self):
        g = self.graph([line(X[:6])], passenger_lines=[[(x, LAT) for x in X[:6]]])
        info = classify_connection(self.a, self.b, self.straight, g, PROJ)
        self.assertEqual(info["cls"], "passenger_corridor")
        self.assertAlmostEqual(info["passenger_km"], info["rail_km"], places=3)

    def test_no_rail_means_new_alignment(self):
        info = classify_connection(self.a, self.b, self.straight, {}, PROJ)
        self.assertEqual(info["cls"], "new_alignment")

    def test_center_too_far_from_rail_means_new(self):
        g = self.graph([line(X[:6], lat=LAT + 0.05)])   # about 5.5 km north
        info = classify_connection(self.a, self.b, self.straight, g, PROJ)
        self.assertEqual(info["cls"], "new_alignment")

    def test_circuitous_rail_is_rejected(self):
        # rail goes far north and back: path much longer than 1.5x the straight line
        detour = {"type": "Feature", "properties": {}, "geometry": {"type": "LineString", "coordinates":
                  [(X[0], LAT), (X[0], LAT + 0.1), (X[5], LAT + 0.1), (X[5], LAT)]}}
        g = self.graph([detour])
        info = classify_connection(self.a, self.b, self.straight, g, PROJ)
        self.assertEqual(info["cls"], "new_alignment")

    def test_sidings_and_yards_are_ignored(self):
        g = self.graph([line(X[:6], service="siding")])
        info = classify_connection(self.a, self.b, self.straight, g, PROJ)
        self.assertEqual(info["cls"], "new_alignment")

    def test_ways_that_share_a_node_join_up(self):
        g = self.graph([line(X[:3]), line(X[2:6])])
        info = classify_connection(self.a, self.b, self.straight, g, PROJ)
        self.assertEqual(info["cls"], "freight_corridor")


class PriceTests(unittest.TestCase):
    def test_new_alignment_price_by_hand(self):
        info = {"cls": "new_alignment"}
        length, cost = price(info, straight_km=16.09344, new_circuity=1.0, case=0)   # exactly 10 miles
        self.assertAlmostEqual(length, 16.09344)
        self.assertAlmostEqual(cost, 10 * P.COST_PER_MILE_M["new_alignment"][0])

    def test_corridor_blends_passenger_and_freight_rates(self):
        info = {"cls": "passenger_corridor", "rail_km": 3 * P.KM_PER_MILE,
                "passenger_km": 1 * P.KM_PER_MILE, "freight_km": 2 * P.KM_PER_MILE}
        _, cost = price(info, 1.0, 1.0, case=1)
        expected = P.COST_PER_MILE_M["passenger_corridor"][1] + 2 * P.COST_PER_MILE_M["freight_corridor"][1]
        self.assertAlmostEqual(cost, expected)

    def test_high_case_costs_more_than_low(self):
        for cls in P.COST_PER_MILE_M:
            lo, hi = P.COST_PER_MILE_M[cls]
            self.assertLess(lo, hi)

    def test_minutes_at_twenty_mph(self):
        self.assertAlmostEqual(minutes_for(20 * P.KM_PER_MILE, 20.0), 60.0)


class BuildTests(unittest.TestCase):
    def test_new_circuity_is_measured_and_never_below_one(self):
        feats = [line(X[:6])]
        g = build_rail_graph(feats, PROJ, empty_index())
        a, b = (X[0], LAT), (X[5], LAT)
        straight = abs(X[5] - X[0]) * PROJ.kx
        conns = [("A|B", "A", "B", a, b, straight)]
        infos, circ = classify_all(conns, g, PROJ)
        self.assertGreaterEqual(circ, 1.0)
        links = build_links(conns, infos, circ, case=0)
        self.assertEqual(len(links), 1)
        self.assertGreater(links[0].cost, 0)
        self.assertGreater(links[0].minutes, 0)

    def test_no_corridor_links_uses_default_circuity(self):
        conns = [("A|B", "A", "B", (X[0], LAT), (X[5], LAT), 5.0)]
        _, circ = classify_all(conns, {}, PROJ)
        self.assertEqual(circ, P.DEFAULT_NEW_CIRCUITY)


if __name__ == "__main__":
    unittest.main()
