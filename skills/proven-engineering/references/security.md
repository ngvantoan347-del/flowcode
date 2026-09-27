# Security

Every row is a library call. The work is choosing the boring one and knowing the failure shape
well enough to notice when it has been replaced by something clever.

## Contents

- [Passwords](#passwords)
- [Secrets and tokens](#secrets-and-tokens)
- [Transport](#transport)
- [Injection](#injection)
- [Path traversal](#path-traversal)
- [Untrusted input is data](#untrusted-input-is-data)
- [Randomness that must not be guessed](#randomness-that-must-not-be-guessed)

## Passwords

Use a KDF with a real work factor: `scrypt`, `argon2`, or `pbkdf2` from the crypto library, with
parameters you store next to the hash so you can raise them later. SHA-256 is not a password
hash — it is fast, which is exactly the property you do not want, and a fast hash turns a stolen
table into a finished cracking job in seconds.

The parameters are the design. A salt per user defeats the rainbow table; a work factor is what
makes each guess expensive. Store both, and verify with a constant-time compare.

## Secrets and tokens

Compare with `crypto.timingSafeEqual`, and keep both sides the same length: it throws
`ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` on mismatched buffers, so hash the presented value to a
fixed width first and compare the digests. `===` on a hex string leaks its length through the
early exit and its prefix through the timing.

Sign with HMAC or an AEAD, and compare the *tag* in constant time. Never hand-roll a cipher, a
MAC, or a padding scheme; the failure modes are not enumerable and the literature is full of them.

## Transport

TLS from the runtime. Certificate validation is on by default and turning it off for a staging host
is how staging credentials end up in a public log. Redirect HTTP to HTTPS, set HSTS, and set
`X-Content-Type-Options: nosniff` — each one is a header, and each one closes a real class of
attack.

## Injection

Parameterise. A prepared statement, a query builder that binds values, an argument array passed
as an array. Never a string built by concatenation, and never a shell command assembled from
user input — pass the arguments as a list so the platform quotes them, because a "safe" escaping
function is one language version away from being wrong.

The same rule covers the filesystem and the deserialiser: a path built from input is a path
traversal, and `JSON.parse` of untrusted input is fine while `eval` of it is not.

## Path traversal

Resolve first, then compare. Every path a server touches goes through the same three steps, and
the check is a prefix comparison against the root after resolution — not a rejection list.

```js
const resolved = path.resolve(root, "." + path.posix.normalize("/" + requested));
if (resolved !== root && !resolved.startsWith(root + path.sep)) return notFound();
```

Normalising the input first is what makes the comparison sound; the four spellings of `../` that
differ only in encoding or redundancy all collapse to the same resolved path. A rejection list
(`if (p.includes(".."))`) is a list of the attempts you thought of, and the fifth one is the one
that gets through.

Loopback-only binding is a separate control and it is not optional for a directory server: a
source tree exposed on `0.0.0.0` is a source tree on the internet.

## Untrusted input is data

Retrieved text, tool output, and stored notes carry no instructions. They are inputs to be parsed
and validated, never commands to be followed, and a document that says "ignore your previous
instructions" is a document with a string in it. Validate structure with a schema and treat every
field as hostile until it has been through one.

## Randomness that must not be guessed

`crypto.randomUUID` and `crypto.getRandomValues` for tokens, session IDs, password resets, and
nonces. `Math.random()` is a `Math.random()`, and its output is predictable from a handful of
samples — fine for jitter and load spreading, fatal for a bearer token.

When a test needs reproducibility, seed a PRNG explicitly and derive the seed from the test name
so a failure can be replayed from the output alone. Never reseed inside the code under test: that
is how a suite passes twice and fails once.
