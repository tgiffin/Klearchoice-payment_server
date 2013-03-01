/**
 * config.js
 *
 * general environment configuration options for the payment server
 */

module.exports = {
  environment: "development",
  db_host: "192.168.1.100",
  db_user: "klearchoice",
  db_password: "KC02242012",
  create_batch_frequency: 10000, /* frequency to poll db in ms */
  process_jobs_frequency: 10000, /* frequency to check the job path for new job files */
  payment_api_url: "https://www.dwolla.com/oauth/rest/transactions/guestsend",
  incoming_account_path: "/home/payment/incoming",
  account_path: "/home/payment/accounts",
  error_path: "/home/payment/errors",
  processing_path: "/home/payment/processing",
  job_path: "/home/payment/jobs",
  processed_path: "/home/payment/processed",
  public_key_path: "/home/payment/keys/payment_server.pub",
  private_key_path: "/home/payment/keys/payment_server.pem",
  batch_control_file: "/home/payment/batch_control.json"
}
