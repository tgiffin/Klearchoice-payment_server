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
 * clay       3.4.2013        More work on payment processing
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
var _ = require("underscore");
var file_queue = [];
var request = require("request");
var errors = [];

/**
 * Read a job file and process each row. Update the database status of each transaction.
 */
function process_file()
{

  //clear out the errors
  errors = [];

  //the first thing we do is move the file over to the processing folder. This is to ensure
  //that a donor doesn't accidentally get charged twice if a batch fails and the file stays
  //in the jobs path
  if(file_queue.length == 0) return;
  var file = file_queue.shift();
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
  Q.allResolved(promises).then(
    function(proms)
    {
      var counts = _.countBy(proms,
        function(promise)
        {
          return promise.isFulfilled() ? 'success' : 'error';
        });
      console.log("completed processing batch_id: " + parsed_file.batch_id + " successful transactions: " + counts.success + " failed: " + counts.error);
      process_file(); //process the next file in the queue
    });
}

/**
 * Process an individual transaction from the batch file
 * transaction object looks like:
 *
 * {
 *  id: <transaction id>,
 *  donor_id: <klearchoice donor id>,
 *  charity_id: <klearchoice charity id>,
 *  amount: <amount of donation>,
 *  klearchoice_fee: <amount of klearchoice fee>,
 *  processor_fee: <amount the processor charges, i.e. the dwolla fee>,
 *  batch_id: <batch id>,
 *  first_name: <donor first name>,
 *  last_name: <donor last name>,
 *  email: <donor email>,
 *  charity_name: <the name of the receiving charity>,
 *  destination_id: <the dwolla account id of the charity>
 * }
 *
 */
function process_transaction(transaction)
{
  var d = Q.defer();
  var e = {
    transaction_id: transaction.id,
    batch_id: transaction.batch_id,
    error: err
  };

  try
  {
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

    //send to dwolla for processing
    var url = config.payment_api_url;
    request(
      {
        url: config.payment_api_url,
        method: "POST",
        json: {
          client_id: config.dwolla_app_id,
          client_secret: config.dwolla_app_secret,
          destinationId: transaction.destination_id,
          amount: transaction.amount,
          firstName: transaction.first_name,
          lastName: transaction.last_name,
          emailAddress: transaction.email,
          routingNumber: account_info.routing_number,
          accountNumber: account_info.acccount_number,
          accountType: account_info.account_type,
          assumeCosts: true,
          destinationType: 'Dwolla',
          notes: "Online Donation to " + transaction.charity_name,
          groupId: transaction.charity_id,
          additionalFees: [
            {
              config.dwolla_id,
              transaction.klearchoice_fee
            }
          ]
        }
      },
      //http request callback
      function(err, reponse, body)
      {
        
        if(err)
        {
          console.log("Error sending transaction: " + transaction.id + " to Dwolla. Error: " + util.inspect(err));
          e.error = err;
          errors.push(e);
          d.reject(e);
          return;
        }
        if(!body.Success)
        {
          e.error = body.Message;
          errors.push(e);
          d.reject(e);
          return;
        }

        d.resolve();

      });

  }
  catch(err)
  {
    console.log("error processing transaction: " + transaction.id + " error: " + util.inspect(err));
    e.error = err;
    update_transaction_status(transaction,'error',util.inspect(err));
    d.reject(e);
  }
  
  return d.promise;

}

/**
 * Update the status of the transaction in the database
 */
function update_transaction_status(transaction,status,message,processor_transaction_id,deferred)
{
  message = (new Date()).toString() + message;
  cn.query("update transactions set status=?, message=?, log=concat(coalesce(log,''),?), processor_transaction_id=? where id=?", [status,message,message + "\n",transaction.id,processor_transaction_id],
    function(err,rows)
    {
      if(err)
      {
        console.error("error updating transaction status: " + util.inspect(err) + " transaction_id: " + transaction.id + " status: " + status + " message: " + message);
        var e = {
          transaction_id: transaction.id,
          batch_id: batch_id,
          error: err
        };
        if(deferred) deferred.reject(e);
      }
    });
}

/**
 * Call the Dwolla guest send api to process the transaction
 */
function dwolla_guest_send(info,deferred)
{
  setTimeout(function()
  {
    console.log("resolve");
    deferred.resolve();
  },100);
}

function connect_to_database(callback)
{
  if(cn && connected)
  {
    callback(null);
    return;
  }

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
      callback(null);

    });

  //handle database errors
  cn.on("error",
    function(err)
    {
      console.error("ERROR: database error: " + util.inspect(err));
      connected=false;
      callback(err);
    });
}

/**
 * Checks the jobs folder for new job files
 */
function check_for_jobs()
{

  connect_to_database(
    function(err)
    {
      if(err) return;

      //now that we have a valid db connection, we can check for new jobs
      console.log("checking for new job files...");
      fs.readdir(config.job_path,
        function(err,file_list)
        {
          file_queue = _.union(file_queue,file_list);
          process_file();
        });
      
    });

}

console.log("starting...");
private_key_string = fs.readFileSync(config.private_key_path,"utf8");
console.log("private key loaded, monitoring: " + config.job_path);
check_for_jobs();
//setInterval(check_for_jobs, config.process_jobs_frequency);

