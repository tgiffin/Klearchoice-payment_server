rsa = require("ursa");
fs = require("fs");


exports.encrypt = function(message,public_key_string)
{
  var pub_key = rsa.createPublicKey(public_key_string);
  return pub_key.encrypt(message,"utf8","base64");
}

exports.decrypt = function(message,private_key_string)
{
  var priv_key = rsa.createPrivateKey(private_key_string);
  return priv_key.decrypt(message,"base64","utf8");
}
