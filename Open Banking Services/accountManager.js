
var crypto 		= require('crypto');
var MongoDB 	= require('mongodb').Db;
var Server 		= require('mongodb').Server;
var moment 		= require('moment');
var Promise = require("bluebird");
var request = require('request');
var moment = require('moment')

/*
	ESTABLISH DATABASE CONNECTION
*/

var dbName = process.env.DB_NAME || 'BARCLAYS';
var dbHost = process.env.DB_HOST || 'localhost'
var dbPort = process.env.DB_PORT || 27017;

var db = new MongoDB(dbName, new Server(dbHost, dbPort, {auto_reconnect: true}), {w: 1});
db.open(function(e, d){
	if (e) {
		console.log(e);
	} else {
		if (process.env.NODE_ENV == 'live') {
			db.authenticate(process.env.DB_USER, process.env.DB_PASS, function(e, res) {
				if (e) {
					console.log('mongo :: error: not authenticated', e);
				}
				else {
					console.log('mongo :: authenticated and connected to database :: "'+dbName+'"');
				}
			});
		}	else{
			console.log('mongo :: connected to database :: "'+dbName+'"');
		}
	}
});

var accounts = db.collection('accounts');
var transactions = db.collection('transactions');
var groups = db.collection('groups');
var banks = db.collection('banks');

exports.getBanksBySecret = function(email, secret, callback)
{
	accounts.findOne({email:email,secret:secret},function(e,res){
		if(!e){
			callback(res.bankDetails);
		}
		else {
			callback(null);
		}
	})
}

exports.getBanksByEmail = function(email, callback)
{
	accounts.findOne({email:email},function(e,res){
		if(!e){
			callback(res.bankDetails, email);
		}
		else {
			callback(null);
		}
	})
}

exports.getBanks = function(groupName,callback)
{
	banks.find({groupName:groupName}).toArray(function(e,res){
		if(res.length != 0)
		{
			callback(res);
		}
		else {
			callback([]);
		}
	})
}

exports.getBanksBy = function(email, callback)
{
	banks.find({email:email}).toArray(function(e,res){
		if(res.length!=0)
		{
			callback(res);
		}
		else {
			callback([]);
		}
	})
}


exports.getMembers = function(groupName, callback)
{
	groups.findOne({groupName:groupName},function(e,res){
		if(res.members != undefined){
			callback(res.members);
		}
	})
}

exports.createGroup = function(email, secret, groupName, pass, callback)
{
	accounts.findOne({email:email,secret:secret},function(e,res){
		res['groupName'] = groupName;
		res['groupPass'] = pass;

		var toInsert = {
			groupName : groupName,
			members : [{
				email : email,
				name : res.name,
				online : true
			}]
		}

		groups.insert(toInsert);
		banks.updateMany({email:email},{$set:{groupName:groupName}});
		accounts.save(res,{safe:true},callback(res));
	});
}

exports.joinGroup = function(email, groupName, pass, name, callback)
{
	groups.findOne({groupName:groupName},function(e,res){
		if(!e){
			var toInsert = {
				email : email,
				name : name,
				online : true
			}
			//			accounts.update({email:email},{$set:{joinedGroup:true}});
			res.members.push(toInsert);
			groups.save(res,{safe:true});
			banks.updateMany({email:email},{$set:{groupName:groupName}});

			accounts.findOne({email:email},function(e,res){
				if(res.joinedGroup == undefined){
					res['joinedGroup'] = true;
					res['groupName'] = groupName;
					accounts.save(res,{safe:true},callback(res));

				}
				else {
					res.joinedGroup = true;
					accounts.save(res,{safe:true},callback(res));
				}
			})

		}
		else {
			callback("No Group");
		}
	})
}

exports.checkGroupPresent = function(email, callback)
{
	accounts.findOne({email:email},function(e,res){
		if(!e){
			if(res.joinedGroup != undefined){
				if(res.joinedGroup == true){
					callback(true);
				}
				else {
					callback(false);
				}
			}
			else {
				callback(false);
			}
		}
	})
}

exports.placeTransaction = function(email, amount, group, callback)
{
	groups.findOne({groupName:group},function(e,res){
		if(res != null){
			var transaction = {
				TID : email.substr(0,3) + moment().format('x'),
				email : email,
				amount : amount,
				date : new Date(),
				status : false
			}

			if(res.transactions == undefined){
				res['transactions'] = [];
				res.transactions.push(transaction);
				groups.save(res,{safe:true},callback("Transaction Placed"));
			}
			else {
				res.transactions.push(transaction);
				groups.save(res,{safe:true},callback("Transaction Placed"));
			}
		}
	})
}

