# SOL/R

Seminole · Orange/Osceola · Lake · Rail

## Goals and course requirements
SOL/R is a UCF COP4283 university final project, due December 2026. Explore how Greater Orlando could prioritize future rail investment under budget constraints. Meaningful, explainable geographic analysis must accompany the visualization. Linear regression is prohibited.

## Stack and architecture
- Frontend: React, TypeScript, Vite, MapLibre GL JS, and deck.gl.
- `src/components`: interface; `src/map`: map lifecycle and deck.gl integration; `src/data`: layer metadata and later validated data adapters.
- `analysis/`: future Python, Pandas, and GeoPandas pipelines, separate from rendering.
- `data/`: future documented geographic data contracts; interchange format GeoJSON.
- Add Flask only if a dynamic backend is demonstrably needed.

## Visual direction
Inspired by Common Ground (https://devpost.com/software/common-ground-a6rfoc): dark, minimal, research-oriented geography, restrained typography, subtle cyan accents, and a compact collapsible sidebar. Future validated layers may use glowing points, density extrusions, and animated connections. Avoid generic dashboard cards and invented analytical metrics. Keep controls accessible, responsive, and usable with reduced motion.

## Development constraints
Build incremental working milestones. Use the existing isolated checkout; do not create worktrees unless requested. Work on development branches and prepare pull requests; do not push directly to main. Preserve modular boundaries and clean up map resources on unmount.
Never invent demographic data, ridership, infrastructure costs, or analytical findings. Any mock data must be visibly labeled and documented. Document optimization data requirements and assumptions before implementing a model. Rail optimization and Gaussian splatting are outside the first milestone.
Attribute map and data sources. Handle unavailable network resources visibly. Never commit credentials or generated dependency/build directories. Never write API keys or secrets into code, prompts, logs, or commits; read them from environment variables only.

## Validation
Use Node 22.12+ (Node 24 supported), `npm ci`, `npm run check`, and `npm run build`. Start with `npm run dev -- --host 0.0.0.0`. Validate map interactions, sidebar collapse, keyboard controls, mobile layout, and map failure messaging in a browser. Keep README usage and limitations accurate.

## Required task delivery workflow
After implementing each task:
1. Run the project's available tests, TypeScript checks, and production build. Currently these are `npm run test:smoke`, `npm run test:population`, `npm run test:transit`, `npm run test:hexagons`, `npm run test:employment`, `npm run test:candidates`, `npm run test:flows`, `npm run test:rail-plan`, and `npm run test:sunshine` (with the dev server running), `/usr/bin/python3 -m unittest discover -s analysis -p 'test_*.py'`, `npm run check`, and `npm run build`. Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` for the smoke test when using this environment's installed Chromium; otherwise install Playwright Chromium. Report actual outcomes and any warnings or limitations; do not claim fixture-based tests validate live basemap availability.
2. Commit and push changes to a feature branch. Never push task changes directly to `main`.
3. Automatically create a pull request targeting `main`, or update the existing PR for that feature branch. Include a concrete summary of changes and test results. No additional confirmation is needed to commit, push, or create the PR.
4. If GitHub returns HTTP 403, identify the exact failing operation (including endpoint when available) and report the full error response, including status, response headers, and body. Never expose authorization headers, tokens, or other credentials. Distinguish a successful Git push from a failed GitHub API operation; do not imply a PR exists until creation is confirmed.
5. After opening or updating the PR, enable squash auto-merge so GitHub merges it only after the required `check` job passes and all branch protection requirements are satisfied. Use `gh pr merge --auto --squash` or the GitHub `enablePullRequestAutoMerge` API. Only enable auto-merge; never fall back to an immediate/manual merge, bypass checks, use administrator overrides, weaken branch protection, or push directly to `main`.
6. If enabling auto-merge fails, report the failing operation and full error response (status, response headers, and body when available), with credentials redacted, and leave the PR open. Do not claim auto-merge is enabled until GitHub confirms it.
