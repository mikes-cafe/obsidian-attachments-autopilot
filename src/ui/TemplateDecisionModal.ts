import { Modal } from "obsidian";
import type { App } from "obsidian";
import { t } from "../i18n";

export type TemplateDecision = "apply" | "skip";

export class TemplateDecisionModal extends Modal {
  private count: number;
  private resolve!: (decision: TemplateDecision) => void;
  readonly result: Promise<TemplateDecision>;

  constructor(app: App, count: number) {
    super(app);
    this.count = count;
    this.result = new Promise((res) => { this.resolve = res; });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: t("modal.templateDecision.title") });
    contentEl.createEl("p", {
      text: t("modal.templateDecision.body", { count: this.count }),
    });

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });

    btnRow.createEl("button", { text: t("modal.templateDecision.apply"), cls: "mod-cta" })
      .addEventListener("click", () => { this.close(); this.resolve("apply"); });

    btnRow.createEl("button", { text: t("modal.templateDecision.skip") })
      .addEventListener("click", () => { this.close(); this.resolve("skip"); });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
