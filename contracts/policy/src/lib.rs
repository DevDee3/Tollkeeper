//! Tollkeeper policy contract.
//!
//! An AI agent holds a function-call key that can only call `request_payment`
//! on this contract. Every payment the agent wants to make passes through the
//! rules below before any funds move:
//!
//! * the recipient must be on the owner's allowlist
//! * the day's total must stay under the daily cap
//! * amounts above the auto-approve limit wait for the owner's approval
//!
//! Requests that break a rule are recorded as `Blocked` rather than rejected
//! with an error, because a failed NEAR call rolls back its state changes and
//! the dashboard needs the record of what was stopped.

use near_sdk::json_types::U128;
use near_sdk::store::{IterableSet, Vector};
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

const NS_PER_DAY: u64 = 86_400_000_000_000;
const MAX_MEMO_BYTES: usize = 200;
const MAX_PAGE: u32 = 100;
/// Always keep this much in the contract so it can pay for its own storage.
const RESERVE_YOCTO: u128 = 500_000_000_000_000_000_000_000; // 0.5 NEAR

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Status {
    /// Sent to the recipient.
    Paid,
    /// Waiting for the owner to approve or reject.
    Pending,
    /// Stopped by the policy. No funds moved.
    Blocked,
    /// Declined by the owner.
    Rejected,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct PaymentRecord {
    pub id: u32,
    pub recipient: AccountId,
    pub amount: U128,
    pub memo: String,
    pub status: Status,
    /// Plain-language reason, shown to the user on the dashboard.
    pub reason: String,
    pub timestamp_ms: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Config {
    pub owner: AccountId,
    pub agent: AccountId,
    pub daily_cap: U128,
    pub auto_limit: U128,
    pub spent_today: U128,
    pub remaining_today: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Policy {
    owner: AccountId,
    agent: AccountId,
    daily_cap: u128,
    auto_limit: u128,
    allowlist: IterableSet<AccountId>,
    day: u64,
    spent_today: u128,
    log: Vector<PaymentRecord>,
}

#[near]
impl Policy {
    #[init]
    pub fn new(owner: AccountId, agent: AccountId, daily_cap: U128, auto_limit: U128) -> Self {
        require!(
            auto_limit.0 <= daily_cap.0,
            "Auto-approve limit cannot exceed the daily cap"
        );
        Self {
            owner,
            agent,
            daily_cap: daily_cap.0,
            auto_limit: auto_limit.0,
            allowlist: IterableSet::new(b"a"),
            day: today(),
            spent_today: 0,
            log: Vector::new(b"l"),
        }
    }

    // ---------------------------------------------------------------- agent

    /// Called by the agent. Never panics on a rule violation: the outcome is
    /// recorded and returned so the agent (and dashboard) can see why.
    pub fn request_payment(
        &mut self,
        recipient: AccountId,
        amount: U128,
        memo: String,
    ) -> PaymentRecord {
        require!(
            env::predecessor_account_id() == self.agent,
            "Only the agent can request payments"
        );
        require!(amount.0 > 0, "Amount must be greater than zero");
        require!(memo.len() <= MAX_MEMO_BYTES, "Memo is too long");

        self.roll_day();
        let amt = amount.0;

        let (status, reason) = if !self.allowlist.contains(&recipient) {
            (Status::Blocked, "Recipient is not on the allowlist")
        } else if self.spent_today.saturating_add(amt) > self.daily_cap {
            (Status::Blocked, "Would exceed the daily spending cap")
        } else if !self.has_funds(amt) {
            (Status::Blocked, "Not enough funds in the treasury")
        } else if amt > self.auto_limit {
            (
                Status::Pending,
                "Above what the agent can pay on its own. Waiting for your approval",
            )
        } else {
            (Status::Paid, "Within all limits")
        };

        let record = self.push_record(recipient.clone(), amt, memo, status.clone(), reason);
        if status == Status::Paid {
            self.spent_today += amt;
            let _ = Promise::new(recipient).transfer(NearToken::from_yoctonear(amt));
        }
        record
    }

    // ---------------------------------------------------------------- owner

    pub fn approve(&mut self, id: u32) -> PaymentRecord {
        self.assert_owner();
        self.roll_day();
        let rec = self.get_record(id);
        require!(
            rec.status == Status::Pending,
            "Payment is not waiting for approval"
        );
        require!(
            self.allowlist.contains(&rec.recipient),
            "Recipient is no longer on the allowlist"
        );
        let amt = rec.amount.0;
        require!(
            self.spent_today.saturating_add(amt) <= self.daily_cap,
            "Approving this would exceed the daily cap"
        );
        require!(self.has_funds(amt), "Not enough funds in the treasury");

        self.spent_today += amt;
        let updated = self.set_outcome(id, Status::Paid, "Approved by you");
        let _ = Promise::new(rec.recipient).transfer(NearToken::from_yoctonear(amt));
        updated
    }

    pub fn reject(&mut self, id: u32) -> PaymentRecord {
        self.assert_owner();
        let rec = self.get_record(id);
        require!(
            rec.status == Status::Pending,
            "Payment is not waiting for approval"
        );
        self.set_outcome(id, Status::Rejected, "Declined by you")
    }

    pub fn add_recipient(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.allowlist.insert(account_id);
    }

    pub fn remove_recipient(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.allowlist.remove(&account_id);
    }

    pub fn set_limits(&mut self, daily_cap: U128, auto_limit: U128) {
        self.assert_owner();
        require!(
            auto_limit.0 <= daily_cap.0,
            "Auto-approve limit cannot exceed the daily cap"
        );
        self.daily_cap = daily_cap.0;
        self.auto_limit = auto_limit.0;
    }

    /// Swap in a new agent account, for example after a key leak.
    pub fn set_agent(&mut self, agent: AccountId) {
        self.assert_owner();
        self.agent = agent;
    }

    // ---------------------------------------------------------------- views

    pub fn get_config(&self) -> Config {
        let spent = self.current_spent();
        Config {
            owner: self.owner.clone(),
            agent: self.agent.clone(),
            daily_cap: U128(self.daily_cap),
            auto_limit: U128(self.auto_limit),
            spent_today: U128(spent),
            remaining_today: U128(self.daily_cap.saturating_sub(spent)),
        }
    }

    pub fn get_allowlist(&self) -> Vec<AccountId> {
        self.allowlist.iter().cloned().collect()
    }

    pub fn is_allowed(&self, account_id: AccountId) -> bool {
        self.allowlist.contains(&account_id)
    }

    /// Newest first, so the dashboard feed can render it directly.
    pub fn get_log(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<PaymentRecord> {
        let total = self.log.len();
        let limit = limit.unwrap_or(20).min(MAX_PAGE);
        let skip = from_index.unwrap_or(0);
        (0..total)
            .rev()
            .skip(skip as usize)
            .take(limit as usize)
            .filter_map(|i| self.log.get(i).cloned())
            .collect()
    }

    pub fn get_pending(&self) -> Vec<PaymentRecord> {
        self.log
            .iter()
            .filter(|r| r.status == Status::Pending)
            .cloned()
            .collect()
    }
}

// Internal helpers, not exposed as contract methods.
impl Policy {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only the owner can do this"
        );
    }

    fn roll_day(&mut self) {
        let now = today();
        if now != self.day {
            self.day = now;
            self.spent_today = 0;
        }
    }

    fn current_spent(&self) -> u128 {
        if self.day == today() {
            self.spent_today
        } else {
            0
        }
    }

    fn has_funds(&self, amount: u128) -> bool {
        env::account_balance()
            .as_yoctonear()
            .saturating_sub(RESERVE_YOCTO)
            >= amount
    }

    fn get_record(&self, id: u32) -> PaymentRecord {
        self.log
            .get(id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Unknown payment id"))
    }

    fn push_record(
        &mut self,
        recipient: AccountId,
        amount: u128,
        memo: String,
        status: Status,
        reason: &str,
    ) -> PaymentRecord {
        let record = PaymentRecord {
            id: self.log.len(),
            recipient,
            amount: U128(amount),
            memo,
            status,
            reason: reason.to_string(),
            timestamp_ms: env::block_timestamp_ms(),
        };
        self.log.push(record.clone());
        record
    }

    fn set_outcome(&mut self, id: u32, status: Status, reason: &str) -> PaymentRecord {
        let rec = self
            .log
            .get_mut(id)
            .unwrap_or_else(|| env::panic_str("Unknown payment id"));
        rec.status = status;
        rec.reason = reason.to_string();
        rec.clone()
    }
}

fn today() -> u64 {
    env::block_timestamp() / NS_PER_DAY
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

    fn owner() -> AccountId {
        accounts(0)
    }
    fn agent() -> AccountId {
        accounts(1)
    }
    fn vendor() -> AccountId {
        accounts(2)
    }
    fn stranger() -> AccountId {
        accounts(3)
    }

    fn set_ctx(predecessor: AccountId, timestamp_ns: u64) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(accounts(5))
            .predecessor_account_id(predecessor)
            .account_balance(NearToken::from_near(100))
            .block_timestamp(timestamp_ns);
        testing_env!(b.build());
    }

    /// Cap 10 NEAR a day, auto-approve up to 2 NEAR, vendor allowlisted.
    fn setup() -> Policy {
        set_ctx(owner(), 0);
        let mut c = Policy::new(owner(), agent(), U128(10 * NEAR), U128(2 * NEAR));
        c.add_recipient(vendor());
        c
    }

    fn pay(c: &mut Policy, to: AccountId, near: u128, ts: u64) -> PaymentRecord {
        set_ctx(agent(), ts);
        c.request_payment(to, U128(near * NEAR), "test".to_string())
    }

    #[test]
    fn pays_within_limits() {
        let mut c = setup();
        let r = pay(&mut c, vendor(), 1, 0);
        assert_eq!(r.status, Status::Paid);
        assert_eq!(c.get_config().spent_today.0, NEAR);
    }

    #[test]
    fn blocks_unknown_recipient_and_keeps_the_record() {
        let mut c = setup();
        let r = pay(&mut c, stranger(), 1, 0);
        assert_eq!(r.status, Status::Blocked);
        assert_eq!(r.reason, "Recipient is not on the allowlist");
        assert_eq!(c.get_config().spent_today.0, 0);
        // The blocked attempt is still in the log for the dashboard.
        assert_eq!(c.get_log(None, None).len(), 1);
    }

    #[test]
    fn blocks_when_daily_cap_would_be_exceeded() {
        let mut c = setup();
        for _ in 0..5 {
            assert_eq!(pay(&mut c, vendor(), 2, 0).status, Status::Paid);
        }
        let r = pay(&mut c, vendor(), 1, 0);
        assert_eq!(r.status, Status::Blocked);
        assert_eq!(r.reason, "Would exceed the daily spending cap");
    }

    #[test]
    fn daily_cap_resets_the_next_day() {
        let mut c = setup();
        for _ in 0..5 {
            pay(&mut c, vendor(), 2, 0);
        }
        assert_eq!(pay(&mut c, vendor(), 1, 0).status, Status::Blocked);
        assert_eq!(pay(&mut c, vendor(), 1, NS_PER_DAY).status, Status::Paid);
        assert_eq!(c.get_config().spent_today.0, NEAR);
    }

    #[test]
    fn large_payment_waits_then_owner_approves() {
        let mut c = setup();
        let r = pay(&mut c, vendor(), 5, 0);
        assert_eq!(r.status, Status::Pending);
        assert_eq!(
            r.reason,
            "Above what the agent can pay on its own. Waiting for your approval"
        );
        assert_eq!(c.get_config().spent_today.0, 0);
        assert_eq!(c.get_pending().len(), 1);

        set_ctx(owner(), 0);
        let approved = c.approve(r.id);
        assert_eq!(approved.status, Status::Paid);
        assert_eq!(c.get_config().spent_today.0, 5 * NEAR);
        assert!(c.get_pending().is_empty());
    }

    #[test]
    fn owner_can_reject_a_pending_payment() {
        let mut c = setup();
        let r = pay(&mut c, vendor(), 5, 0);
        set_ctx(owner(), 0);
        let rejected = c.reject(r.id);
        assert_eq!(rejected.status, Status::Rejected);
        assert_eq!(c.get_config().spent_today.0, 0);
    }

    #[test]
    #[should_panic(expected = "Recipient is no longer on the allowlist")]
    fn approval_rechecks_the_allowlist() {
        let mut c = setup();
        let r = pay(&mut c, vendor(), 5, 0);
        set_ctx(owner(), 0);
        c.remove_recipient(vendor());
        c.approve(r.id);
    }

    #[test]
    #[should_panic(expected = "Approving this would exceed the daily cap")]
    fn approval_rechecks_the_daily_cap() {
        let mut c = setup();
        let r = pay(&mut c, vendor(), 5, 0);
        for _ in 0..3 {
            pay(&mut c, vendor(), 2, 0);
        }
        set_ctx(owner(), 0);
        c.approve(r.id); // 6 already spent + 5 > 10
    }

    #[test]
    fn blocks_when_treasury_is_too_low() {
        let mut c = setup();
        let mut b = VMContextBuilder::new();
        b.current_account_id(accounts(5))
            .predecessor_account_id(agent())
            .account_balance(NearToken::from_millinear(1_200))
            .block_timestamp(0);
        testing_env!(b.build());
        let r = c.request_payment(vendor(), U128(NEAR), "x".to_string());
        assert_eq!(r.status, Status::Blocked);
        assert_eq!(r.reason, "Not enough funds in the treasury");
    }

    #[test]
    #[should_panic(expected = "Only the agent can request payments")]
    fn only_the_agent_can_request() {
        let mut c = setup();
        set_ctx(stranger(), 0);
        c.request_payment(vendor(), U128(NEAR), "x".to_string());
    }

    #[test]
    #[should_panic(expected = "Only the owner can do this")]
    fn agent_cannot_change_the_rules() {
        let mut c = setup();
        set_ctx(agent(), 0);
        c.add_recipient(stranger());
    }

    #[test]
    #[should_panic(expected = "Only the owner can do this")]
    fn agent_cannot_approve_its_own_payment() {
        let mut c = setup();
        let r = pay(&mut c, vendor(), 5, 0);
        set_ctx(agent(), 0);
        c.approve(r.id);
    }

    #[test]
    #[should_panic(expected = "Amount must be greater than zero")]
    fn rejects_zero_amount() {
        let mut c = setup();
        set_ctx(agent(), 0);
        c.request_payment(vendor(), U128(0), "x".to_string());
    }

    #[test]
    #[should_panic(expected = "Auto-approve limit cannot exceed the daily cap")]
    fn limits_must_be_consistent() {
        let mut c = setup();
        set_ctx(owner(), 0);
        c.set_limits(U128(NEAR), U128(2 * NEAR));
    }

    #[test]
    fn log_is_newest_first_and_paged() {
        let mut c = setup();
        for _ in 0..3 {
            pay(&mut c, vendor(), 1, 0);
        }
        let page = c.get_log(None, Some(2));
        assert_eq!(page.len(), 2);
        assert_eq!(page[0].id, 2);
        assert_eq!(page[1].id, 1);
        assert_eq!(c.get_log(Some(2), Some(2))[0].id, 0);
    }

    #[test]
    fn owner_can_change_limits() {
        let mut c = setup();
        set_ctx(owner(), 0);
        c.set_limits(U128(20 * NEAR), U128(5 * NEAR));
        let cfg = c.get_config();
        assert_eq!(cfg.daily_cap.0, 20 * NEAR);
        assert_eq!(cfg.auto_limit.0, 5 * NEAR);
        // 5 NEAR used to wait for approval; now it is paid straight away.
        assert_eq!(pay(&mut c, vendor(), 5, 0).status, Status::Paid);
    }

    #[test]
    fn allowlist_views_follow_the_owner_s_changes() {
        let mut c = setup();
        assert!(c.is_allowed(vendor()));
        assert!(!c.is_allowed(stranger()));
        assert_eq!(c.get_allowlist(), vec![vendor()]);

        set_ctx(owner(), 0);
        c.remove_recipient(vendor());
        assert!(c.get_allowlist().is_empty());
        assert_eq!(pay(&mut c, vendor(), 1, 0).status, Status::Blocked);
    }

    #[test]
    fn config_shows_zero_spent_once_a_new_day_starts() {
        let mut c = setup();
        pay(&mut c, vendor(), 2, 0);
        assert_eq!(c.get_config().spent_today.0, 2 * NEAR);

        // A day later, with no new payment yet, the view must already reset.
        set_ctx(owner(), NS_PER_DAY);
        let cfg = c.get_config();
        assert_eq!(cfg.spent_today.0, 0);
        assert_eq!(cfg.remaining_today.0, 10 * NEAR);
    }

    #[test]
    fn swapping_the_agent_locks_out_the_old_one() {
        let mut c = setup();
        set_ctx(owner(), 0);
        c.set_agent(accounts(4));
        set_ctx(accounts(4), 0);
        let r = c.request_payment(vendor(), U128(NEAR), "x".to_string());
        assert_eq!(r.status, Status::Paid);
    }
}
