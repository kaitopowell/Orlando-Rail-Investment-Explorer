"""
Greedy build order: repeatedly add the link with the best gain per unit cost.

The objective is any function that takes a list of built links and returns a number
(for example, time_saved or newly_connected from score.py). Run it once per objective
and compare the build orders.

Rules (from docs/rail-model-assumptions.md):
  - ties go to the smaller link id, so the same inputs always give the same order
  - stop when no remaining link adds anything
  - stop at the first best link that would exceed the budget (no skipping), so the
    result is always a true prefix of one ordered plan

Standard library only.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Step:
    link_id: str
    gain: float          # how much the objective rose when this link was added
    cost: float
    total_cost: float    # spent so far, including this link
    total_score: float   # objective value after this link


def greedy(links, budget, objective):
    for link in links:
        if link.cost <= 0:
            raise ValueError(f"link {link.id} must have a positive cost")

    remaining = sorted(links, key=lambda l: l.id)   # fixed order makes ties deterministic
    built = []
    steps = []
    spent = 0.0
    score = objective(built)

    while remaining:
        best, best_gain, best_ratio = None, 0.0, float("-inf")
        for link in remaining:
            gain = objective(built + [link]) - score
            ratio = gain / link.cost
            # strict ">" means an equal ratio keeps the earlier (smaller id) link
            if ratio > best_ratio + 1e-12:
                best, best_gain, best_ratio = link, gain, ratio

        if best is None or best_gain <= 0:
            break                       # nothing left that helps
        if spent + best.cost > budget:
            break                       # no skipping: stop at the first link that does not fit

        built.append(best)
        remaining.remove(best)
        spent += best.cost
        score += best_gain
        steps.append(Step(best.id, best_gain, best.cost, spent, score))

    return steps
