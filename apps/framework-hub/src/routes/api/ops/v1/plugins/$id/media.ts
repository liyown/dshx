import { createFileRoute } from "@tanstack/react-router";
import { operationMediaMetadataSchema } from "@becomeopc/dshx-hub-contracts";

import { tokenRoute, withMeta } from "@/lib/api/route";
import { uploadOperationMedia } from "@/lib/catalog/operations-v1.media.server";
import {
  OperationHttpError,
  operationRequestId,
  parseOperationInput,
} from "@/lib/catalog/operations-v1.http";
import { requireBindings } from "@/lib/db/context";

export const Route = createFileRoute("/api/ops/v1/plugins/$id/media")({
  server: {
    handlers: {
      POST: tokenRoute(
        { envelope: "operation" },
        async ({ request, context, db, params, token }) => {
          const { file, metadata } = await readMediaForm(request);
          const data = await uploadOperationMedia(
            db,
            requireBindings(context).PLUGIN_MEDIA,
            token.id,
            operationRequestId(request),
            params.id,
            file,
            metadata,
          );
          return withMeta(data, { status: data.status === "created" ? 201 : 200 });
        },
      ),
    },
  },
});

/** The one multipart endpoint: the media file and its JSON metadata arrive as form fields. */
async function readMediaForm(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new OperationHttpError(
      422,
      "invalid_media_metadata",
      "Request must be valid multipart form data",
      false,
      {
        path: "body",
        repairHint: "Send multipart fields named file and metadata.",
      },
    );
  }
  const file = form.get("file");
  const rawMetadata = form.get("metadata");
  if (!(file instanceof File))
    throw new OperationHttpError(422, "invalid_media", "Multipart file is required", false, {
      path: "file",
    });
  if (typeof rawMetadata !== "string")
    throw new OperationHttpError(
      422,
      "invalid_media_metadata",
      "Multipart metadata JSON is required",
      false,
      { path: "metadata" },
    );
  let metadataJson: unknown;
  try {
    metadataJson = JSON.parse(rawMetadata);
  } catch {
    throw new OperationHttpError(
      422,
      "invalid_media_metadata",
      "Multipart metadata must be valid JSON",
      false,
      { path: "metadata" },
    );
  }
  return { file, metadata: parseOperationInput(operationMediaMetadataSchema, metadataJson) };
}
