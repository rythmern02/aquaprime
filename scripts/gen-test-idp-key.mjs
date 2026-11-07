// Prints a private RS256 JWK for TEST_IDP_PRIVATE_JWK (hosted test IdP). Paste it into the host's env, never into git.
import { exportJWK, generateKeyPair } from "../frontend/node_modules/jose/dist/node/esm/index.js";
const { privateKey } = await generateKeyPair("RS256", { extractable: true });
console.log(JSON.stringify({ ...(await exportJWK(privateKey)), kid: `test-idp-${Date.now().toString(36)}`, alg: "RS256" }));
