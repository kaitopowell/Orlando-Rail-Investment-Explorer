# ORBIT — Orlando Rail Investment Explorer

## Goals and course requirements
ORBIT is a UCF COP4283 university final project, due December 2026. Explore how Greater Orlando could prioritize future rail investment under budget constraints. Meaningful, explainable geographic analysis must accompany the visualization. Linear regression is prohibited.

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
Attribute map and data sources. Handle unavailable network resources visibly. Never commit credentials or generated dependency/build directories.

## Validation
Use Node 22.12+ (Node 24 supported), `npm ci`, `npm run check`, and `npm run build`. Start with `npm run dev -- --host 0.0.0.0`. Validate map interactions, sidebar collapse, keyboard controls, mobile layout, and map failure messaging in a browser. Keep README usage and limitations accurate.
