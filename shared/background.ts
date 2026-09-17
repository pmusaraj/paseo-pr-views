import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const ViewCheckSchema = z.object({
  query: z.string(),
  revision: z.string(),
  unread: z.boolean(),
  checkedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export const BackgroundStatusSchema = z.record(z.string(), ViewCheckSchema);
export type BackgroundStatus = z.output<typeof BackgroundStatusSchema>;

export const backgroundStatus = defineRpc({
  name: "views.background-status",
  input: z.object({}),
  output: BackgroundStatusSchema,
});

export const acknowledgeView = defineRpc({
  name: "views.acknowledge",
  input: z.object({ id: z.string(), query: z.string(), revision: z.string() }),
  output: BackgroundStatusSchema,
});
