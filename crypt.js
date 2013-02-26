rsa = require("ursa");
fs = require("fs");


exports.encrypt = function(message,public_key_path)
{
  var pub_key = rsa.createPublicKey(fs.readFileSync(public_key_path));
  return pub_key.encrypt(message,"utf8","base64");
}

exports.decrypt = function(message,private_key_path)
{
  var priv_key = rsa.createPrivateKey(fs.readFileSync(private_key_path));
  return priv_key.decrypt(message,"base64","utf8");
}