exports.performTransactionGroup = function(TID, group, amount, callback)
{
	groups.findOne({groupName:group},function(e,res){
		if(res!=null){
			var perform = function(i, transactions, callback)
			{
				if(res.transactions[i].TID == TID){
					res.transactions[i].amount = res.transactions[i].amount - parseFloat(amount);
					if(res.transactions[i].amount == 0){
						res.transactions[i].status = true;
					}
				}

				i = i + 1;
				if(i != res.transactions.length){
					perform(i, transactions, callback);
				}
				else {
					groups.save(res,{safe:true},callback("Transaction Updated"));
				}
			}
			perform(0, res.transactions, callback);
		}
	})
}

exports.getBankDetails = function(email, callback)
{
	accounts.findOne({email:email},function(e,res){
		if(res != null){
			var details = {
				"bank" : res.bankDetails[0].bank,
				"account" : res.bankDetails[0].account
			}
			callback(details);
		}
	})
}

exports.getTransactionsGroup = function(group, callback)
{
	groups.findOne({groupName:group},function(e,res){
		if(res != null){
			var pending = [];

			if(res.transactions != undefined){
				var statusFalse = function(i, pending, transactions, callback)
				{
					if(res.transactions[i].status == false){
						pending.push(res.transactions[i]);
					}

					i = i + 1;
					if(i != res.transactions.length){
						statusFalse(i, pending, transactions, callback);
					}
					else {
						callback(pending);
					}
				}
				statusFalse(0, pending, res.transactions, callback);
			}
			else {
				callback([]);
			}
		}
	})
}


exports.saveTransaction = function(tr, callback)
{
	transactions.insert(tr,callback("Inserted"));
}

exports.getAccountViaToken = function(email, token, callback)
{
	accounts.findOne({email:email,twoFA:token},function(e,res){
		if(!e){
			callback(res);
		}
		else {
			callback(null);
		}
	})
}


exports.setCode = function(email, id, callback)
{
	accounts.update({email:email},{$set:{twoFA:id}},callback(id));
}

exports.manualLogin = function(email, pass, callback)
{
	accounts.findOne({email:email}, function(e, o) {
		if (o == null){
			callback('user-not-found');
		}	else{
			validatePassword(pass, o.pass, function(err, res) {
				console.log(o.pass)
				if (res){
					callback(null, o);
				}	else{
					callback('invalid-password');
				}
			});
		}
	});
}

exports.addBankAccount = function(email, bank, account, permission, callback)
{
	accounts.findOne({email:email},function(e,res){
		if(res != null){
			if(res.bankDetails == undefined) res['bankDetails'] = [];
			var details = {
				bank : bank,
				account : account,
				permission : permission,
				email : email
			}

			res.bankDetails.push(details);
			banks.insert(details);
			accounts.save(res,{safe:true},callback(res));

		}
	})
}


exports.addNewAccount = function(newData, callback)
{
	accounts.findOne({email:newData.email}, function(e, o) {
		if (o){
			callback('username-taken');
		}	else{
			accounts.findOne({email:newData.email}, function(e, o) {
				if (o){
					callback('email-taken');
				}	else{
					saltAndHash(newData.pass, function(hash){
						newData.pass = hash;
					// append date stamp when record was created //
						newData.date = moment().format('MMMM Do YYYY, h:mm:ss a');
						accounts.insert(newData, {safe: true}, callback);
					});
				}
			});
		}
	});
}


/* private encryption & validation methods */

var generateSalt = function()
{
	var set = '0123456789abcdefghijklmnopqurstuvwxyzABCDEFGHIJKLMNOPQURSTUVWXYZ';
	var salt = '';
	for (var i = 0; i < 10; i++) {
		var p = Math.floor(Math.random() * set.length);
		salt += set[p];
	}
	return salt;
}

var md5 = function(str) {
	return crypto.createHash('md5').update(str).digest('hex');
}

var saltAndHash = function(pass, callback)
{
	var salt = generateSalt();
	callback(salt + md5(pass + salt));
}

var validatePassword = function(plainPass, hashedPass, callback)
{
	var salt = hashedPass.substr(0, 10);
	var validHash = salt + md5(plainPass + salt);
	console.log(validHash)
	callback(null, hashedPass === validHash);
}
