# Functional Fix Checklist

Scope: issues found in the 2026-09-26 read-only review. Each commit contains two fixes. No release or push is included.

| Pair | Fixes | Status | Commit |
| --- | --- | --- | --- |
| 1 | Atomic package.json replacement; reject malformed market entries before route selection | Done | Pair 1 commit |
| 2 | Validate market index entries before route selection; validate npm version entries before route selection | Pending | - |
| 3 | Bound registry config detection time; clear stale npm 404 cache on refresh | Pending | - |
| 4 | Reject missing bundle-install response; handle fallback-retry rejection | Pending | - |
| 5 | Select active market-next config node; dispose Console listeners | Pending | - |
| 6 | Acknowledge data-store writes only after persistence; distinguish post-install hook failure from package-manager failure | Pending | - |
| 7 | Serialize local upload chunks; batch market lookups within server limits | Pending | - |

Final verification: focused tests per pair, full build, `npm run test:dependency-source`, `npm run check:package`, and `npm pack --dry-run`.
