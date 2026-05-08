export interface PreviewGenerator {
  /** Source extensions this generator handles (lowercase, no leading dot). */
  readonly exts: readonly string[];
  /** Output file extension for the generated preview (no leading dot). Unused for self-reference generators. */
  readonly outputExt: string;
  /**
   * When true, the source attachment itself is used as the preview — no separate
   * file is generated and `attachment-prev` points directly at the source. Used
   * for image types where the source is already a viewable image.
   */
  readonly selfReference?: boolean;
  /** Produce preview bytes from the source attachment bytes. Required unless `selfReference` is true. */
  generate?(input: ArrayBuffer, sourcePath: string): Promise<ArrayBuffer>;
}
