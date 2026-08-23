import type { CSSProperties, ReactElement } from "react";

export type PixelBlastProps = {
  variant?: "square" | "circle" | "triangle" | "diamond";
  pixelSize?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  antialias?: boolean;
  patternScale?: number;
  patternDensity?: number;
  liquid?: boolean;
  liquidStrength?: number;
  liquidRadius?: number;
  pixelSizeJitter?: number;
  enableRipples?: boolean;
  rippleIntensityScale?: number;
  rippleThickness?: number;
  rippleSpeed?: number;
  liquidWobbleSpeed?: number;
  autoPauseOffscreen?: boolean;
  maxPixelRatio?: number;
  frameRate?: number;
  speed?: number;
  transparent?: boolean;
  edgeFade?: number;
  noiseAmount?: number;
};

export default function PixelBlast(props: PixelBlastProps): ReactElement;
