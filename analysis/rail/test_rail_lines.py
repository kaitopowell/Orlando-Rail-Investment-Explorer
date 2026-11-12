"""Line grouping: straight-through lines, short stubs fold in as branches."""

import unittest

from .lines import group_lines

# a straight east-west line A-B-C-D-E with a one-segment stub B-F going north and a lone piece X-Y far away
POS = {"A": (0, 0), "B": (0.03, 0), "C": (0.06, 0), "D": (0.09, 0), "E": (0.12, 0),
       "F": (0.03, 0.03), "X": (0.5, 0.5), "Y": (0.53, 0.5)}


def edges(*pairs, w=1):
    return {frozenset(p): w for p in pairs}


class LineTests(unittest.TestCase):
    def test_straight_line_stays_one_line_and_stub_becomes_branch(self):
        e = edges(("A", "B"), ("B", "C"), ("C", "D"), ("D", "E"), ("B", "F"))
        lines = group_lines(e, POS)
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["main"], ["A", "B", "C", "D", "E"])
        self.assertEqual(lines[0]["branches"], [["B", "F"]])

    def test_far_apart_piece_is_its_own_line(self):
        e = edges(("A", "B"), ("B", "C"), ("C", "D"), ("X", "Y"))
        lines = group_lines(e, POS)
        self.assertEqual(len(lines), 2)

    def test_sharp_turn_does_not_continue_the_line(self):
        pos = {"A": (0, 0), "B": (0.03, 0), "C": (0.0, 0.001)}      # B-C doubles back on itself
        lines = group_lines(edges(("A", "B"), ("B", "C")), pos, min_trunk=1)
        self.assertEqual(len(lines), 2)


if __name__ == "__main__":
    unittest.main()
