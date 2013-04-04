#!/usr/local/bin/node
/** 
 * process_incoming_accounts.js
 *
 *
 * Monitor the "incoming" path for new account files and move them to their proper location.
 * Final location is based on last name, first name and donor_id.
 *
 * Destination path is config.account_path, file name is <donor_id>.json
 *
 * file format is:
 * 
 * {
 *   "donor_id":<donor id>,
 *   "first_name":<first name>,
 *   "last_name":<last name>,
 *   "email": <email>,
 *   "account": <base64 encoded rsa encryption field>
 * }
 *
 * where the account field is base64 encoded rsa encrypted field that looks like:
 * {
 *   "account_number":<bank account number>,
 *   "routing_number":<bank routing number>,
 *   "account_type":<either "Checking" or "Savings">
 * }
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

var fs = require("fs");
var console = require("console");
var util = require("util");

var config = require("./config");

console.log((new Date()).toString() + " starting, watching for new files in: " + config.incoming_account_path);

//get list of files
//var files = fs.readdirSync(config.incoming_account_path);
//files.forEach(
fs.watch(config.incoming_account_path,
  {
    persistent: true
  },
  function(event,file)
  {
    //we don't care about deleted file events
    if(event == "rename") return;

    console.log((new Date()).toString() + " detected change: " + event + " file: " + file);
    try
    {
      var source_path = config.incoming_account_path + "/" + file;
      console.log((new Date()).toString() + " processing: " + source_path);
      var file_contents = fs.readFileSync(source_path);
      var parsed_file = JSON.parse(file_contents);
      var top_dir = parsed_file.last_name.toLowerCase().substr(0,2);
      var bottom_dir = parsed_file.first_name.toLowerCase().substr(0,2);
      
      var dest_path = config.account_path + "/" + top_dir;

      if(!fs.existsSync(dest_path))
        fs.mkdirSync(dest_path);

      dest_path += "/" + bottom_dir;
      if(!fs.existsSync(dest_path))
        fs.mkdirSync(dest_path);

      dest_path += "/" + parsed_file.donor_id + ".json";
      fs.writeFileSync(dest_path,file_contents);

      fs.unlinkSync(source_path);
      
    }
    catch(e)
    {
      console.error((new Date()).toString() + util.inspect(e)); 
      var err = {
                  error: e.message,
                  date: (new Date()).toString(),
                  file: file
                };
      fs.writeFileSync(config.error_path + "/" + file + ".err",JSON.stringify(err));
    }
    
  });

