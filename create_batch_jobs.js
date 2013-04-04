#!/usr/local/bin/node
/**
 * create_batch_jobs.js
 *
 *
 * Query database for unprocessed payment transactions. 
 * Create a batch file for later processing.
 * Update database, setting transaction status to 'batched' and the batch id to the correct number.
 *
 * The flow of the statuses in the transactions table is:
 *
 * 1. new - a newly created transaction
 * 2. batched - when a transaction has been added to a batch job, but has not been processed
 * 3. processed - when a transaction has been sent to the processor, but not settled
 * 4. settled - after the processor has notified us of a successful settlement
 * 5. err - if there was a problem with the transaction. this should be detailed in the log column
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
var mysql = require("mysql");
var console = require("console");
var util = require("util");
var fs = require("fs");

function create_batch_job()
{
  console.log((new Date()).toString() + " Starting batch job...");
  //open the database connection
  var cn = mysql.createConnection(
    {
      host: config.db_host,
      user: config.db_user,
      database: "klearchoice",
      password: config.db_password
    });

  //connect to the databaes
  cn.connect(
    function(err)
    {
      if(err)
      {
        console.error((new Date()).toString() + " ERROR: Unable to connect to the database: " + util.inspect(err));
      }
    });

  //handle database errors
  cn.on("error",
    function(err)
    {
      console.error((new Date()).toString() + " ERROR: database error: " + util.inspect(err));
    });

  //get all unprocessed transactions
  //first, get the batch control file
  var batch_control = JSON.parse(fs.readFileSync(config.batch_control_file));
  batch_control.last_batch_id++;
  batch_control.last_batch_date = (new Date()).toString();
  var batch_id = batch_control.last_batch_id;

  console.log((new Date()).toString() + " creating batch_id: " + batch_id);

  //next, update all 'new' rows with the batch id, and 'batched' status
  cn.query("update transactions set status='batched', batch_id=?, batch_date=now() where status='new';",[batch_id],
    function(err,rows)
    {
      if(err)
      {
        console.error((new Date()).toString() + " database error creating batch: " + util.inspect(err));
      }
      //get all the records we tagged with the batch id
      cn.query("select " + 
                      ["transactions.id as id",
                      "donor_id",
                      "charity_id",
                      "amount",
                      "klearchoice_fee",
                      "processor_fee",
                      "batch_id",
                      "donor.first_name as first_name",
                      "donor.last_name as last_name",
                      "donor.email as email",
                      "charity.charity_name as charity_name",
                      "charity.dwolla_id as destination_id"].join(",") + 
                " from transactions " + 
                " join charity on charity.id = charity_id " + 
                " join donor on donor.id = donor_id " + 
                " where batch_id=?",[batch_id],
        function(err,rows)
        {
          if(err)
          {
            console.error((new Date()).toString() + " error retrieving transaction rows: " + util.inspect(err));
          }

          var batch = {
            batch_id: batch_id,
            batch_date: batch_control.last_batch_date,
            transactions: rows
          }

          if(rows.length == 0)
          {
            console.log((new Date()).toString() + " no new transactions");
          }
          else
          {
            console.log((new Date()).toString() + " creating batch job " + batch_id + " with " + rows.length + " transactions");
            //write the updated batch control file
            fs.writeFileSync(config.batch_control_file,JSON.stringify(batch_control));
            //write the job file
            fs.writeFileSync(config.job_path + "/" + batch_id + ".json", JSON.stringify(batch));
          }

          //close the connection
          cn.end();
        });
    });

}
//create_batch_job();
setInterval(create_batch_job,config.create_batch_frequency);
