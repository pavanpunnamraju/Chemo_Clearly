"""Pure normalization regression tests; no packages, network, model or API needed."""
import runpy
import unittest
from pathlib import Path

helpers = runpy.run_path(str(Path(__file__).with_name("forced-align.py")))
spoken_form = helpers["spoken_form"]


class SpokenForms(unittest.TestCase):
    def test_clinical_numbers_are_not_dropped(self):
        self.assertEqual(spoken_form("100.4°F"), "ONE HUNDRED POINT FOUR DEGREES FAHRENHEIT")
        self.assertEqual(spoken_form("38.0°C"), "THIRTY EIGHT POINT ZERO DEGREES CELSIUS")
        self.assertEqual(spoken_form("7–10"), "SEVEN TO TEN")
        self.assertEqual(spoken_form("911"), "NINE ONE ONE")
        self.assertEqual(spoken_form("21-day"), "TWENTY ONE DAY")
        self.assertEqual(spoken_form("50%"), "FIFTY PERCENT")
        self.assertEqual(spoken_form("<100"), "LESS THAN ONE HUNDRED")
        self.assertEqual(spoken_form("-5"), "MINUS FIVE")

    def test_medications_and_negations_are_not_fuzzy_replaced(self):
        self.assertEqual(spoken_form("Prednisone"), "PREDNISONE")
        self.assertNotEqual(spoken_form("Prednisone"), spoken_form("Prednisolone"))
        self.assertEqual(spoken_form("don't"), "DON'T")
        self.assertEqual(spoken_form("R-CHOP"), "R CHOP")
        self.assertEqual(spoken_form("AC-T"), "A C T")

    def test_punctuation_and_large_numbers_are_explicit(self):
        self.assertEqual(spoken_form("—"), "")
        with self.assertRaises(ValueError):
            spoken_form("1000000")


if __name__ == "__main__":
    unittest.main()
