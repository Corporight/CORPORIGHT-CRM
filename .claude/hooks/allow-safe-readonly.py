import json
import re
import sys

def allow(reason: str):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "permissionDecisionReason": reason
        }
    }))
    sys.exit(0)

def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    tool_name = payload.get("tool_name")
    if tool_name != "Bash":
        sys.exit(0)

    command = (payload.get("tool_input") or {}).get("command", "").strip()

    safe_patterns = [
        r"^git status$",
        r"^git status --short$",
        r"^git log --oneline( -\d+)?$",
        r"^git branch$",
        r"^git branch --show-current$",
        r"^ls$",
        r"^ls .+$",
    ]

    for pattern in safe_patterns:
        if re.fullmatch(pattern, command):
            allow(f"Allowed safe read-only command: {command}")

    sys.exit(0)

if __name__ == "__main__":
    main()