#!/usr/local/bin/node
/**
 * process_payment_jobs.js
 *
 * Watch the jobs folder for new files. When a file appears, process it and move it to the processed folder.
 * Update the status of the transaction in the transactions table to indicate that it was processed.
 *
 * History
 *
 * Author     Date            Comment
 * --------------------------------------------------------
 * clay       2.27.2013       Initial version created
 *
 *
 * Authored by Clayton C Gulick (clay@ratiosoftware.com)
 */
var config = require("./config");
var crypt = require("./crypt");
var mysql = require("mysql");
var console = require("console");
var util = require("util");
var fs = require("fs");
var private_key_string;
var cn; //db connection
var connected=false;
var Q = require("q");

/**
 * Read a job file and process each row. Update the database status of each transaction.
 */
function process_file(file)
{
  if(!cn || !connected)
  {
    cn = mysql.createConnection(
      {
        host: config.db_host,
        user: config.db_user,
        database: "klearchoice",
        password: config.db_password
      });

    //connect to the database
    cn.connect(
      function(err)
      {
        if(err)
        {
          console.error("ERROR: Unable to connect to the database: " + util.inspect(err));
          connected=false;
          return;
        }
        connected=true;
      });

    //handle database errors
    cn.on("error",
      function(err)
      {
        console.error("ERROR: database error: " + util.inspect(err));
        connected=false;
      });
  }

  //the first thing we do is move the file over to the processing folder. This is to ensure
  //that a donor doesn't accidentally get charged twice if a batch fails and the file stays
  //in the jobs path
  var src_path = config.job_path + "/" + file;
  var dest_path = config.processing_path + "/" + file;
  fs.rename(src_path,dest_path);
  

  var file_contents = fs.readFileSync(dest_path,"utf8");
  var parsed_file = JSON.parse(file_contents);
  var promises = [];
  console.log("processing batch_id: " + parsed_file.batch_id + " transactions: " + parsed_file.transactions.length);
  parsed_file.transactions.forEach(
    function(transaction,index,arr)
    {
      promises.push(process_transaction(transaction)); //this is async!!
    });
  Q.all(promises).then(
    function()
    {
      console.log("completed processing batch_id: " + parsed_file.batch_id);
    });
}

/**
 * Process an individual transaction from the batch file
 */
function process_transaction(transaction)
{
  try
  {
    var d = Q.defer();
    //load the donor info
    cn.query("select first_name, last_name from donor where id=?",[transaction.donor_id],
      function(err,rows)
      {
        if(err)
        {
          var message = "database error loading donor id: " + transaction.donor_id + " transaction id: " + transaction.id + " err: " + util.inspect(err);
          console.error(message);
          update_transaction_status(transaction,'error',message);
          return;
        }

        var donor=rows[0];

        //find the correct account file and load it
        var top_dir = donor.last_name.toLowerCase().substr(0,2);
        var bottom_dir = donor.first_name.toLowerCase().substr(0,2);
        var account_file_path = config.account_path + "/" + top_dir + "/" + bottom_dir + "/" + transaction.donor_id + ".json";
        if(!fs.existsSync(account_file_path))
        {
          var message = "Missing account credentials for donor id: " + transaction.donor_id + " transaction id: " + transaction.id;
          console.error(message);
          update_transaction_status(transaction,'error',message);
          return;
        }
        var donor_info = fs.readFileSync(account_file_path,"utf8");
        donor_info = JSON.parse(donor_info);

        //decrypt the bank account and routing info
        var account_info = crypt.decrypt(donor_info.account,private_key_string);
        account_info = JSON.parse(account_info);
        donor_info.account = account_info;

        //send to dwolla for processing
        dwolla_guest_send(donor_info,d);
      });

    return d.promise;

  }
  catch(err)
  {
    console.log("error processing transaction: " + transaction.id + " error: " + util.inspect(err));
    update_transaction_status(transaction,'error',util.inspect(err));
  }

}

/**
 * Update the status of the transaction in the database
 */
function update_transaction_status(transaction,status,message)
{
  message = (new Date()).toString() + message;
  cn.query("update transactions set status=?, message=?, log=concat(coalesce(log,''),?) where id=?", [status,message,message + "\n",transaction.id],
    function(err,rows)
    {
      if(err)
      {
        console.error("error updating transaction status: " + util.inspect(err) + " transaction_id: " + transaction.id + " status: " + status + " message: " + message);
      }
    });
}

/**
 * Call the Dwolla guest send api to process the transaction
 */
function dwolla_guest_send(info,deferred)
{
  var url = config.payment_api_url;
  console.log("resolve");
  deferred.resolve();
}

/**
 * Checks the jobs folder for new job files
 */
function check_for_jobs()
{
  fs.readdir(config.job_path,
    function(err,files)
    {
      
    });
}

console.log("starting...");
private_key_string = fs.readFileSync(config.private_key_path,"utf8");
console.log("private key loaded, monitoring: " + config.job_path);

setInterval(check_for_jobs, config.process_jobs_frequency);

