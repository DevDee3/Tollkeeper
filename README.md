# Tollkeeper

Give an AI agent real money without giving it unlimited power.

Tollkeeper is a spending-policy contract on NEAR. The agent holds a restricted
key that can only ask the contract to pay. The contract decides, every time:

| Rule | What happens |
| --- | --- |
| Recipient not on your allowlist | Blocked, and the attempt is logged |
| Would go over the daily cap | Blocked, and the attempt is logged |
| Above what the agent can pay on its own | Waits for your approval |
| Within all limits | Paid immediately |

A blocked request is recorded, not rejected with an error, so the dashboard
can always show what the agent tried and why it was stopped.

## Layout

```
contracts/policy   Rust contract (near-sdk). The source of truth for the rules.
shared/            TypeScript types for the contract + an in-memory mock of it.
chain/             Talks to the deployed contract: views, and the agent's restricted client.
agent/             The agent loop, a demo scenario, and the planner interface.
docs/              live-setup.md (setup on NEAR testnet) and submission.md (video script, post, checklist).
web/               Dashboard (Next.js). Demo mode by default, live mode with a wallet.
```

`shared` is what keeps the pieces in step: the contract's JSON shapes live in
`shared/src/types.ts`, and `shared/src/mock.ts` repeats the contract's rules so
the demo and dashboard run before anything is deployed. The mock's tests mirror
the contract's tests by name; change a rule in one place and change it in both.

## Contract (`contracts/policy`)

- Agent calls: `request_payment(recipient, amount, memo)`
- Owner calls: `approve(id)`, `reject(id)`, `add_recipient`, `remove_recipient`,
  `set_limits`, `set_agent`
- Views: `get_config`, `get_allowlist`, `is_allowed`, `get_log`, `get_pending`

Amounts are in yoctoNEAR. The contract always keeps 0.5 NEAR in reserve for
storage. The daily cap resets on UTC day boundaries.

## Try it

```
npm install
npm run demo        # the agent gets tricked by a poisoned page; the policy holds
npm run dev         # dashboard at http://localhost:3000 (demo mode, nothing is real)
npm run demo:live   # the same story against the real contract (see docs/live-setup.md)
npm run demo:llm    # same, with a real model deciding each step (needs ANTHROPIC_API_KEY)
npm test
npm run typecheck
```

Contract checks (need Rust, or use the GitHub Actions workflow instead):

```
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo audit
```

The `contract` workflow runs all of these and builds the deployable wasm.

### Keeping Tollkeeper inside another repo

Everything lives in this one folder, so it can sit in a subfolder of an existing
repo. GitHub only runs workflows from the repo root, so copy
`.github/workflows/contract.yml` to the root repo's `.github/workflows/` and set
`PROJECT_DIR` at the top of the file to this folder's name (for example
`tollkeeper`).

## Known limits

- Wallet connection is built on NEAR Connect and has only been tested against a mocked
  network. If a wallet will not connect, approve from the command line (docs/live-setup.md).
- Native NEAR only for now. Token (NEP-141) and cross-chain payments are
  planned through NEAR Intents.
- A transfer to an account that does not exist is refunded by the protocol
  but still counts toward the day's total.
- The default planner is scripted so the demo plays out the same way every time. `--llm`
  swaps in a real model through the same interface. Its prompt has no defence against hidden
  instructions on purpose, since the point is that the payment policy holds when a model slips.
  A strong model may ignore the poisoned page, in which case you see an uneventful run, not an attack.
- `RUSTSEC-2026-0387` (crypto-bigint) is accepted in `.cargo/audit.toml`: it
  arrives through NEAR's native test tooling, not the wasm contract.
