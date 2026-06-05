Objective: Redesign the mini-app UI to closely match the provided GoalPredict mobile reference while replacing the GoalPredict brand text with "Nhà Tiên Tri".

Key requirements:
- Use the brand name "Nhà Tiên Tri" in the top header.
- Add a football-themed header, hero promotion card, quick action tabs, ranking teaser, and reward banner similar to the reference.
- Keep the fixed bottom navigation behavior, styled closer to the reference.
- Preserve existing app logic and screens rather than replacing data flows.
- Verify with build and visual screenshot.

Implementation parallelism: Sequential
Reason: This is a cohesive UI redesign touching shared JSX structure and CSS tokens for one app screen.

Parallelization Strategy:
- Can parallelize: no
- Implementation lanes: App.jsx shell/content additions, App.css visual redesign, build/browser verification.
- Sequential dependencies: JSX class names must exist before CSS verification.
- Verification: npm build plus Playwright/browser screenshot on mobile.
- Recommended Phase 3 Agent Split Gate input: Local only.
