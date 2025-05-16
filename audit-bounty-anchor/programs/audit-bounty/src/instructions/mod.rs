pub mod create_bounty;
pub mod submit_report;
pub mod release_funds;
pub mod reject_report;
pub mod close_bounty;
pub mod auto_release;

// Re-export structs for cleaner imports
pub use create_bounty::CreateBounty;
pub use submit_report::SubmitReport;
pub use release_funds::ApproveAndRelease;
pub use reject_report::RejectReport;
pub use close_bounty::CancelBounty;
pub use auto_release::AutoRelease; 