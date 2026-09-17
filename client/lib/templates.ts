import type { BoardItem, ColumnId, PromptSettings } from "../../shared/board";

/** Every placeholder a template may use, shown to the user in the settings view. */
export const PLACEHOLDERS = ["{url}", "{title}", "{number}", "{repository}"] as const;

/**
 * A project override wins over the type template, and a blank one does not
 * count — blank means inherit, which is what makes clearing a field the way to
 * drop an override. A card whose repository reaches no project has no override
 * to find, which is fine: it cannot be sent anywhere either.
 */
export function templateFor(
  prompts: PromptSettings,
  type: ColumnId,
  projectId: string | null,
): string {
  const override = projectId === null ? undefined : prompts.byProject[projectId]?.[type];
  return override !== undefined && override.trim() !== "" ? override : prompts.byType[type];
}

/**
 * Substitutes the card's own fields. An unrecognised placeholder is left
 * standing rather than blanked, so a typo shows up in the paste instead of
 * silently swallowing part of the prompt.
 */
export function renderTemplate(template: string, item: BoardItem): string {
  return template.replace(/\{(url|title|number|repository)\}/g, (_match, key: string) => {
    if (key === "url") return item.url;
    if (key === "title") return item.title;
    if (key === "number") return String(item.number);
    return item.repository;
  });
}
