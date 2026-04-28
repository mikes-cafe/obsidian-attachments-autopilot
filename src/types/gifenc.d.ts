declare module "gifenc" {
  export interface GIFEncoderOptions {
    auto?: boolean;
    initialCapacity?: number;
  }

  export interface FrameOptions {
    palette?: number[][];
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array | Uint8ClampedArray | number[],
      width: number,
      height: number,
      options?: FrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: GIFEncoderOptions): GIFEncoderInstance;

  export type QuantizeFormat = "rgb565" | "rgb444" | "rgba4444";

  export interface QuantizeOptions {
    format?: QuantizeFormat;
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    oneBitAlpha?: boolean | number;
  }

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): number[][];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: QuantizeFormat,
  ): Uint8Array;
}
