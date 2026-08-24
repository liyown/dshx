import { Entry } from "@napi-rs/keyring";

if (typeof Entry !== "function") {
  throw new Error("The native system keyring module did not expose Entry.");
}
