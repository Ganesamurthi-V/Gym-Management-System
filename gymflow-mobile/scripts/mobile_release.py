#!/usr/bin/env python3
"""Helper for gymflow-mobile/scripts/release.ps1. Run from the repository root with `gh` authenticated.

  mobile_release.py next
      Prints the next build number. Version names are 1.1.<build>; the build number is also the Android
      versionCode, so it must only ever go up. It is the highest number found in any release name or tag
      (v1.1.236, admin-v1.1.237, ...) plus one, and never below FLOOR + 1.

  mobile_release.py notes <version> <build> <apk>
      Prints the release description (Markdown): what changed in gymflow-mobile/ since the previous release,
      how to install, and the build details with the APK's SHA-256.

Kept out of the PowerShell script so it can be run and tested on its own:
  GITHUB_REPOSITORY=owner/repo python gymflow-mobile/scripts/mobile_release.py next
"""
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone

MOBILE_DIR = "gymflow-mobile"
# The last build published by hand was "v1.1.236". The first automated build is therefore 237.
FLOOR = 236
VERSION_RE = re.compile(r"v1\.1\.(\d+)")

# Conventional-commit types, in the order they appear in the notes. Anything else lands under "Other changes".
SECTIONS = [("feat", "What's new"), ("fix", "Fixes"), ("perf", "Performance")]
SKIPPED_TYPES = {"ci", "docs", "test", "style", "build"}
SKIPPED_SUBJECTS = ("bump admin app version",)

ANDROID_NAMES = {21: "5.0", 23: "6.0", 24: "7.0", 26: "8.0", 28: "9", 29: "10", 30: "11", 31: "12", 33: "13", 34: "14", 35: "15"}


def run(*cmd: str) -> str:
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout.strip()


def previous_release() -> tuple[int, str | None]:
    """Highest published build number and the tag it lives on (None when only FLOOR is known)."""
    out = run("gh", "release", "list", "--limit", "100", "--json", "name,tagName")
    best: tuple[int, str | None] = (FLOOR, None)
    for rel in json.loads(out):
        match = VERSION_RE.search(f"{rel['name']} {rel['tagName']}")
        if match and int(match.group(1)) >= best[0]:
            best = (int(match.group(1)), rel["tagName"])
    return best


def changes_since(tag: str | None) -> list[tuple[str, str, str, str]]:
    """(sha, type, scope, subject) for each commit that touched the mobile app since `tag`."""
    rng = []
    if tag:
        try:
            rng = [f"{run('git', 'rev-list', '-n', '1', tag)}..HEAD"]
        except subprocess.CalledProcessError:
            rng = []
    if not rng:
        rng = ["-n", "15"]
    log = run("git", "log", "--no-merges", "--pretty=%h%x09%s", *rng, "--", MOBILE_DIR)
    commits = []
    for line in log.splitlines():
        sha, _, subject = line.partition("\t")
        if any(s in subject.lower() for s in SKIPPED_SUBJECTS):
            continue
        m = re.match(r"^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$", subject)
        ctype, scope, text = (m.group(1).lower(), m.group(2) or "", m.group(3)) if m else ("other", "", subject)
        if ctype in SKIPPED_TYPES:
            continue
        commits.append((sha, ctype, scope, text))
    return commits


def min_android() -> str:
    gradle = open(os.path.join(MOBILE_DIR, "android", "build.gradle"), encoding="utf-8").read()
    m = re.search(r"minSdkVersion\s*=\s*(\d+)", gradle)
    if not m:
        return "a recent version of Android"
    api = int(m.group(1))
    name = ANDROID_NAMES.get(api)
    return f"Android {name} (API {api}) or newer" if name else f"Android API {api} or newer"


def notes(version: str, build: str, apk: str) -> str:
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    sha_full = os.environ.get("GITHUB_SHA") or run("git", "rev-parse", "HEAD")
    sha = sha_full[:7]
    _, prev_tag = previous_release()
    commits = changes_since(prev_tag)

    def line(c: tuple[str, str, str, str]) -> str:
        sha_c, _, scope, text = c
        label = f"**{scope}:** " if scope else ""
        link = f"[`{sha_c}`](https://github.com/{repo}/commit/{sha_c})" if repo else f"`{sha_c}`"
        return f"- {label}{text} ({link})"

    out = [f"## Admin v{version}", "", f"Android build {build} of the GymFlow Admin app, built from commit `{sha}`.", ""]
    used = set()
    for ctype, title in SECTIONS:
        group = [c for c in commits if c[1] == ctype]
        if group:
            out += [f"### {title}", *[line(c) for c in group], ""]
            used.add(ctype)
    other = [c for c in commits if c[1] not in used]
    if other:
        out += ["### Other changes", *[line(c) for c in other], ""]
    if not commits:
        out += ["No app code changed since the previous release; this is a rebuild.", ""]

    extra = os.environ.get("EXTRA_NOTES", "").strip()
    if extra:
        out += [extra, ""]

    digest = hashlib.sha256(open(apk, "rb").read()).hexdigest()
    built = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=5, minutes=30)))
    out += [
        "### Install",
        f"1. Download `{os.path.basename(apk)}` below and open it on the phone.",
        "2. If Android asks, allow installs from your browser or file manager.",
        "3. Installing over the existing app keeps your sign-in, because every release is signed with the same key.",
        "",
        "| | |",
        "|---|---|",
        f"| Version | {version} (build {build}) |",
        f"| Requires | {min_android()} |",
        f"| Commit | `{sha}` |",
        f"| Built | {built:%Y-%m-%d %H:%M} IST |",
        f"| SHA-256 | `{digest}` |",
        "",
    ]
    return "\n".join(out)


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[1] == "next":
        print(previous_release()[0] + 1)
        return 0
    if len(argv) == 5 and argv[1] == "notes":
        print(notes(argv[2], argv[3], argv[4]))
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
