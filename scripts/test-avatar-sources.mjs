import assert from "node:assert/strict";
import { codeforcesAvatarSources } from "../src/lib/avatar.js";

assert.deepEqual(
  codeforcesAvatarSources({
    handle: "sikai",
    avatar: "https://userpic.codeforces.org/1505917/avatar/e782f612b7e640e1.jpg",
  }),
  [
    "https://codeforces.com/userphoto/avatar/sikai/photo.jpg",
    "https://userpic.codeforces.org/1505917/avatar/e782f612b7e640e1.jpg",
  ],
);

assert.deepEqual(
  codeforcesAvatarSources({
    handle: "tourist",
    avatar: "http://userpic.codeforces.org/no-avatar.jpg",
  }),
  [
    "https://codeforces.com/userphoto/avatar/tourist/photo.jpg",
    "https://userpic.codeforces.org/no-avatar.jpg",
  ],
);

assert.deepEqual(
  codeforcesAvatarSources({ handle: "x", avatar: "file:///private/avatar.jpg" }),
  [],
);

console.log("avatar source tests passed");
