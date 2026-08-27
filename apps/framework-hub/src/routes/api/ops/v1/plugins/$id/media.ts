import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { operationMediaMetadataSchema } from "@/lib/catalog/operations-v1.contracts";
import {
  OperationHttpError,
  operationFailure,
  operationRequestId,
  operationSuccess,
  parseOperationInput,
} from "@/lib/catalog/operations-v1.http";
import { uploadOperationMedia } from "@/lib/catalog/operations-v1.media.server";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";

export const Route = createFileRoute("/api/ops/v1/plugins/$id/media")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        const requestId = operationRequestId(request);
        try {
          const actor = await requireApiToken(requireDatabase(context), request, "catalog:write");
          let form: FormData;
          try {
            form = await request.formData();
          } catch {
            throw new OperationHttpError(
              422,
              "invalid_media_metadata",
              "Request must be valid multipart form data",
              false,
              { path: "body", repairHint: "Send multipart fields named file and metadata." },
            );
          }
          const file = form.get("file");
          const rawMetadata = form.get("metadata");
          if (!(file instanceof File))
            throw new OperationHttpError(
              422,
              "invalid_media",
              "Multipart file is required",
              false,
              {
                path: "file",
              },
            );
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
          const metadata = parseOperationInput(operationMediaMetadataSchema, metadataJson);
          const data = await uploadOperationMedia(
            requireD1(context),
            requireBindings(context).PLUGIN_MEDIA,
            actor.token.id,
            requestId,
            params.id,
            file,
            metadata,
          );
          return operationSuccess(request, data, {
            status: data.status === "created" ? 201 : 200,
            requestId,
          });
        } catch (error) {
          return operationFailure(request, error, requestId);
        }
      },
    },
  },
});
