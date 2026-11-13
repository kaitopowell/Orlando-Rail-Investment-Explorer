import js from "@eslint/js";
import tseslint from "typescript-eslint";
// Add lint coverage for the new feature without rewriting unrelated legacy layers.
export default tseslint.config({
  files: [
    "src/data/railUsefulness*.ts",
    "src/data/railPlan.ts",
    "src/components/RailUsefulness.tsx",
    "src/components/RailPlanControls.tsx",
    "src/components/useRailPlan.ts",
    "src/map/commuteLayers.ts",
    "src/map/railPlanLayers.ts",
  ],
  extends: [js.configs.recommended, ...tseslint.configs.recommended],
});
