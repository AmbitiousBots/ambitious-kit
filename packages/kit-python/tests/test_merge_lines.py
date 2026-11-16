import unittest

from ambitious_kit.domain.merge_lines import merge_lines, unknown_base_merge


class MergeLinesTests(unittest.TestCase):
    def test_independent_local_edits_are_kept(self) -> None:
        result = merge_lines("one\ntwo\nthree\n", "ONE\ntwo\nthree\n", "one\ntwo\nTHREE\n")
        self.assertEqual(result.merged, "ONE\ntwo\nTHREE\n")
        self.assertEqual(result.conflicts, ())
        self.assertEqual(result.local_changes_kept[0].before, "one")
        self.assertEqual(result.local_changes_kept[0].after, "ONE")

    def test_conflicts_show_both_versions_and_the_base(self) -> None:
        result = merge_lines("old\n", "local\n", "published\n")
        self.assertEqual(len(result.conflicts), 1)
        self.assertEqual(result.conflicts[0].current, "local")
        self.assertEqual(result.conflicts[0].published, "published")
        self.assertEqual(result.conflicts[0].base, "old")
        self.assertIn("<<<<<<< current\nlocal\n||||||| base\nold\n=======\npublished\n>>>>>>> published", result.merged)
        self.assertEqual(result.local_changes_kept, ())

    def test_unknown_base_keeps_both_complete_texts(self) -> None:
        result = unknown_base_merge("local\n", "published\n")
        self.assertIsNone(result.conflicts[0].base)
        self.assertEqual(result.conflicts[0].current, "local\n")
        self.assertEqual(result.conflicts[0].published, "published\n")

    def test_insertions_deletions_and_adjacent_changes(self) -> None:
        cases = [
            ("a\nb\nc\n", "a\nlocal\nb\nc\n", "a\nb\npublished\nc\n", "a\nlocal\nb\npublished\nc\n"),
            ("a\nb\nc\n", "a\nc\n", "a\nb\nC\n", "a\nC\n"),
            ("a\nb\nc\n", "a\nB\nc\n", "a\nB\nc\n", "a\nB\nc\n"),
            ("a\nb\nc\n", "A\nb\nc\n", "a\nB\nc\n", "A\nB\nc\n"),
        ]
        for base, current, published, expected in cases:
            self.assertEqual(merge_lines(base, current, published).merged, expected)
        self.assertEqual(len(merge_lines("a\nb\n", "a\nlocal\nb\n", "a\npublished\nb\n").conflicts), 1)
        self.assertEqual(len(merge_lines("a\nb\nc\n", "a\n", "a\nb\nC\n").conflicts), 1)

    def test_unchanged_sides_and_identical_changes_preserve_all_lines(self) -> None:
        for size in range(60):
            base = "\n".join(f"line {index % 7}" for index in range(size))
            changed = f"prefix\n{base}\nnew suffix"
            self.assertEqual(merge_lines(base, base, changed).merged, changed)
            self.assertEqual(merge_lines(base, changed, base).merged, changed)
            self.assertEqual(merge_lines(base, changed, changed).merged, changed)
