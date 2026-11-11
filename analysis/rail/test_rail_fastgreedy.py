"""The fast greedy must match the slow, hand-checked one exactly."""

import random
import unittest

from .fastgreedy import greedy_fast
from .greedy import greedy
from .score import Link, Pair, Params, newly_connected, time_saved
from . import toy


def slow(links, budget, pairs, params, measure):
    fn = time_saved if measure == "time_saved" else newly_connected
    return greedy(links, budget, lambda built: fn(built, pairs, params))


def same(a, b):
    return [(s.link_id, round(s.gain, 6), round(s.total_cost, 6)) for s in a] == \
           [(s.link_id, round(s.gain, 6), round(s.total_cost, 6)) for s in b]


class MatchesSlowEngine(unittest.TestCase):
    def test_toy_both_measures_all_budgets(self):
        for measure in ("time_saved", "newly_connected"):
            for budget in (0, 100, 300, 500, 700, 10_000):
                self.assertTrue(same(
                    greedy_fast(toy.LINKS, budget, toy.PAIRS, toy.PARAMS, measure),
                    slow(toy.LINKS, budget, toy.PAIRS, toy.PARAMS, measure)),
                    (measure, budget))

    def test_random_networks(self):
        rng = random.Random(7)
        for trial in range(25):
            nodes = [f"n{i}" for i in range(7)]
            links = []
            for k in range(9):
                a, b = rng.sample(nodes, 2)
                links.append(Link(f"L{k}", a, b, minutes=rng.randint(2, 15), cost=rng.randint(50, 400)))
            pairs = []
            for _ in range(30):
                h, w = rng.sample(nodes, 2)
                car = rng.randint(5, 30)
                tr = rng.choice([None, None, rng.randint(20, 90)])
                pairs.append(Pair(h, w, rng.randint(1, 100), tr, car))
            params = Params(overhead_min=rng.choice([5, 10, 20]), ratio=rng.choice([1.5, 2.0, 3.0]))
            budget = rng.choice([300, 800, 5000])
            for measure in ("time_saved", "newly_connected"):
                self.assertTrue(same(greedy_fast(links, budget, pairs, params, measure),
                                     slow(links, budget, pairs, params, measure)), (trial, measure))

    def test_rejects_non_positive_cost(self):
        with self.assertRaises(ValueError):
            greedy_fast([Link("x", "A", "B", 5, 0)], 100, [], toy.PARAMS, "time_saved")


if __name__ == "__main__":
    unittest.main()
