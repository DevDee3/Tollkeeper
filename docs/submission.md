# NEAR Hackathon submission kit

## Tracks to enter

One project can enter several tracks. Best fits:

- AI Security & Defense: a payment policy that holds when the agent is tricked.
- Agent Economy: an agent that pays other agents and services.
- Autonomous Business: an agent that buys what it needs to do its job.

## Checklist

- [ ] Repo is public and the README opens with what it does
- [ ] `contract` GitHub Action is green
- [ ] Contract deployed to testnet (`tollkeeper-policy.testnet`) and explorer link added to the README
- [ ] Demo video recorded (60 to 90 seconds)
- [ ] Post published on X with the video and a repo link, tagging @NEARProtocol and including #NEARHackathon
- [ ] Submission form filled in with the repo link, post link and a NEAR wallet address for the prize
- [ ] Submitted before Nov 14, 23:59 UTC (00:59 on Nov 15 in Lagos). Aim for Nov 13.

## Demo video script (about 75 seconds)

Record the dashboard in one window and the terminal in another. Use the scripted agent so the
attack happens every time. Run `npm run demo:live` as the agent.

1. **The problem (0:00 to 0:10).** Say it plainly: "AI agents can now spend money. If one reads a
   poisoned web page, it can be told to send your funds anywhere." Show the dashboard: 0 NEAR spent,
   a 10 NEAR daily limit.
2. **The setup (0:10 to 0:20).** Show the Rules section: 10 NEAR a day, 2 NEAR on its own, three
   allowed recipients. "The agent's key can only ask the contract to pay. It can't approve or change rules."
3. **The agent works (0:20 to 0:35).** Start the agent in the terminal. Two payments appear on the
   dashboard and the lane fills: data API, then writer.
4. **The attack (0:35 to 0:50).** The agent reads the news page with the hidden instruction and tries
   to send 40 NEAR. The gate flashes red and the toast says it was stopped because the recipient is not
   on the allowlist. Zoom on the Activity row. "The agent was fooled. The money never moved."
5. **The human decides (0:50 to 1:05).** The 6 NEAR premium payment is waiting. Press Approve. It turns
   to Paid. "Anything above the agent's own limit needs a person."
6. **Close (1:05 to 1:15).** "Tollkeeper: spending rules enforced on-chain, so an agent can't be talked
   out of them." Show the repo and the contract address.

## X post draft

I let an AI agent spend real money, then I poisoned a web page to make it send 40 NEAR to a scammer. The
agent fell for it. The money didn't move. Tollkeeper puts the spending rules on-chain: a daily limit, an
allowlist of who it can pay, and a human approval step for big payments, and the agent's key can't change any
of them. Built for the #NEARHackathon on @NEARProtocol with a restricted function-call key and a policy
contract in Rust. Video above, code here: <repo link>

(The hackathon asks for the hashtag, so it sits in the middle of the post and the end is left for words.)
