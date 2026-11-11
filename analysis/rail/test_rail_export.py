"""The exported plan must be internally consistent; these tests build a tiny plan and break it on purpose."""

import copy
import unittest

from .export_plan import build_plan, scenario_id, validate


def tiny():
    centers = {"features": [
        {"properties": {"id": "A", "total_jobs": 100, "total_population": 50.0}, "geometry": {"coordinates": [-81.0, 28.0]}},
        {"properties": {"id": "B", "total_jobs": 10, "total_population": 500.0}, "geometry": {"coordinates": [-81.1, 28.1]}},
        {"properties": {"id": "C", "total_jobs": 10, "total_population": 5.0}, "geometry": {"coordinates": [-81.2, 28.2]}}]}
    conns = {"features": [
        {"properties": {"from_id": "A", "to_id": "B"}, "geometry": {"coordinates": [[-81.0, 28.0], [-81.1, 28.1]]}},
        {"properties": {"from_id": "B", "to_id": "C"}, "geometry": {"coordinates": [[-81.1, 28.1], [-81.2, 28.2]]}}]}
    rows = [{"link_id": "A|B", "class": "new_alignment", "length_km": "5", "cost_low_musd": "100.0", "cost_high_musd": "200.0"},
            {"link_id": "B|C", "class": "freight_corridor", "length_km": "3", "cost_low_musd": "50.0", "cost_high_musd": "90.0"}]
    runs = [{"cost": "low", "overhead_min": 20.0, "measure": "time_saved", "ratio": None, "order": [
        {"route_id": "A>C", "from": "A", "to": "C", "new_link_ids": ["A|B", "B|C"], "gain": 10.0, "cost_musd": 150.0,
         "total_cost_musd": 150.0, "total_score": 10.0}],
        "by_budget": [{"budget_musd": 100, "routes": 0, "links": 0, "spent_musd": 0, "score": 0},
                      {"budget_musd": 200, "routes": 1, "links": 2, "spent_musd": 150.0, "score": 10.0}]}]
    return build_plan(centers, conns, rows, runs, {"A": "Alpha"}, ["A"], {"workers_with_transit_option": 1})


class ExportTests(unittest.TestCase):
    def test_valid_plan_passes(self):
        self.assertTrue(validate(tiny()))

    def test_unnamed_center_gets_a_label(self):
        names = {c["id"]: c["name"] for c in tiny()["centers"]}
        self.assertEqual(names, {"A": "Alpha", "B": "Unnamed center", "C": "Unnamed center"})

    def test_scenario_ids(self):
        self.assertEqual(scenario_id({"measure": "time_saved", "cost": "low", "overhead_min": 20.0, "ratio": None}), "low-oh20-minutes")
        self.assertEqual(scenario_id({"measure": "newly_connected", "cost": "high", "overhead_min": 10.0, "ratio": 1.5}), "high-oh10-connected-r1.5")

    def test_core_links_are_in_every_minutes_plan(self):
        self.assertEqual(tiny()["core_link_ids"], ["A|B", "B|C"])

    def test_catches_unknown_link(self):
        p = tiny(); p["scenarios"][0]["steps"][0]["new_link_ids"] = ["A|B", "X|Y"]
        with self.assertRaises(AssertionError):
            validate(p)

    def test_catches_cost_mismatch(self):
        p = tiny(); p["scenarios"][0]["steps"][0]["cost_musd"] = 999.0
        with self.assertRaises(AssertionError):
            validate(p)

    def test_catches_link_built_twice(self):
        p = tiny(); st = copy.deepcopy(p["scenarios"][0]["steps"][0])
        p["scenarios"][0]["steps"].append(st)
        with self.assertRaises(AssertionError):
            validate(p)


if __name__ == "__main__":
    unittest.main()
