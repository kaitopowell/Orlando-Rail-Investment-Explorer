import { ColumnLayer } from "@deck.gl/layers";
export class DemandNeedles<T> extends ColumnLayer<T> {
  static layerName = "DemandNeedles";
  getShaders() {
    const shaders = super.getShaders();
    return {...shaders, inject: {
      ...shaders.inject,
      "vs:#decl": "out float needleFraction;",
      "vs:#main-start": "needleFraction = (positions.z + 1.0) * 0.5;",
      "vs:DECKGL_FILTER_SIZE": "size.xy *= mix(1.0, 0.12, needleFraction);",
      "fs:#decl": "in float needleFraction;",
      "fs:DECKGL_FILTER_COLOR": "if (!bool(picking.isActive)) { color.a *= pow(1.0 - clamp(needleFraction, 0.0, 1.0), 1.4); }",
    }};
  }
}
