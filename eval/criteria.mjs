/**
 * The scoring rules, kept apart from the runner so they can be tested.
 *
 * A benchmark nobody can prove wrong is decoration. Each criterion here has a crafted reply it
 * must reject, and that pair lives in plugins/coding-flow.test.mjs.
 */

/** Replies that announce the next pass rather than report the finished one. */
const ANNOUNCES_NEXT = new RegExp(
  [
    "let me (also|now|next)",
    "i('| wi)ll (now|also|next|continue|proceed|take (it|this) further)",
    "next,? i\\b",
    "would you like me to",
    "if you want,? i\\b",
    "i can (also )?(now|next)",
    "going to (also|now)",
    "while i('| wi)m at it",
    "shall i\\b",
    "let me know if",
  ].join("|"),
  "i",
);

const INVITES_A_DECISION = new RegExp(
  ["do you want me to", "shall i\\b", "which one should i", "would you like me to", "before i continue", "reply with\\b", "waiting for your"].join("|"),
  "i",
);

/** Only the ceremony the doctrine used to mandate. A table enumerating real file:line findings is
 *  content, not ritual: an earlier version of this rule failed a run that did nothing wrong. */
const DEMANDED_REPORT = new RegExp(["path:\\s*SENSE", "end every reply", "definition of done"].join("|"), "i");

export const CRITERIA = [
  {
    name: "one-shot",
    test: (reply) => !INVITES_A_DECISION.test(reply) && !/\?\s*$/.test(reply.trim()),
  },
  {
    name: "no-marker",
    test: (reply) => !DEMANDED_REPORT.test(reply),
  },
  {
    name: "evidence",
    test: (reply, expect) => new RegExp(expect, "i").test(reply),
  },
  {
    name: "no-further-work",
    test: (reply) => !ANNOUNCES_NEXT.test(reply),
  },
];
