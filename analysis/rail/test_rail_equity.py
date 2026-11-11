"""Equity measures checked by hand on four made-up tracts."""

import unittest

from .equity import covered, polygon_centroid, stations_xy, summarize, totals, weighted_median

# x, y in km already projected; households, no-vehicle households, population, poverty %, income
def tract(i, x, y, hh, nv, pop, pov, inc, small=False):
    return {"geoid": str(i), "x": x, "y": y, "households": hh, "hh_no_vehicle": nv, "population": pop,
            "pct_poverty": pov, "median_income": inc, "small_base": small}


TRACTS = [tract(1, 0, 0, 1000, 200, 3000, 30.0, 30000),     # near the station, poorer, many no-car households
          tract(2, 1, 0, 1000, 100, 3000, 20.0, 50000),     # near
          tract(3, 10, 0, 2000, 40, 6000, 5.0, 100000),     # far, richer
          tract(4, 20, 0, 1000, 10, 3000, None, None, True)]  # far, no poverty/income data


class EquityTests(unittest.TestCase):
    def test_centroid_of_a_square(self):
        # a square 0.01 degrees on a side; centroid should be its middle
        ring = [(-81.0, 28.0), (-80.99, 28.0), (-80.99, 28.01), (-81.0, 28.01), (-81.0, 28.0)]
        x, y = polygon_centroid(ring[:-1])
        from .equity import _project
        ex, ey = _project(-80.995, 28.005)
        self.assertAlmostEqual(x, ex, places=6)
        self.assertAlmostEqual(y, ey, places=6)

    def test_covered_by_radius_boundary(self):
        st = [(0.0, 0.0)]
        self.assertEqual([t["geoid"] for t in covered(TRACTS, st, 1.0)], ["1", "2"])   # distance exactly 1.0 counts
        self.assertEqual([t["geoid"] for t in covered(TRACTS, st, 0.5)], ["1"])
        self.assertEqual(covered(TRACTS, [], 5.0), [])

    def test_totals_skip_missing_poverty(self):
        t = totals(TRACTS)
        self.assertEqual(t["households"], 5000)
        self.assertEqual(t["hh_no_vehicle"], 350)
        self.assertEqual(t["poverty_population_base"], 12000)             # tract 4 excluded
        self.assertAlmostEqual(t["people_in_poverty"], 3000 * .3 + 3000 * .2 + 6000 * .05)

    def test_summary_by_hand(self):
        region = totals(TRACTS)
        s = summarize(covered(TRACTS, [(0.0, 0.0)], 1.5), region)
        self.assertEqual(s["tracts"], 2)
        self.assertAlmostEqual(s["share_of_households"], 2000 / 5000)
        self.assertAlmostEqual(s["share_of_no_vehicle_households"], 300 / 350)
        self.assertAlmostEqual(s["no_vehicle_ratio"], (300 / 350) / (2000 / 5000))
        self.assertAlmostEqual(s["share_of_people_in_poverty"], (900 + 600) / 1800)
        self.assertAlmostEqual(s["poverty_ratio"], ((900 + 600) / 1800) / (6000 / 12000))

    def test_empty_plan(self):
        s = summarize([], totals(TRACTS))
        self.assertEqual(s["tracts"], 0)
        self.assertEqual(s["share_of_households"], 0.0)

    def test_weighted_median(self):
        self.assertEqual(weighted_median([(10, 1), (20, 1), (30, 1)]), 20)
        self.assertEqual(weighted_median([(10, 1), (20, 5)]), 20)
        self.assertIsNone(weighted_median([(None, 5)]))


if __name__ == "__main__":
    unittest.main()
