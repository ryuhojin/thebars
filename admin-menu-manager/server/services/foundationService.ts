import {
  d00FoundationManifest,
  foundationManifestSchema,
  type FoundationManifest
} from "../../contracts/foundation";
import {
  createFakeCloudflareDeploymentAdapter,
  createFakeGitHubPublicationAdapter
} from "../integrations/publicationAdapters";
import { FoundationRepository, type D1LikeDatabase } from "../repositories/foundationRepository";

export type FoundationSummary = FoundationManifest & {
  d1: "available" | "missing-binding";
};

export async function readFoundationSummary(db?: D1LikeDatabase): Promise<FoundationSummary> {
  const repository = new FoundationRepository(db);
  const github = createFakeGitHubPublicationAdapter();
  const cloudflare = createFakeCloudflareDeploymentAdapter();
  const manifest = foundationManifestSchema.parse(d00FoundationManifest);

  await github.writePublicMenu({
    encodedSlug: "foundation-smoke",
    canonicalJson: "{}",
    canonicalHash: "d00-foundation"
  });
  await cloudflare.observeCommit({
    encodedSlug: "foundation-smoke",
    commitSha: "d00-foundation-commit",
    publicationId: "d00-foundation-publication"
  });
  await cloudflare.listRecentDeployments();

  return {
    ...manifest,
    d1: await repository.runSmokeQuery()
  };
}
