Objective: Fix every actionable issue listed in report.md for the World Cup prediction mini-app.

Requirements:
- Bottom navigation must not cover content or footer on desktop, tablet, or mobile.
- Score stepper plus/minus buttons should meet mobile-friendly touch sizing.
- Long team names in match cards should remain readable without unintended clipping.
- Mobile group filters should clearly communicate horizontal scroll affordance.
- Local mock mode should not emit a Supabase 404 for long_term_bets.
- Verify with build and Playwright audit on desktop, tablet, and mobile.

Implementation parallelism: Sequential
Reason: The issues share the same CSS layout and local mock data path, with small tightly coupled edits.

Parallelization Strategy:
- Can parallelize: no
- Implementation lanes: App.css layout/touch/readability; App.jsx mock data fetch guard
- Sequential dependencies: CSS changes should be verified together in browser screenshots
- Verification: npm build plus Playwright DOM/network checks across three viewport sizes
- Recommended Phase 3 Agent Split Gate input: Local only, because edits are compact and interdependent
