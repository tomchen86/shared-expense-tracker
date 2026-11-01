#!/usr/bin/env python3
"""Requirement trace check: specs versus tests that ran and passed.

Requirement IDs come from docs/specs/**/*.md (README.md files are skipped).
Test results come from JUnit XML in reports/junit/, which almost every test
runner can write, so the check works for any language. Reading results instead
of test source means skipped, failing, and commented-out tests never count.

  spec:  ### Requirement: LEDGER-2.1 Title
         ### Requirement: LEDGER-5.1 (manual) Title
         ### Requirement: SHELL-26.1 (e2e) Title
  test:  a passing test whose reported name contains LEDGER-2.1,
         or LEDGER_2_1 where test names must be identifiers

(e2e) requirements are checked only by the E2E flows, which PRs do not run
(ADR-0008): without --e2e they are listed like (manual) ones; with --e2e,
given the flows' reports, each of them needs a passing flow and nothing else does.

Exits 1 on any of:
  untested          a requirement no passing test cites
  unknown or stale  a passing test cites an ID no spec declares (a typo, or a
                    requirement whose version was bumped)
  duplicate         a requirement number declared more than once
  malformed         a heading that looks like a requirement (any level, any case,
                    singular or plural) but is not exactly "### Requirement: <ID>"
"""
import argparse
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

HEADING = re.compile(r"^ {0,3}#+\s*requirements?\b", re.IGNORECASE)  # anything that looks like one
SECTION = re.compile(r"^##\s+Requirements\s*$")  # the section heading in the spec format
REQUIREMENT = re.compile(r"^###\s+Requirement:\s+([A-Z][A-Z0-9]*-\d+\.\d+)(?:\s+\((manual|e2e)\))?(?:\s|$)")
CITATION = re.compile(r"(?<![A-Za-z0-9])([A-Z][A-Z0-9]*)[-_](\d+)[._](\d+)(?![0-9])")
NOT_PASSED = {"skipped", "failure", "error"}


def read_specs(root):
    declared, malformed, numbers = set(), [], {}
    marked = {"manual": set(), "e2e": set()}
    for path in sorted(root.rglob("*.md")):
        if path.name == "README.md":
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not HEADING.match(line) or SECTION.match(line):
                continue
            match = REQUIREMENT.match(line)
            if not match:
                malformed.append(f"{path}:{lineno}: {line.strip()}")
                continue
            rid = match.group(1)
            declared.add(rid)
            numbers.setdefault(rid.rsplit(".", 1)[0], []).append(rid)
            if match.group(2):
                marked[match.group(2)].add(rid)
    duplicates = [f"{n}: {', '.join(ids)}" for n, ids in sorted(numbers.items()) if len(ids) > 1]
    return declared, marked["manual"], marked["e2e"], duplicates, malformed


def read_passing_citations(root):
    cited = set()
    for path in sorted(root.rglob("*.xml")):
        try:
            cases = list(ET.parse(path).getroot().iter("testcase"))
        except ET.ParseError as err:
            sys.exit(f"trace-check: cannot read {path}: {err}")
        for case in cases:
            if case.get("status") == "notrun" or case.get("result") == "suppressed":
                continue
            if any(child.tag in NOT_PASSED for child in case):
                continue
            name = f"{case.get('classname', '')} {case.get('name', '')}"
            cited.update(f"{d}-{n}.{v}" for d, n, v in CITATION.findall(name))
    return cited


def main():
    parser = argparse.ArgumentParser(description="Requirement trace check: specs versus passing tests.")
    parser.add_argument("--specs", type=Path, default=Path("docs/specs"))
    parser.add_argument("--reports", type=Path, default=Path("reports/junit"))
    parser.add_argument("--e2e", action="store_true", help="the reports are the E2E flows': check the (e2e) requirements")
    args = parser.parse_args()

    declared, manual, e2e, duplicates, malformed = read_specs(args.specs)
    cited = read_passing_citations(args.reports)
    problems = {
        "untested": sorted(e2e - cited if args.e2e else declared - manual - e2e - cited),
        "unknown or stale": sorted(cited - declared),
        "duplicate": duplicates,
        "malformed": malformed,
    }
    if manual and not args.e2e:
        print("manual (verify by hand before release):", *sorted(manual), sep="\n  ")
    if e2e and not args.e2e:
        print("e2e (checked when the E2E flows run):", *sorted(e2e), sep="\n  ")
    for label, items in problems.items():
        if items:
            print(f"{label}:", *items, sep="\n  ")
    return 1 if any(problems.values()) else 0


if __name__ == "__main__":
    sys.exit(main())
