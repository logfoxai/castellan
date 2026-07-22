#!/usr/bin/env bash
# One-time (or idempotent) GitHub repo settings for castellan.
# Requires: gh auth as an org/repo admin (logfox-agent cannot run this).
set -euo pipefail

REPO="${1:-logfoxai/castellan}"

echo "Configuring ${REPO}..."

gh api -X PATCH "repos/${REPO}" -f delete_branch_on_merge=true

# Require the CI check on the default branch; org admins and repo admins may bypass.
gh api "repos/${REPO}/rulesets" -X POST \
  --input - <<'EOF'
{
  "name": "ci-required",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": true,
        "required_status_checks": [
          {"context": "ci"}
        ]
      }
    }
  ],
  "bypass_actors": [
    {
      "actor_id": 5,
      "actor_type": "RepositoryRole",
      "bypass_mode": "always"
    },
    {
      "actor_id": 1,
      "actor_type": "OrganizationAdmin",
      "bypass_mode": "always"
    }
  ]
}
EOF

echo "Done. ${REPO}: delete_branch_on_merge=true, ci-required ruleset applied."
