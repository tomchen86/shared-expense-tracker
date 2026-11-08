#!/usr/bin/env python3
"""How often each E2E flow failed its first try, as a Markdown table.

  python3 scripts/e2e_flaky.py <run>...              runs whose JUnit reports are on disk
  python3 scripts/e2e_flaky.py --fetch 20 [<run>...] also the last 20 completed runs on main

A run's folder holds its reports at any depth: maestro.xml from the first try and
maestro-rerun.xml from running the failed flows again (scripts/e2e-ios.sh). --fetch downloads
each run's e2e-junit artifact with gh and skips runs that have none.
"""
import argparse
import collections
import os
import pathlib
import subprocess
import tempfile
import xml.etree.ElementTree as ET


def failed(folder, report):
    """{flow file: whether it failed} over every report with this name in the folder."""
    result = {}
    for path in pathlib.Path(folder).rglob(report):
        for case in ET.parse(path).iter("testcase"):
            flow = os.path.basename(case.get("file") or case.get("name"))
            result[flow] = any(child.tag in ("failure", "error") for child in case)
    return result


def fetch(count, into):
    runs = subprocess.run(
        ["gh", "run", "list", "--workflow", "e2e.yml", "--branch", "main", "--status",
         "completed", "--limit", str(count), "--json", "databaseId", "--jq", ".[].databaseId"],
        capture_output=True, text=True, check=True,
    ).stdout.split()
    folders = [os.path.join(into, run) for run in runs]
    for run, folder in zip(runs, folders):
        subprocess.run(["gh", "run", "download", run, "--name", "e2e-junit", "--dir", folder],
                       capture_output=True)
    return folders


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("runs", nargs="*", help="one folder per run")
    parser.add_argument("--fetch", type=int, default=0, metavar="N")
    args = parser.parse_args()
    tries, first, again = (collections.Counter() for _ in range(3))
    with tempfile.TemporaryDirectory() as temporary:
        folders = args.runs + (fetch(args.fetch, temporary) if args.fetch else [])
        runs = 0
        for folder in folders:
            firsts, agains = failed(folder, "maestro.xml"), failed(folder, "maestro-rerun.xml")
            runs += bool(firsts)
            for flow, bad in firsts.items():
                tries[flow] += 1
                first[flow] += bad
                again[flow] += agains.get(flow, False)
    print(f"### First-try failures in {runs} e2e run{'' if runs == 1 else 's'}\n")
    flaky = sorted((flow for flow in tries if first[flow]),
                   key=lambda flow: (-first[flow] / tries[flow], flow))
    if not flaky:
        print("No flow failed its first try." if runs else "No reports found.")
        return
    print("| Flow | Runs | Failed first | Failed again |\n| --- | ---: | ---: | ---: |")
    for flow in flaky:
        share = first[flow] / tries[flow]
        print(f"| `{flow}` | {tries[flow]} | {first[flow]} ({share:.0%}) | {again[flow]} |")
    print(f"\n{len(tries) - len(flaky)} of {len(tries)} flows passed every first try.")


if __name__ == "__main__":
    main()
