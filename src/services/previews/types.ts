export interface PreviewGenerator {
  /** Source extensions this generator handles (lowercase, no leading dot). */
  readonly exts: readonly string[];
  /** Output file extension for the generated preview (no leading dot). */
  readonly outputExt: string;
  /** Produce preview bytes from the source attachment bytes. */
  generate(input: ArrayBuffer, sourcePath: string): Promise<ArrayBuffer>;
}
