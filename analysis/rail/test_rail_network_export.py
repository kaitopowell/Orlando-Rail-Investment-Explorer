"""The network export must be internally consistent; build a tiny one and break it on purpose."""

import copy
import unittest

from .export_network import build_network_export, short, validate
from .score import Link


def tiny():
    centers = [{"id": "C1", "name": "East", "lon": -81.2, "lat": 28.5}, {"id": "C2", "name": "Far East (x)", "lon": -81.1, "lat": 28.5}]
    stations = [{"name": "Hub", "system": "sunrail", "lon": "-81.3", "lat": "28.5"}]
    links = [Link("h1", "station:Hub", "C1", 10, 100.0), Link("h2", "C1", "C2", 8, 80.0), Link("h3", "station:Hub", "C2", 30, 500.0)]
    ctx = {"links": links, "existing": [], "meta": {l.id: {"class": "new_alignment", "length_km": 5.0} for l in links}}
    runs = [{"cost": c, "overhead_min": 20.0, "measure": "time_saved", "ratio": None,
             "order": [{"route_id": "r1", "from": "station:Hub", "to": "C2", "new_link_ids": ["h1", "h2"], "gain": 5.0,
                        "cost_musd": 180.0, "total_cost_musd": 180.0, "total_score": 5.0}],
             "by_budget": [{"budget_musd": 100, "routes": 0, "links": 0, "spent_musd": 0, "score": 0},
                           {"budget_musd": 200, "routes": 1, "links": 2, "spent_musd": 180.0, "score": 5.0}]} for c in ("low", "high")]
    return build_network_export({"low": ctx, "high": ctx}, runs, centers, stations, {"C1": "East"}, {})


class NetworkExportTests(unittest.TestCase):
    def test_valid_export_passes(self):
        self.assertTrue(validate(tiny()))

    def test_lines_cover_exactly_the_built_links(self):
        s = tiny()["scenarios"][0]
        self.assertEqual(sorted(x for ln in s["lines"] for x in ln["link_ids"]), ["h1", "h2"])

    def test_hub_is_marked_as_existing_station(self):
        flags = {n["id"]: n["existing_station"] for n in tiny()["nodes"]}
        self.assertEqual(flags, {"station:Hub": True, "C1": False, "C2": False})

    def test_short_name_drops_parenthetical(self):
        self.assertEqual(short("Far East (x)"), "Far East")

    def test_catches_link_missing_from_lines(self):
        n = tiny(); n["scenarios"][0]["lines"][0]["link_ids"].pop()
        with self.assertRaises(AssertionError):
            validate(n)

    def test_catches_cost_mismatch(self):
        n = tiny(); n["scenarios"][0]["steps"][0]["cost_musd"] = 999.0
        with self.assertRaises(AssertionError):
            validate(n)

    def test_catches_link_built_twice(self):
        n = tiny(); n["scenarios"][0]["steps"].append(copy.deepcopy(n["scenarios"][0]["steps"][0]))
        with self.assertRaises(AssertionError):
            validate(n)


if __name__ == "__main__":
    unittest.main()
