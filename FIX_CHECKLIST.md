# Functional Fix Checklist

Scope: issues found in the 2026-09-26 read-only review. Each commit contains two fixes. No release or push is included.

| Pair | Fixes | Status | Commit |
| --- | --- | --- | --- |
| 1 | Atomic package.json replacement; reject malformed market entries before route selection | Done | Pair 1 commit |
| 2 | Bound package-manager registry detection; reject missing plugin-bundle install responses | Done | Pair 2 commit |
| 3 | Handle fallback-retry rejection; clear stale npm 404 cache on refresh | Done | Pair 3 commit |
| 4 | Validate npm metadata entries; serialize local upload chunks | Done | Pair 4 commit |
| 5 | Select active market-next config node; dispose Console listeners | Done | Pair 5 commit |
| 6 | Acknowledge data-store writes only after persistence; distinguish post-install hook failure from package-manager failure | Pending | - |
| 7 | Batch market lookups within server limits; additional confirmed functional fix | Pending | - |

Final verification: focused tests per pair, full build, `npm run test:dependency-source`, `npm run check:package`, and `npm pack --dry-run`.
