# Live setup (NEAR testnet)

Commands are for Windows Command Prompt (`cmd`). They also work in macOS and Linux
shells if you swap the double quotes inside JSON for single quotes around it.

Accounts used (rename freely, then match them in `agent/.env`):

| Role | Account | Does what |
| --- | --- | --- |
| Owner | `tollkeeper.testnet` | You. Approves payments and sets the rules. |
| Contract | `tollkeeper-policy.testnet` | The policy contract. Also holds the treasury. |
| Agent | `tollkeeper-agent.testnet` | What the agent acts as. Its key is restricted. |
| Vendors | `tollkeeper-data.testnet`, `tollkeeper-writer.testnet`, `tollkeeper-premium.testnet` | Who the agent is allowed to pay in the demo. |

## 1. Create the vendor accounts

```
near account create-account sponsor-by-faucet-service tollkeeper-data.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
near account create-account sponsor-by-faucet-service tollkeeper-writer.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
near account create-account sponsor-by-faucet-service tollkeeper-premium.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
```

## 2. Make sure the contract has funds to spend

```
near tokens tollkeeper-policy.testnet view-near-balance network-config testnet now
```

The demo needs about 9 NEAR in the contract (0.5 NEAR is always kept back). If it has less,
send some from the owner account. `near` with no arguments opens an interactive menu
that walks through sending tokens if you prefer.

## 3. Create the agent's restricted key

From the project folder:

```
npm install
npm run make-agent-key
```

This saves the private key to `agent/.env` (never commit that file) and prints the public key.

## 4. Restrict the key on the chain

```
near account add-key tollkeeper-agent.testnet
```

Answer the prompts: grant-function-call-access, receiver `tollkeeper-policy.testnet`, method
`request_payment`, allowance `1 NEAR`, the public key from step 3, sign as
`tollkeeper-agent.testnet` with your keychain.

From now on the agent's key can do exactly one thing: call `request_payment` on the contract.
It cannot approve anything, change a rule, or move funds any other way.

## 5. Run the agent

```
npm run demo:live
```

If any vendor is not on the allowlist yet, the run stops and prints the exact command to add
it as the owner. Run those, then run it again.

Expected result: the data API and writer payments go through, the 40 NEAR payment from the
poisoned page is stopped, and the 6 NEAR premium payment waits for you.

## 6. Approve or decline the waiting payment

Payment ids start at 0 and count every attempt, including stopped ones.

```
near contract call-function as-transaction tollkeeper-policy.testnet approve json-args "{\"id\":3}" prepaid-gas "50.0 Tgas" attached-deposit "0 NEAR" sign-as tollkeeper.testnet network-config testnet sign-with-keychain send
```

Use `reject` instead of `approve` to decline. To list what is waiting:

```
near contract call-function as-read-only tollkeeper-policy.testnet get_pending json-args "{}" network-config testnet now
```

The daily limit applies to every run, so after three runs in one UTC day the cap is reached
and further payments are stopped. That is the policy working, not a bug.

## 7. Watch and approve from the dashboard

The dashboard reads the contract every few seconds, so payments appear as the agent makes them.

```
cd web
copy .env.example .env.local
npm run dev
```

(On macOS or Linux use `cp` instead of `copy`.) Open http://localhost:3000. The page says
"Live on NEAR testnet" when it is reading your contract. Without `.env.local` it runs as the
self-contained demo instead.

Anyone can watch. To approve or decline payments, or change the rules, press **Connect
wallet** and connect as the owner (`tollkeeper.testnet`). The owner account was created with
the command line, so its key is in your computer's keychain, not in a browser wallet. To use it
in a wallet you need to import that account into the wallet first. `near account export-account
tollkeeper.testnet` shows the options. This is a testnet account with no real value, but still
keep its seed phrase out of chats and screenshots.

If the wallet will not connect, step 6 does the same approvals from the command line.

## 8. Optional: let a real model decide

Add a model key to `agent/.env` (never commit it):

```
ANTHROPIC_API_KEY=your-key
```

Then use `npm run demo:llm` (offline, no chain needed) or `npm run demo:live:llm` (against your
contract). The model reads the pages and chooses each payment itself. Whatever it chooses, it
can only spend what the policy allows. Each step is one short model call, so a run costs very little.
A capable model may notice the poisoned page and ignore it. For a guaranteed attack in a demo
video, use the scripted agent (`npm run demo:live`).
