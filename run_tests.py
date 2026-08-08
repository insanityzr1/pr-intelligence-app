#!/usr/bin/env python3
"""
Unified Test Runner for PR Intelligence App
Runs Python Backend tests (pytest) and React Frontend tests (Vitest).
"""

import os
import sys
import subprocess

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def run_command(cmd, cwd=None):
    print(f"\n==================================================")
    print(f"Running: {' '.join(cmd)}")
    print(f"==================================================\n")
    res = subprocess.run(cmd, cwd=cwd)
    return res.returncode

def main():
    root_dir = os.path.abspath(os.path.dirname(__file__))

    print("\nPR Intelligence Application Test Suite Runner\n")

    # 1. Run Backend Pytest Suite
    backend_cmd = [sys.executable, "-m", "pytest", "backend/tests", "-v"]
    backend_rc = run_command(backend_cmd, cwd=root_dir)

    # 2. Run Frontend Vitest Suite
    npm_bin = "npm.cmd" if sys.platform == "win32" else "npm"
    frontend_cmd = [npm_bin, "--prefix", "frontend", "test"]
    frontend_rc = run_command(frontend_cmd, cwd=root_dir)

    print("\n==================================================")
    print("UNIFIED TEST SUITE SUMMARY REPORT")
    print("==================================================")
    print(f" Backend Pytest Suite:   {'[PASSED]' if backend_rc == 0 else '[FAILED]'}")
    print(f" Frontend Vitest Suite:  {'[PASSED]' if frontend_rc == 0 else '[FAILED]'}")
    print("==================================================\n")

    if backend_rc != 0 or frontend_rc != 0:
        sys.exit(1)
    else:
        print("ALL TEST SUITES PASSED CLEANLY!\n")
        sys.exit(0)

if __name__ == "__main__":
    main()
