import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-werewolf-roles",
  description:
    "Secret role assignment for Werewolf/Mafia — sealed in QR, revealed only on your phone",
  accentHex: "#7c3aed",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
