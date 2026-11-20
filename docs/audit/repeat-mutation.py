#!/usr/bin/env python3
"""Explicitly run only after approval: python3 docs/audit/repeat-mutation.py.

No work happens on import. Tests use mocked fetch from src/test/setup.ts.
Only the working copy of App.tsx is temporarily changed; the Git index is
read and checksummed, never written or restored by this script.
SIGINT/SIGTERM and command failures trigger finally restoration. SIGKILL,
power loss and filesystem write failures cannot be handled by finally;
the original backup remains available in frontend/.cache/audit/.
"""

from datetime import datetime, timezone
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import signal
import subprocess


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def stop_on_signal(signum, _frame):
    raise KeyboardInterrupt(f"Received signal {signum}")


def run_test(command, cwd, env, log_path):
    """Capture real output; stop our child process group before restoration."""
    with log_path.open("w", encoding="utf-8") as log:
        log.write("cwd: frontend/\n$ " + shlex.join(command) + "\n")
        log.flush()
        process = subprocess.Popen(
            command, cwd=cwd, env=env, stdout=log,
            stderr=subprocess.STDOUT, start_new_session=True,
        )
        try:
            code = process.wait(timeout=90)
        except BaseException:
            # Stop only the process group created immediately above.
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
            raise
        log.write(f"\nExit code: {code}\n")
    output = log_path.read_text(encoding="utf-8")
    plain = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", output)
    return code, plain


def main():
    repo = Path(__file__).resolve().parents[2]
    frontend = repo / "frontend"
    source = frontend / "src/App.tsx"
    env = dict(os.environ, GIT_OPTIONAL_LOCKS="0", NO_COLOR="1", FORCE_COLOR="0")

    def git(*args):
        return subprocess.check_output(["git", *args], cwd=repo, env=env)

    # Inspect before making any change. An already staged file is allowed.
    original = source.read_bytes()
    mode_before = source.stat().st_mode
    index_path = Path(git(
        "rev-parse", "--path-format=absolute", "--git-path", "index"
    ).decode().strip())
    index_original = index_path.read_bytes()
    entry_original = git("ls-files", "--stage", "--", "frontend/src/App.tsx")
    staged_original = git("show", ":frontend/src/App.tsx")
    status_original = git("status", "--short")
    target = '''      setStatus({
        type: "error",
        message: `${errorMessage(error)} Если ответ потерян, проверьте отправки перед повторным сохранением.`,
      });'''.encode("utf-8")
    if original.count(target) != 1:
        raise RuntimeError("Expected exactly one original save-error block; aborting")
    mutated = original.replace(target, b"      setStatus(null);")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    evidence = repo / "docs/audit" / f"mutation-{stamp}"
    backups = frontend / ".cache/audit" / f"mutation-{stamp}"
    evidence.mkdir(parents=True, exist_ok=False)
    backups.mkdir(parents=True, exist_ok=False)
    backup = backups / "App.tsx.original"
    backup.write_bytes(original)
    (backups / "git-index.original").write_bytes(index_original)
    if backup.read_bytes() != original:
        raise RuntimeError("Backup verification failed; source has not been changed")
    (evidence / "git-before.txt").write_bytes(status_original + b"\n" + entry_original)
    (evidence / "mutation.diff").write_text("".join(difflib.unified_diff(
        original.decode().splitlines(True), mutated.decode().splitlines(True),
        fromfile="App.tsx.original", tofile="App.tsx.temporary-mutation",
    )), encoding="utf-8")
    manifest = {
        "utc": stamp,
        "source_sha256_before": sha256(original),
        "backup_path": str(backup.relative_to(repo)),
        "backup_sha256": sha256(backup.read_bytes()),
        "index_sha256_before": sha256(index_original),
        "index_entry_before": entry_original.decode().strip(),
        "staged_App_sha256_before": sha256(staged_original),
        "mutation": "Only save catch setStatus(error) becomes setStatus(null)",
        "runs": [],
    }
    manifest_path = evidence / "manifest.json"

    def save_manifest():
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    def check_index():
        if index_path.read_bytes() != index_original:
            raise RuntimeError("Git index bytes changed; do not overwrite the index")
        if git("ls-files", "--stage", "--", "frontend/src/App.tsx") != entry_original:
            raise RuntimeError("Prepared App.tsx index entry changed")
        if git("show", ":frontend/src/App.tsx") != staged_original:
            raise RuntimeError("Prepared App.tsx content changed")

    command = ["corepack", "pnpm", "exec", "vitest", "run", "src/App.test.tsx",
               "-t", "retains input after"]

    def phase(label, expected_exit, expected_summary):
        log_path = evidence / f"{label}.txt"
        code, output = run_test(command, frontend, env, log_path)
        manifest["runs"].append({"phase": label, "command": command,
                                 "exit": code, "output": log_path.name})
        save_manifest()
        if code != expected_exit or expected_summary not in output:
            raise RuntimeError(f"Unexpected {label} outcome; inspect {log_path}")
        print(f"{label}: exit {code}; {expected_summary}", flush=True)
        return output

    old_handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
    for sig in old_handlers:
        signal.signal(sig, stop_on_signal)
    mutation_started = False
    try:
        save_manifest()
        phase("01-before-pass", 0, "4 passed")
        check_index()
        if source.read_bytes() != original:
            raise RuntimeError("App.tsx changed during baseline; abort before mutation")
        # Set this flag before writing so even a partial write is restored.
        mutation_started = True
        source.write_bytes(mutated)
        manifest["mutated_sha256"] = sha256(source.read_bytes())
        output = phase("02-broken-fail", 1, "4 failed")
        if 'role="alert"' not in output:
            raise RuntimeError("FAIL must concern the missing visible error alert")
    finally:
        # Restoration is the first action, before logging or index verification.
        try:
            if mutation_started:
                source.write_bytes(original)
        finally:
            try:
                manifest["source_sha256_after_restore"] = sha256(source.read_bytes())
                manifest["source_restored_exactly"] = source.read_bytes() == original
                manifest["source_mode_unchanged"] = source.stat().st_mode == mode_before
                manifest["index_sha256_after_restore"] = sha256(index_path.read_bytes())
                manifest["staged_App_sha256_after_restore"] = sha256(
                    git("show", ":frontend/src/App.tsx")
                )
                save_manifest()
            finally:
                for sig, handler in old_handlers.items():
                    signal.signal(sig, handler)
        if source.read_bytes() != original:
            raise RuntimeError(f"RESTORATION FAILED; original backup: {backup}")
        if sha256(backup.read_bytes()) != manifest["source_sha256_before"]:
            raise RuntimeError("Original backup checksum changed")
        check_index()

    # Only reached after exact restoration and successful expected FAIL checks.
    phase("03-restored-pass", 0, "4 passed")
    check_index()
    if source.read_bytes() != original:
        raise RuntimeError("App.tsx differs after restored PASS")
    manifest["source_sha256_final"] = sha256(source.read_bytes())
    manifest["index_sha256_final"] = sha256(index_path.read_bytes())
    manifest["staged_App_sha256_final"] = sha256(git("show", ":frontend/src/App.tsx"))
    manifest["result"] = "PASS -> FAIL -> PASS; source and prepared index unchanged"
    save_manifest()
    print(manifest["result"], flush=True)
    print(f"Evidence: {evidence.relative_to(repo)}", flush=True)


if __name__ == "__main__":
    main()
